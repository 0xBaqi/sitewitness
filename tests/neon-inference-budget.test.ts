import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { createAnalyzeHandler } from "../lib/server/analyze";
import { NeonInferenceBudget } from "../lib/server/neon-inference-budget";
import type { Database, Sql } from "../lib/server/remote-store";

const engine=new PGlite();
const token="a".repeat(43), now=Date.UTC(2026,10,3,12);
const users=JSON.stringify([{id:"judge_a",tokenHash:createHash("sha256").update(token).digest("hex")}]);
const env=()=>({
 VERCEL:"1",SITEWITNESS_STORAGE_PROVIDER:"neon-blob",INSPECTION_STORAGE_ENABLED:"true",
 SITEWITNESS_PUBLIC_ORIGIN:"https://sitewitness.example",SITEWITNESS_USERS:users,
 INFERENCE_ENABLED:"true",MODEL_API_KEY:"SYNTHETIC_KEY",DATABASE_URL:"postgres://not-opened",
 INFERENCE_USER_DAILY_LIMIT:"2",INFERENCE_DAILY_LIMIT:"4",INFERENCE_CALL_LIMIT:"5",
});
const database:Database={
 transaction:fn=>engine.transaction(tx=>fn({query:(text,values)=>tx.query(text,values)} as Sql)),
 close:async()=>{},
};
const factory=()=>new NeonInferenceBudget(database);
const seed=async(count:number,source="3".repeat(64))=>factory().importCounters(source,[{name:"inference-lifetime",count,until:Number.MAX_SAFE_INTEGER}],now);
const report={overview:"SYNTHETIC TEST",findings:[],unanswered_questions:[],notice:"SYNTHETIC TEST"};
const png=()=>sharp({create:{width:8,height:8,channels:3,background:"#234567"}}).png().toBuffer();
async function request(options:{access?:string;origin?:string;bytes?:Buffer;type?:string;question?:string}={}){
 const bytes=options.bytes?Uint8Array.from(options.bytes):Uint8Array.from(await png());
 const form=new FormData();form.append("photo",new Blob([bytes],{type:options.type??"image/png"}),"test.png");form.append("question",options.question??"SYNTHETIC TEST: describe visible elements");
 return new Request("https://sitewitness.example/api/analyze",{method:"POST",body:form,headers:{authorization:`Bearer ${options.access??token}`,origin:options.origin??"https://sitewitness.example"}});
}

after(async()=>engine.close());
beforeEach(async()=>{
 await engine.exec(readFileSync("deploy/migrations/009-neon.sql","utf8"));
 await engine.exec(readFileSync("deploy/migrations/010-neon-inference-budget.sql","utf8"));
 await engine.exec("CREATE TABLE IF NOT EXISTS sw_inference_policy_audit (revision text PRIMARY KEY, epoch_id text NOT NULL, reason text NOT NULL, prior_limits jsonb NOT NULL, new_limits jsonb NOT NULL, prior_counters jsonb NOT NULL, prior_exhausted_gates jsonb NOT NULL, applied_at_ms bigint NOT NULL)");
 await engine.exec("TRUNCATE sw_counters,sw_counter_imports,sw_inference_policy_audit");
 await engine.query("UPDATE sw_inference_epochs SET global_daily_limit=4,per_identity_daily_limit=2,lifetime_limit=5 WHERE id='judge-v1-legacy-unknown'");
});
test("unknown legacy history is isolated and preserved while the finite new epoch reserves",async()=>{
 const store=factory();
 await store.reserveAnalysis("judge_a",2,4,5,now);
 const epochRow=(await engine.query("SELECT legacy_lifetime_state FROM sw_inference_epochs WHERE id='judge-v1-legacy-unknown'")).rows[0] as {legacy_lifetime_state:string};
 assert.equal(epochRow.legacy_lifetime_state,"unknown");
 const source="1".repeat(64),counters=[
  {name:"analysis-attempts",count:59,until:now+60000},
  {name:"analysis-decodes",count:9,until:now+3600000},
  {name:"analysis-daily-2026-11-03",count:3,until:Date.UTC(2026,10,4)},
  {name:"inference-lifetime",count:2,until:Number.MAX_SAFE_INTEGER},
 ];
 assert.deepEqual(await store.importCounters(source,counters,now),{count:2});
 assert.deepEqual(await store.importCounters(source,counters,now+1),{count:2});
 await engine.query("UPDATE sw_counters SET count=4 WHERE name='inference-lifetime'");
 assert.deepEqual(await store.importCounters("2".repeat(64),counters,now+2),{count:4});
 const persisted=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows as {count:number}[];
 assert.equal(Number(persisted[0].count),4);
 const attempts=(await engine.query("SELECT count FROM sw_counters WHERE name='analysis-attempts'")).rows as {count:number}[];
 assert.equal(Number(attempts[0].count),59);
 await store.consume("analysis-attempts",60,60000,now);
 await assert.rejects(()=>store.consume("analysis-attempts",60,60000,now),{status:429});
 await store.reserveAnalysis("judge_a",2,4,5,now);
 await assert.rejects(()=>store.reserveAnalysis("judge_a",2,4,5,now),{status:429});
 const unchanged=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows as {count:number}[];
 assert.equal(Number(unchanged[0].count),4);
});

