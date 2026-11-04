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
  return this.locked(async sql=>this.increment(sql,name,max,now+window,now));
 }

 async reserveAnalysis(userId:string,userDaily:number,globalDaily:number,lifetime:number,now:number){
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(userId)||![userDaily,globalDaily,lifetime,now].every(Number.isSafeInteger)||userDaily<0||globalDaily<0||lifetime<0||now<0)
   throw new ServiceError(503,"Usage protection is unavailable.");
  const date=new Date(now),day=date.toISOString().slice(0,10),nextMidnight=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
  return this.locked(async sql=>{
   const result=await sql.query("SELECT id,legacy_lifetime_state,global_daily_limit,per_identity_daily_limit,lifetime_limit FROM sw_inference_epochs WHERE id='judge-v1-legacy-unknown' FOR UPDATE");
   const epoch=result.rows[0] as {id:string;legacy_lifetime_state:string;global_daily_limit:unknown;per_identity_daily_limit:unknown;lifetime_limit:unknown}|undefined;
   if(!epoch||epoch.legacy_lifetime_state!=="unknown"||Number(epoch.global_daily_limit)!==globalDaily||Number(epoch.per_identity_daily_limit)!==userDaily||Number(epoch.lifetime_limit)!==lifetime)
    throw new ServiceError(503,"Inference budget epoch is missing or mismatched.");
   // New epoch keys preserve every prior counter, including any prior lifetime row.
   // Lock and reserve every ceiling together so concurrent instances cannot overspend.
   const prefix=`inference-epoch-${epoch.id}`;
   await this.increment(sql,`${prefix}-identity-${userId}-${day}`,userDaily,nextMidnight,now);
   await this.increment(sql,`${prefix}-daily-${day}`,globalDaily,nextMidnight,now);
   await this.increment(sql,`${prefix}-lifetime`,lifetime,maxCounter,now);
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

 private async increment(sql:Sql,name:string,max:number,until:number,now:number){
  const result=await sql.query("SELECT count,until_ms FROM sw_counters WHERE name=$1 FOR UPDATE",[name]);
  const row=result.rows[0] as {count:unknown;until_ms:unknown}|undefined;
  const stored=row?counterValue(row.count):0;
  const expires=row?counterValue(row.until_ms):0;
  const active=!!row&&now<expires,count=active?stored:0,boundary=active?expires:until;
  if(count>=max)throw new ServiceError(429,"Inference usage limit reached.",Math.max(1,Math.ceil((boundary-now)/1000)));
  await sql.query("INSERT INTO sw_counters(name,count,until_ms) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET count=excluded.count,until_ms=excluded.until_ms",[name,count+1,boundary]);
 }
}

export function openNeonInferenceBudget(env:Record<string,string|undefined>){
 if(env.SITEWITNESS_STORAGE_PROVIDER!=="neon-blob"||env.INSPECTION_STORAGE_ENABLED!=="true")
  throw new ServiceError(503,"Serverless inference storage is disabled.");
 return new NeonInferenceBudget(openNeonDatabase(env));
}
