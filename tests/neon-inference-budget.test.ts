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
 await engine.exec("TRUNCATE sw_counters,sw_counter_imports");
});
test("Neon inference budget requires the migrated lifetime counter and never lowers it",async()=>{
 const store=factory();
 await assert.rejects(()=>store.reserveAnalysis("judge_a",2,4,5,now),{status:503});
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
 await assert.rejects(()=>store.reserveAnalysis("judge_a",2,3,5,now),{status:429});
 const unchanged=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows as {count:number}[];
 assert.equal(Number(unchanged[0].count),4);
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
 assert.equal(Number(counters.find(r=>r.name.startsWith("analysis-user-"))?.count),2);
 assert.equal(Number(counters.find(r=>r.name.startsWith("analysis-daily-"))?.count),2);
 assert.equal(Number(counters.find(r=>r.name==="inference-lifetime")?.count),4);
 const afterRestart=await handler(await request());assert.equal(afterRestart.status,429);
});

test("public same-origin requests need no token and retain atomic per-IP and lifetime allowances",async()=>{
 await seed(0,"8".repeat(64));
 const publicEnv=()=>({...env(),SITEWITNESS_PUBLIC_ANALYSIS:"true",SITEWITNESS_STORAGE_KEY:"9".repeat(64),INFERENCE_IP_DAILY_LIMIT:"1"});
 let calls=0;const handler=createAnalyzeHandler({env:publicEnv,store:factory,now:()=>now,infer:async()=>{calls++;return report;}});
 const publicRequest=async(ip:string)=>{const req=await request();req.headers.delete("authorization");req.headers.set("x-forwarded-for",ip);return handler(req);};
 const sameIp=await Promise.all([publicRequest("203.0.113.7"),publicRequest("203.0.113.7"),publicRequest("203.0.113.7")]);
 assert.equal(sameIp.filter(r=>r.status===200).length,1);
 assert.equal(sameIp.filter(r=>r.status===429).length,2);
 assert.equal((await publicRequest("203.0.113.8")).status,200);
 assert.equal(calls,2);
 const counters=(await engine.query("SELECT name,count FROM sw_counters ORDER BY name")).rows as {name:string;count:number}[];
 assert.equal(Number(counters.find(r=>r.name==="inference-lifetime")?.count),2);
 assert.equal(Number(counters.find(r=>r.name.startsWith("analysis-daily-"))?.count),2);
 assert.equal(Number(counters.filter(r=>r.name.startsWith("analysis-user-ip_")).length),2);
 assert.equal((await publicRequest("203.0.113.8")).status,429);
 assert.equal((await publicRequest("not-an-ip")).status,503);
 const cross=await request();cross.headers.delete("authorization");cross.headers.set("origin","https://attacker.invalid");cross.headers.set("x-forwarded-for","203.0.113.9");
 assert.equal((await handler(cross)).status,403);
 assert.equal(calls,2);
});

test("Neon reservation enforces the configured lifetime ceiling",async()=>{
 await seed(4,"6".repeat(64));
 const store=factory();
 await store.reserveAnalysis("judge_a",2,4,5,now);
 await assert.rejects(()=>store.reserveAnalysis("judge_a",2,4,5,now),{status:429});
 const lifetime=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows[0] as {count:number};
 assert.equal(Number(lifetime.count),5);
});

test("serverless validation and upstream failures do not refund reserved inference allowance",async()=>{
 await seed(4,"4".repeat(64));
 let calls=0;const handler=createAnalyzeHandler({env,store:factory,now:()=>now,infer:async()=>{calls++;throw new Error("SYNTHETIC UPSTREAM FAILURE");}});
 const wrongMime=await handler(await request({type:"text/plain"}));assert.equal(wrongMime.status,415);
 const malformed=await handler(new Request("https://sitewitness.example/api/analyze",{method:"POST",headers:{authorization:`Bearer ${token}`,origin:"https://sitewitness.example","content-type":"multipart/form-data; boundary=X"},body:"broken"}));assert.equal(malformed.status,400);
 const image=await request();const failed=await handler(image);assert.equal(failed.status,500);assert.equal(calls,1);
 const result=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows[0] as {count:number};
 assert.equal(Number(result.count),5);
 const exhausted=await handler(await request());assert.equal(exhausted.status,429);assert.equal(calls,1);
});

test("serverless budget dry-run validates and persists allowances without invoking Meta",async()=>{
 await seed(1,"5".repeat(64));let calls=0;
 const dryEnv=()=>({...env(),INFERENCE_ENABLED:"false",INFERENCE_BUDGET_DRY_RUN:"true",MODEL_API_KEY:""});
 const handler=createAnalyzeHandler({env:dryEnv,store:factory,now:()=>now,infer:async()=>{calls++;return report;}});
 const first=await handler(await request());assert.equal(first.status,503);
 assert.match((await first.json()).error,/No model request was made/);
 const second=await handler(await request());assert.equal(second.status,503);
 const exhausted=await handler(await request());assert.equal(exhausted.status,429);
 assert.equal(calls,0);
 const lifetime=(await engine.query("SELECT count FROM sw_counters WHERE name='inference-lifetime'")).rows as {count:number}[];
 assert.equal(Number(lifetime[0].count),3);
});