test("judge policy increase is audited in place and preserves all previously exhausted counters",async()=>{
 const date=new Date(now).toISOString().slice(0,10),until=Date.UTC(2026,10,4);
 await engine.query("UPDATE sw_inference_epochs SET global_daily_limit=5,per_identity_daily_limit=2,lifetime_limit=10 WHERE id='judge-v1-legacy-unknown'");
 await engine.query("INSERT INTO sw_counters(name,count,until_ms) VALUES($1,2,$4),($2,5,$4),($3,10,$5)",["inference-epoch-judge-v1-legacy-unknown-identity-ip_test-"+date,"inference-epoch-judge-v1-legacy-unknown-daily-"+date,"inference-epoch-judge-v1-legacy-unknown-lifetime",until,Number.MAX_SAFE_INTEGER]);
 await factory().reserveAnalysis("ip_test",40,100,1000,now);
 const audit=(await engine.query("SELECT prior_limits,new_limits,prior_counters,prior_exhausted_gates FROM sw_inference_policy_audit WHERE revision='judge-policy-g100-i40-l1000'")).rows[0] as {prior_limits:{globalDaily:number;perIdentityDaily:number;lifetime:number};new_limits:{globalDaily:number;perIdentityDaily:number;lifetime:number};prior_counters:Record<string,number>;prior_exhausted_gates:string[]};
 assert.deepEqual(audit.prior_limits,{globalDaily:5,perIdentityDaily:2,lifetime:10});
 assert.deepEqual(audit.new_limits,{globalDaily:100,perIdentityDaily:40,lifetime:1000});
 assert.deepEqual(audit.prior_exhausted_gates,["per-ip-daily","global-daily","lifetime-epoch"]);
 assert.equal(audit.prior_counters["inference-epoch-judge-v1-legacy-unknown-lifetime"],10);
 const after=(await engine.query("SELECT name,count FROM sw_counters WHERE name LIKE 'inference-epoch-judge-v1-legacy-unknown-%'")).rows as Array<{name:string;count:number}>;
 assert.deepEqual(after.map(x=>Number(x.count)).sort((a,b)=>a-b),[3,6,11]);
});

test("serverless analyze authenticates per-person bearer tokens and atomically persists concurrent allowances",async()=>{
 await seed(2);
 let calls=0;const handler=createAnalyzeHandler({env,store:factory,now:()=>now,infer:async()=>{calls++;return report;}});
 const invalid=await handler(await request({access:"b".repeat(43)}));assert.equal(invalid.status,401);
 const cross=await handler(await request({origin:"https://attacker.invalid"}));assert.equal(cross.status,403);
 const replies=await Promise.all(Array.from({length:6},async()=>handler(await request())));
 assert.equal(replies.filter(r=>r.status===200).length,2);
 assert.equal(replies.filter(r=>r.status===429).length,4);
 assert.equal(calls,2);
 const counters=(await engine.query("SELECT name,count FROM sw_counters ORDER BY name")).rows as {name:string;count:number}[];
 assert.equal(Number(counters.find(r=>r.name.includes("-identity-judge_a-"))?.count),2);
 assert.equal(Number(counters.find(r=>r.name.includes("-daily-2026-11-03"))?.count),2);
 assert.equal(Number(counters.find(r=>r.name==="inference-lifetime")?.count),2);
 const afterRestart=await handler(await request());assert.equal(afterRestart.status,429);
});

test("serverless deployment origin follows its exact Vercel Preview hostname",async()=>{
 const dynamicEnv=()=>({...env(),VERCEL_URL:"sitewitness-preview.vercel.app"});
 const handler=createAnalyzeHandler({env:dynamicEnv,store:factory,now:()=>now,infer:async()=>report});
 assert.equal((await handler(await request({origin:"https://sitewitness-preview.vercel.app"}))).status,200);
 assert.equal((await handler(await request({origin:"https://another-preview.vercel.app"}))).status,403);
});

