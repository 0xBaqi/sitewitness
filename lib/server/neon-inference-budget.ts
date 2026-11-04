import { ServiceError } from "./errors";
import { openNeonDatabase } from "./remote-provider";
import type { Database, Sql } from "./remote-store";

const maxCounter=Number.MAX_SAFE_INTEGER;
const counterValue=(value:unknown)=>{
 const n=typeof value==="number"?value:Number(value);
 if(!Number.isSafeInteger(n)||n<0)throw new ServiceError(503,"Usage protection is unavailable.");
 return n;
};

export class NeonInferenceBudget {
 constructor(private db:Database){}
 close(){return this.db.close();}

 private async locked<T>(fn:(sql:Sql)=>Promise<T>):Promise<T>{
  try{return await this.db.transaction(async sql=>{
    const lock=await sql.query("SELECT id FROM sw_lock WHERE id=1 FOR UPDATE");
    if(lock.rows.length!==1)throw new ServiceError(503,"Inference budget migration is incomplete.");
    return fn(sql);
   });}
  catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError(503,"Inference budget storage is unavailable.");}
 }

 async consume(name:string,max:number,window:number,now:number){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(name)||![max,window,now].every(Number.isSafeInteger)||max<0||window<1||now<0)
   throw new ServiceError(503,"Usage protection is unavailable.");
  const message=name.startsWith("analysis-burst-")?"Too many analyses from this network in a short period. Please wait before trying again.":name.startsWith("analysis-hour-")?"This network has reached its hourly analysis allowance. Try again after the wait shown.":name==="analysis-attempts"?"Analysis traffic is temporarily high. Please wait before trying again.":name==="analysis-decodes"?"The shared hourly analysis allowance is temporarily full. Try again later.":"Usage limit reached. Try again later.";
  return this.locked(async sql=>this.increment(sql,name,max,now+window,now,message));
 }

 async reserveAnalysis(userId:string,userDaily:number,globalDaily:number,lifetime:number,now:number){
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(userId)||![userDaily,globalDaily,lifetime,now].every(Number.isSafeInteger)||userDaily<0||globalDaily<0||lifetime<0||now<0)
   throw new ServiceError(503,"Usage protection is unavailable.");
  const date=new Date(now),day=date.toISOString().slice(0,10),nextMidnight=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
  return this.locked(async sql=>{
   // The policy revision raises ceilings in place. It never changes reservation
   // rows; a durable audit snapshot records the prior limits and live counters.
   await sql.query("CREATE TABLE IF NOT EXISTS sw_inference_policy_audit (revision text PRIMARY KEY, epoch_id text NOT NULL, reason text NOT NULL, prior_limits jsonb NOT NULL, new_limits jsonb NOT NULL, prior_counters jsonb NOT NULL, prior_exhausted_gates jsonb NOT NULL, applied_at_ms bigint NOT NULL)");
   const result=await sql.query("SELECT id,legacy_lifetime_state,global_daily_limit,per_identity_daily_limit,lifetime_limit FROM sw_inference_epochs WHERE id='judge-v1-legacy-unknown' FOR UPDATE");
   const epoch=result.rows[0] as {id:string;legacy_lifetime_state:string;global_daily_limit:unknown;per_identity_daily_limit:unknown;lifetime_limit:unknown}|undefined;
   if(!epoch||epoch.legacy_lifetime_state!=="unknown")throw new ServiceError(503,"Inference budget epoch is missing or mismatched.");
   const oldLimits={globalDaily:Number(epoch.global_daily_limit),perIdentityDaily:Number(epoch.per_identity_daily_limit),lifetime:Number(epoch.lifetime_limit)};
   const newLimits={globalDaily,perIdentityDaily:userDaily,lifetime};
   const revision=`judge-policy-g${globalDaily}-i${userDaily}-l${lifetime}`;
   const priorAudit=(await sql.query("SELECT new_limits FROM sw_inference_policy_audit WHERE revision=$1",[revision])).rows[0] as {new_limits:unknown}|undefined;
   if(!priorAudit){
    if(globalDaily<oldLimits.globalDaily||userDaily<oldLimits.perIdentityDaily||lifetime<oldLimits.lifetime)
     throw new ServiceError(503,"Inference budget policy cannot reduce existing allowances.");
    const digest=userId.startsWith("ip_")?userId.slice(3):"";
    const names=[`inference-epoch-${epoch.id}-identity-${userId}-${day}`,`inference-epoch-${epoch.id}-daily-${day}`,`inference-epoch-${epoch.id}-lifetime`,...(digest?[`analysis-burst-${digest}`,`analysis-hour-${digest}`]:[]),"analysis-attempts","analysis-decodes"];
    const rows=(await sql.query("SELECT name,count,until_ms FROM sw_counters WHERE name=ANY($1::text[])",[names])).rows as Array<{name:string;count:unknown;until_ms:unknown}>;
    const counts=Object.fromEntries(rows.map(row=>[row.name,now<counterValue(row.until_ms)?counterValue(row.count):0]));
    // The rate counters were incremented earlier in this same request. Record
    // the count that the former policy evaluated, before this request's tick.
    const incrementedThisRequest=["analysis-attempts","analysis-decodes",...(digest?[`analysis-burst-${digest}`,`analysis-hour-${digest}`]:[])];
    const beforeRequest=(name:string)=>Math.max(0,(counts[name]??0)-(incrementedThisRequest.includes(name)?1:0));
    const exhausted:string[]=[];
    if(digest){if(beforeRequest(`analysis-burst-${digest}`)>=2)exhausted.push("per-ip-burst");if(beforeRequest(`analysis-hour-${digest}`)>=10)exhausted.push("per-ip-hour");}
    if(beforeRequest("analysis-attempts")>=60)exhausted.push("global-attempts-per-minute");
    if(beforeRequest("analysis-decodes")>=10)exhausted.push("global-decodes-per-hour");
    if((counts[names[0]]??0)>=oldLimits.perIdentityDaily)exhausted.push("per-ip-daily");
    if((counts[names[1]]??0)>=oldLimits.globalDaily)exhausted.push("global-daily");
    if((counts[names[2]]??0)>=oldLimits.lifetime)exhausted.push("lifetime-epoch");
    await sql.query("INSERT INTO sw_inference_policy_audit(revision,epoch_id,reason,prior_limits,new_limits,prior_counters,prior_exhausted_gates,applied_at_ms) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8)",[revision,epoch.id,"Raise finite judge-facing analysis allowances while preserving every existing counter; historical SQLite lifetime usage remains unknown.",JSON.stringify(oldLimits),JSON.stringify(newLimits),JSON.stringify(counts),JSON.stringify(exhausted),now]);
    await sql.query("UPDATE sw_inference_epochs SET global_daily_limit=$1,per_identity_daily_limit=$2,lifetime_limit=$3 WHERE id=$4",[globalDaily,userDaily,lifetime,epoch.id]);
    console.info("SITEWITNESS_INFERENCE_POLICY_AUDIT",JSON.stringify({revision,priorLimits:oldLimits,newLimits,priorExhaustedGates:exhausted}));
   }else {
    const recorded=priorAudit.new_limits as {globalDaily?:number;perIdentityDaily?:number;lifetime?:number};
    if(recorded.globalDaily!==globalDaily||recorded.perIdentityDaily!==userDaily||recorded.lifetime!==lifetime||oldLimits.globalDaily!==globalDaily||oldLimits.perIdentityDaily!==userDaily||oldLimits.lifetime!==lifetime)
    throw new ServiceError(503,"Inference budget policy is inconsistent with its audit record.");
   }
   // New epoch keys preserve every prior counter, including any prior lifetime row.
   // Lock and reserve every ceiling together so concurrent instances cannot overspend.
   const prefix=`inference-epoch-${epoch.id}`;
   await this.increment(sql,`${prefix}-identity-${userId}-${day}`,userDaily,nextMidnight,now,"This network has reached today's analysis allowance. Try again after UTC midnight.");
   await this.increment(sql,`${prefix}-daily-${day}`,globalDaily,nextMidnight,now,"Today's shared analysis allowance is full. Try again after UTC midnight.");
   await this.increment(sql,`${prefix}-lifetime`,lifetime,maxCounter,now,"This Preview's finite analysis allowance is exhausted. Contact the project owner.");
  });
 }

 async importCounters(sourceSha256:string,counters:Array<{name:string;count:number;until:number}>,now:number){
  if(!/^[a-f0-9]{64}$/.test(sourceSha256)||!Number.isSafeInteger(now)||now<0||!counters.length||!counters.some(counter=>counter.name==="inference-lifetime")||counters.some(counter=>! /^[a-zA-Z0-9_-]{1,100}$/.test(counter.name)||![counter.count,counter.until].every(Number.isSafeInteger)||counter.count<0||counter.until<0))
   throw new ServiceError(400,"Invalid counter import; the lifetime reservation is required.");
  return this.locked(async sql=>{
   let lifetimeCount=0;
   for(const item of counters){
    const current=(await sql.query("SELECT count,until_ms FROM sw_counters WHERE name=$1 FOR UPDATE",[item.name])).rows[0] as {count:unknown;until_ms:unknown}|undefined;
    const count=Math.max(current?counterValue(current.count):0,item.count);
    const until=Math.max(current?counterValue(current.until_ms):0,item.until,item.name==="inference-lifetime"?maxCounter:0);
    await sql.query("INSERT INTO sw_counters(name,count,until_ms) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET count=GREATEST(sw_counters.count,excluded.count),until_ms=GREATEST(sw_counters.until_ms,excluded.until_ms)",[item.name,count,until]);
    await sql.query("INSERT INTO sw_counter_imports(name,source_sha256,source_count,source_until_ms,imported_at_ms) VALUES($1,$2,$3,$4,$5) ON CONFLICT(name,source_sha256) DO UPDATE SET source_count=GREATEST(sw_counter_imports.source_count,excluded.source_count),source_until_ms=GREATEST(sw_counter_imports.source_until_ms,excluded.source_until_ms),imported_at_ms=GREATEST(sw_counter_imports.imported_at_ms,excluded.imported_at_ms)",[item.name,sourceSha256,item.count,item.until,now]);
    if(item.name==="inference-lifetime")lifetimeCount=count;
   }
   return {count:lifetimeCount};
  });
 }

 private async increment(sql:Sql,name:string,max:number,until:number,now:number,message:string){
  const result=await sql.query("SELECT count,until_ms FROM sw_counters WHERE name=$1 FOR UPDATE",[name]);
  const row=result.rows[0] as {count:unknown;until_ms:unknown}|undefined;
  const stored=row?counterValue(row.count):0;
  const expires=row?counterValue(row.until_ms):0;
  const active=!!row&&now<expires,count=active?stored:0,boundary=active?expires:until;
  if(count>=max)throw new ServiceError(429,message,Math.max(1,Math.ceil((boundary-now)/1000)));
  await sql.query("INSERT INTO sw_counters(name,count,until_ms) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET count=excluded.count,until_ms=excluded.until_ms",[name,count+1,boundary]);
 }
}

export function openNeonInferenceBudget(env:Record<string,string|undefined>){
 if(env.SITEWITNESS_STORAGE_PROVIDER!=="neon-blob"||env.INSPECTION_STORAGE_ENABLED!=="true")
  throw new ServiceError(503,"Serverless inference storage is disabled.");
 return new NeonInferenceBudget(openNeonDatabase(env));
}
