import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { RemoteStore, DAY, type Database, type Objects } from "../lib/server/remote-store";
import { createRemoteHandler } from "../lib/server/remote-handler";
import { openRemoteStore } from "../lib/server/remote-provider";
import { newManualInspection } from "../lib/inspection";

globalThis.fetch=async()=>{throw new Error("External HTTP forbidden in storage tests");};
const key=Buffer.alloc(32,42), now=1700000000000;
const engine=new PGlite();
after(async()=>{await engine.close();});
async function setup(){
 const pg=engine;await pg.exec(readFileSync("deploy/migrations/009-neon.sql","utf8"));
 const database:Database={transaction:fn=>pg.transaction(tx=>fn({query:(q,v)=>tx.query(q,v)})),close:async()=>{}};
 const blobs=new Map<string,Buffer>();let failPut=false,failDelete=false;
 const objects:Objects={async put(p,b){blobs.set(p,Buffer.from(b));if(failPut)throw new Error("Ambiguous put");},async get(p){const b=blobs.get(p);if(!b)throw new Error("Missing blob");return b;},async remove(paths){if(failDelete)throw new Error("Provider unavailable");for(const p of paths)blobs.delete(p);}};
 const store=()=>new RemoteStore(database,objects,key);
 const inspection=newManualInspection();inspection.question="SYNTHETIC PRIVATE TEST";
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
 inspection.photos=[{id:randomUUID(),name:"synthetic.png",type:"image/png",size:bytes.length}];
 const id=randomUUID();
 return {pg,store,blobs,inspection,bytes,id,database,objects,setFailPut:(v:boolean)=>failPut=v,setFailDelete:(v:boolean)=>failDelete=v,close:async()=>{await pg.exec("TRUNCATE sw_photos,sw_snapshots,sw_counters");}};
}
test("split snapshots encrypt metadata/photos, finalize, isolate owners, and survive new adapters",async()=>{
 const s=await setup();try{
  await s.store().begin("alice",s.id,s.inspection,now);
  assert.equal((await s.store().list("alice",now)).inspections.length,0);
  await assert.rejects(()=>s.store().finalize("alice",s.id,now),{status:409});
  await s.store().upload("alice",s.id,s.inspection.photos[0].id,s.bytes,"image/png",now);
  await s.store().finalize("alice",s.id,now);
  const row=(await s.pg.query<any>("SELECT * FROM sw_snapshots")).rows[0];
  assert.ok(!row.data.includes(s.inspection.question));assert.ok(!Buffer.from(row.data,"base64").includes(Buffer.from(s.inspection.question)));
  assert.ok(![...s.blobs.values()][0].includes(s.bytes));
  assert.equal((await s.store().list("alice",now)).inspections[0].record.inspection.question,s.inspection.question);
  assert.deepEqual((await s.store().list("bob",now)).inspections,[]);
  await assert.rejects(()=>s.store().photo("bob",s.id,s.inspection.photos[0].id,now),{status:404});
  await s.store().remove("bob",s.id);
  assert.deepEqual((await s.store().photo("alice",s.id,s.inspection.photos[0].id,now)).bytes,s.bytes);
  await assert.rejects(()=>s.store().upload("alice",s.id,s.inspection.photos[0].id,s.bytes,"image/png",now),{status:409});
  const wrong=new RemoteStore(s.database,s.objects,Buffer.alloc(32,3));await assert.rejects(()=>wrong.list("alice",now));
  const path=[...s.blobs.keys()][0];s.blobs.get(path)![28]^=1;
  await assert.rejects(()=>s.store().photo("alice",s.id,s.inspection.photos[0].id,now));
 }finally{await s.close();}
});
test("idempotent reservation and photo retries do not duplicate snapshots; metadata cannot change",async()=>{
 const s=await setup();try{
  const a=await s.store().begin("alice",s.id,s.inspection,now);
  assert.deepEqual(await s.store().begin("alice",s.id,s.inspection,now+1),a);
  await assert.rejects(()=>s.store().begin("bob",s.id,s.inspection,now),{status:409});
  await assert.rejects(()=>s.store().begin("alice",s.id,{...s.inspection,question:"Changed"},now),{status:409});
  for(let i=0;i<2;i++)await s.store().upload("alice",s.id,s.inspection.photos[0].id,s.bytes,"image/png",now);
  assert.equal(s.blobs.size,1);
  await s.store().finalize("alice",s.id,now);assert.deepEqual(await s.store().finalize("alice",s.id,now+1),a);
 }finally{await s.close();}
});
test("ambiguous object writes retain cleanup references and deleted objects remain inaccessible on cleanup failure",async()=>{
 const s=await setup();try{
  await s.store().begin("alice",s.id,s.inspection,now);s.setFailPut(true);
  await assert.rejects(()=>s.store().upload("alice",s.id,s.inspection.photos[0].id,s.bytes,"image/png",now));
  assert.equal(s.blobs.size,1);await assert.rejects(()=>s.store().finalize("alice",s.id,now),{status:409});
  await s.store().remove("alice",s.id);s.setFailDelete(true);
  await assert.rejects(()=>s.store().cleanup(now));
  await assert.rejects(()=>s.store().photo("alice",s.id,s.inspection.photos[0].id,now),{status:404});
  assert.equal((await s.pg.query<any>("SELECT data FROM sw_snapshots")).rows[0].data,"");
  s.setFailDelete(false);await s.store().cleanup(now);assert.equal(s.blobs.size,0);
  await s.store().cleanup(now+8*DAY);assert.equal((await s.pg.query("SELECT id FROM sw_snapshots")).rows.length,0);
 }finally{await s.close();}
});
test("seven-day boundary and one-hour pending timeout are enforced without cron",async()=>{
 const s=await setup();try{
  const noPhotos={...s.inspection,photos:[]};await s.store().begin("alice",s.id,noPhotos,now);await s.store().finalize("alice",s.id,now);
  assert.equal((await s.store().list("alice",now+7*DAY-1)).inspections.length,1);
  assert.equal((await s.store().list("alice",now+7*DAY)).inspections.length,0);
  await assert.rejects(()=>s.store().finalize("alice",s.id,now+7*DAY),{status:404});
  const pending=randomUUID();await s.store().begin("alice",pending,s.inspection,now);
  await assert.rejects(()=>s.store().upload("alice",pending,s.inspection.photos[0].id,s.bytes,"image/png",now+3600000),{status:404});
  await s.store().cleanup(now+7*DAY);assert.equal((await s.pg.query<any>("SELECT data FROM sw_snapshots WHERE id=$1",[s.id])).rows[0].data,"");
 }finally{await s.close();}
});
test("durable atomic quotas include pending reservations across adapter instances",async()=>{
 const s=await setup();try{
  const large={...s.inspection,photos:Array.from({length:5},()=>({id:randomUUID(),name:"large.png",type:"image/png" as const,size:4*1024*1024}))};
  const results=await Promise.allSettled(Array.from({length:3},()=>s.store().begin("alice",randomUUID(),large,now)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const global=await Promise.allSettled(Array.from({length:6},(_,i)=>s.store().begin(`owner${i}`,randomUUID(),large,now)));
  assert.equal(global.filter(r=>r.status==="fulfilled").length,3);
  assert.equal((await s.pg.query("SELECT id FROM sw_snapshots")).rows.length,4);
 }finally{await s.close();}
});
test("metadata pagination is bounded and owner scoped",async()=>{
 const s=await setup();try{
  for(let i=0;i<12;i++){const id=randomUUID();await s.store().begin("alice",id,{...s.inspection,photos:[]},now);await s.store().finalize("alice",id,now);}
  const first=await s.store().list("alice",now);assert.equal(first.inspections.length,10);assert.ok(first.nextCursor);
  const second=await s.store().list("alice",now,first.nextCursor!);assert.equal(second.inspections.length,2);assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.inspections,...second.inspections].map(x=>x.id)).size,12);
  assert.ok(first.inspections.every(x=>x.record.photographs.length===0));
 }finally{await s.close();}
});
test("remote API authenticates, rejects cross-origin/provenance/oversize writes and supports binary restore",async()=>{
 const s=await setup();try{
  const token="a".repeat(43), env={SITEWITNESS_STORAGE_PROVIDER:"neon-blob",INSPECTION_STORAGE_ENABLED:"true",SITEWITNESS_PUBLIC_ORIGIN:"https://test.invalid",SITEWITNESS_USERS:JSON.stringify([{id:"alice",tokenHash:createHash("sha256").update(token).digest("hex")}])};
  const handler=createRemoteHandler({env:()=>env,store:s.store,now:()=>now});
  const req=(method="GET",body?:BodyInit,query="",auth=token,type="application/json")=>new Request(`https://test.invalid/api/archives${query}`,{method,headers:{authorization:`Bearer ${auth}`,"content-type":type,origin:"https://test.invalid"},body});
  assert.equal((await handler(req("GET",undefined,"","bad"))).status,401);
  const cross=req();cross.headers.set("origin","https://evil.invalid");assert.equal((await handler(cross)).status,403);
  assert.equal((await handler(req("POST","x".repeat(65537)))).status,413);
  assert.equal((await handler(req("POST",JSON.stringify({id:s.id,inspection:{...s.inspection,provenance:{kind:"ai",model:"fake"}}})))).status,400);
  assert.equal((await handler(req("POST",JSON.stringify({id:s.id,inspection:s.inspection})))).status,201);
  assert.equal((await handler(req("PUT",new Uint8Array(4*1024*1024+1),`?id=${s.id}&photo=${s.inspection.photos[0].id}`,token,"image/png"))).status,413);
  assert.equal((await handler(req("PUT",new Uint8Array(s.bytes),`?id=${s.id}&photo=${s.inspection.photos[0].id}`,token,"image/png"))).status,200);
  assert.equal((await handler(req("POST",undefined,`?id=${s.id}`))).status,200);
  const photo=await handler(req("GET",undefined,`?id=${s.id}&photo=${s.inspection.photos[0].id}`));assert.equal(photo.status,200);assert.match(photo.headers.get("cache-control")!,/no-store/);assert.deepEqual(Buffer.from(await photo.arrayBuffer()),s.bytes);
  env.SITEWITNESS_USERS=JSON.stringify([{id:"bob",tokenHash:createHash("sha256").update("b".repeat(43)).digest("hex")}]);assert.equal((await handler(req())).status,401);
 }finally{await s.close();}
});
test("remote rate counters persist and absent credentials fail closed",async()=>{
 const s=await setup();try{
  for(let i=0;i<60;i++)await s.store().consume(now);
  await assert.rejects(()=>s.store().consume(now),{status:429});await s.store().consume(now+60000);
  for(const env of [{},{INSPECTION_STORAGE_ENABLED:"true",SITEWITNESS_STORAGE_PROVIDER:"neon-blob"}])assert.throws(()=>openRemoteStore(env),{status:503});
 }finally{await s.close();}
});