test("public same-origin requests need no token and retain atomic per-IP and lifetime allowances",async()=>{
 await seed(0,"8".repeat(64));
 const publicEnv=()=>({...env(),SITEWITNESS_PUBLIC_ANALYSIS:"true",SITEWITNESS_STORAGE_KEY:"9".repeat(64),INFERENCE_IP_DAILY_LIMIT:"1"});
 await engine.query("UPDATE sw_inference_epochs SET per_identity_daily_limit=1 WHERE id='judge-v1-legacy-unknown'");
 let calls=0;const handler=createAnalyzeHandler({env:publicEnv,store:factory,now:()=>now,infer:async()=>{calls++;return report;}});
 const publicRequest=async(ip:string)=>{const req=await request();req.headers.delete("authorization");req.headers.set("x-forwarded-for",ip);return handler(req);};
 const sameIp=await Promise.all([publicRequest("203.0.113.7"),publicRequest("203.0.113.7"),publicRequest("203.0.113.7")]);
 assert.equal(sameIp.filter(r=>r.status===200).length,1);
 assert.equal(sameIp.filter(r=>r.status===429).length,2);
 assert.equal((await publicRequest("203.0.113.8")).status,200);
 assert.equal(calls,2);
 const counters=(await engine.query("SELECT name,count FROM sw_counters ORDER BY name")).rows as {name:string;count:number}[];
 assert.equal(Number(counters.find(r=>r.name==="inference-lifetime")?.count),0);
 assert.equal(Number(counters.find(r=>r.name.includes("-daily-2026-11-03"))?.count),2);
 assert.equal(Number(counters.filter(r=>r.name.includes("-identity-ip_")).length),2);
 assert.equal((await publicRequest("203.0.113.8")).status,429);
 assert.equal((await publicRequest("not-an-ip")).status,503);
 const cross=await request();cross.headers.delete("authorization");cross.headers.set("origin","https://attacker.invalid");cross.headers.set("x-forwarded-for","203.0.113.9");
 assert.equal((await handler(cross)).status,403);
 assert.equal(calls,2);
});

test("Neon reservation enforces the configured lifetime ceiling",async()=>{
 await engine.query("UPDATE sw_inference_epochs SET global_daily_limit=10 WHERE id='judge-v1-legacy-unknown'");
 const store=factory();
 await store.reserveAnalysis("judge_a",2,10,5,now);
 await store.reserveAnalysis("judge_b",2,10,5,now);
 await store.reserveAnalysis("judge_c",2,10,5,now);
 await store.reserveAnalysis("judge_d",2,10,5,now);
 await store.reserveAnalysis("judge_e",2,10,5,now);
 await assert.rejects(()=>store.reserveAnalysis("judge_f",2,10,5,now),error=>error instanceof Error&&error.message.includes("finite analysis allowance"));
 const lifetime=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-epoch-judge-v1-legacy-unknown-lifetime'")).rows[0] as {count:number};
 assert.equal(Number(lifetime.count),5);
});

test("per-network and shared daily exhaustion explain which allowance is full",async()=>{
 await engine.query("UPDATE sw_inference_epochs SET global_daily_limit=2,per_identity_daily_limit=1,lifetime_limit=10 WHERE id='judge-v1-legacy-unknown'");
 const store=factory();
 await store.reserveAnalysis("ip_one",1,2,10,now);
 await assert.rejects(()=>store.reserveAnalysis("ip_one",1,2,10,now),error=>error instanceof Error&&error.message.includes("This network has reached today's analysis allowance"));
 await store.reserveAnalysis("ip_two",1,2,10,now);
 await assert.rejects(()=>store.reserveAnalysis("ip_three",1,2,10,now),error=>error instanceof Error&&error.message.includes("Today's shared analysis allowance is full"));
});

test("serverless validation and upstream failures do not refund reserved inference allowance",async()=>{
 await seed(4,"4".repeat(64));
 let calls=0;const handler=createAnalyzeHandler({env,store:factory,now:()=>now,infer:async()=>{calls++;throw new Error("SYNTHETIC UPSTREAM FAILURE");}});
 const wrongMime=await handler(await request({type:"text/plain"}));assert.equal(wrongMime.status,415);
 const malformed=await handler(new Request("https://sitewitness.example/api/analyze",{method:"POST",headers:{authorization:`Bearer ${token}`,origin:"https://sitewitness.example","content-type":"multipart/form-data; boundary=X"},body:"broken"}));assert.equal(malformed.status,400);
 const image=await request();const failed=await handler(image);assert.equal(failed.status,500);assert.equal(calls,1);
 const result=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows[0] as {count:number}|undefined;
 assert.equal(Number(result?.count),4);
 const secondFailure=await handler(await request());assert.equal(secondFailure.status,500);assert.equal(calls,2);
 const exhausted=await handler(await request());assert.equal(exhausted.status,429);assert.equal(calls,2);
});

test("serverless budget dry-run validates and persists allowances without invoking Meta",async()=>{
 let calls=0;
 const dryEnv=()=>({...env(),INFERENCE_ENABLED:"false",INFERENCE_BUDGET_DRY_RUN:"true",MODEL_API_KEY:""});
 const handler=createAnalyzeHandler({env:dryEnv,store:factory,now:()=>now,infer:async()=>{calls++;return report;}});
 const first=await handler(await request());assert.equal(first.status,503);
 assert.match((await first.json()).error,/No model request was made/);
 const second=await handler(await request());assert.equal(second.status,503);
 const exhausted=await handler(await request());assert.equal(exhausted.status,429);
 assert.equal(calls,0);
 const lifetime=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-epoch-judge-v1-legacy-unknown-lifetime'")).rows as {count:number}[];
 assert.equal(Number(lifetime[0].count),2);
});