test("exact 4 MiB photo is accepted; spoofed image and encryption context swaps fail",async()=>{
 const s=await setup();try{
  const bytes=Buffer.alloc(4*1024*1024);s.bytes.copy(bytes);
  const inspection={...s.inspection,photos:[{...s.inspection.photos[0],size:bytes.length}]};
  await s.store().begin("alice",s.id,inspection,now);
  await assert.rejects(()=>s.store().upload("alice",s.id,inspection.photos[0].id,Buffer.alloc(bytes.length),"image/png",now));
  await assert.rejects(()=>s.store().upload("alice",s.id,inspection.photos[0].id,bytes,"image/jpeg",now),{status:400});
  await s.store().upload("alice",s.id,inspection.photos[0].id,bytes,"image/png",now);await s.store().finalize("alice",s.id,now);
  assert.equal((await s.store().photo("alice",s.id,inspection.photos[0].id,now)).bytes.length,4*1024*1024);
  await s.pg.query("UPDATE sw_snapshots SET owner='bob' WHERE id=$1",[s.id]);await assert.rejects(()=>s.store().list("bob",now));
 }finally{await s.close();}
});

test("cleanup endpoint rejects missing or wrong secret and disabled storage",async()=>{
 const {GET}=await import("../app/api/storage/cleanup/route");
 const previous=process.env.CRON_SECRET,enabled=process.env.INSPECTION_STORAGE_ENABLED;
 try{
  delete process.env.CRON_SECRET;
  assert.equal((await GET(new Request("https://test.invalid/api/storage/cleanup"))).status,401);
  process.env.CRON_SECRET="c".repeat(43);
  assert.equal((await GET(new Request("https://test.invalid/api/storage/cleanup",{headers:{authorization:"Bearer wrong"}}))).status,401);
  process.env.INSPECTION_STORAGE_ENABLED="false";
  const response=await GET(new Request("https://test.invalid/api/storage/cleanup",{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  assert.equal(response.status,503);assert.equal(response.headers.get("cache-control"),"no-store");
 }finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;if(enabled===undefined)delete process.env.INSPECTION_STORAGE_ENABLED;else process.env.INSPECTION_STORAGE_ENABLED=enabled;}
});
test("missing migration lock fails closed",async()=>{
 const s=await setup();try{
  await s.pg.query("DELETE FROM sw_lock");await assert.rejects(()=>s.store().begin("alice",s.id,s.inspection,now),/migration is incomplete/);
  assert.equal((await s.pg.query("SELECT id FROM sw_snapshots")).rows.length,0);
 }finally{await s.close();}
});
