import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LocalStore, openLocalStore } from "../lib/server/store";
import { createInspectionHandler } from "../lib/server/inspections";
import { ServiceError } from "../lib/server/errors";

globalThis.fetch = async () => { throw new Error("External HTTP forbidden"); };
const key = Buffer.alloc(32, 42);
const tokenA = "a".repeat(43), tokenB = "b".repeat(43);
const record = {question:"SYNTHETIC PRIVATE RECORD",report:{overview:"SYNTHETIC TEST DATA", findings:[], unanswered_questions:[], notice:"test"}};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "sitewitness-storage-"));
  const path = join(dir,"test.sqlite");
  const store = () => new LocalStore(path,key);
  const env = {
    INSPECTION_STORAGE_ENABLED:"true", SITEWITNESS_STORAGE_KEY:key.toString("hex"),
    SITEWITNESS_USERS:JSON.stringify([{id:"alice",tokenHash:createHash("sha256").update(tokenA).digest("hex")},{id:"bob",tokenHash:createHash("sha256").update(tokenB).digest("hex")}]),
  };
  const request = (method="GET",token=tokenA, body?:unknown, suffix="") => new Request(`http://localhost/api/inspections${suffix}`,{
    method, headers:{authorization:`Bearer ${token}`,"content-type":"application/json",origin:"http://localhost"},
    ...(body===undefined ? {} : {body:JSON.stringify(body)}),
  });
  return {dir,path,store,env,request,clean:()=>rmSync(dir,{recursive:true,force:true})};
}

test("durable rate windows and lifetime budget survive connections and restarts",()=>{
  const s=setup();
  try {
    let db=s.store(); db.consume("rate",1,1000,100); db.reserve(1,100); db.close();
    db=s.store();
    assert.throws(()=>db.consume("rate",1,1000,101),ServiceError);
    db.consume("rate",1,1000,1100);
    assert.throws(()=>db.reserve(1,9999999),ServiceError);
    assert.throws(()=>db.reserve(0,9999999),ServiceError);
    db.close();
  } finally {s.clean();}
});

test("independent processes cannot oversubscribe a durable reservation",async()=>{
  const s=setup();
  try {
    s.store().close();
    const code=`const {LocalStore}=require('./lib/server/store.ts'); const s=new LocalStore(process.argv[1]); try{s.reserve(3,100);process.stdout.write('ok')}catch(e){if(e.status!==429)throw e;process.stdout.write('blocked')}finally{s.close()}`;
    const results=await Promise.all(Array.from({length:8},()=>promisify(execFile)(process.execPath,["--import","tsx","-e",code,s.path])));
    assert.equal(results.filter(r=>r.stdout==="ok").length,3);
    assert.equal(results.filter(r=>r.stdout==="blocked").length,5);
  } finally {s.clean();}
});

test("inspection records are encrypted, owner scoped, deletable, and durable",async()=>{
  const s=setup();
  try {
    const handle=createInspectionHandler({env:()=>s.env,store:s.store});
    const saved=await handle(s.request("POST",tokenA,record)); assert.equal(saved.status,201);
    const {id}=await saved.json();
    assert.equal(readFileSync(s.path).includes(Buffer.from(record.question)),false);
    const other=await handle(s.request("GET",tokenB)); assert.deepEqual((await other.json()).inspections,[]);
    assert.equal((await handle(s.request("DELETE",tokenB,undefined,`?id=${id}`))).status,200);
    const own=await handle(s.request()); assert.equal((await own.json()).inspections[0].record.question,record.question);
    await handle(s.request("DELETE",tokenA,undefined,`?id=${id}`));
    assert.deepEqual((await (await handle(s.request())).json()).inspections,[]);
  } finally {s.clean();}
});

test("server expiry is enforced and encryption cannot be read with another key",()=>{
  const s=setup();
  try {
    const db=s.store(); db.save("alice","id",record,100);
    const wrong=new LocalStore(s.path,Buffer.alloc(32,1));
    assert.throws(()=>wrong.list("alice",101)); wrong.close();
    assert.equal(db.list("alice",100+7*86400000).length,0); db.close();
  } finally {s.clean();}
});

test("inspection API fails closed on disabled, Vercel, invalid config and missing credentials",async()=>{
  const s=setup();
  try {
    for(const env of [{...s.env,INSPECTION_STORAGE_ENABLED:"false"},{...s.env,VERCEL:"1"},{...s.env,SITEWITNESS_USERS:"invalid"},{...s.env,SITEWITNESS_STORAGE_KEY:""}]) {
      const handle=createInspectionHandler({env:()=>env,store:()=>{throw new Error("must not open");}});
      assert.equal((await handle(s.request())).status,503);
    }
    const handle=createInspectionHandler({env:()=>s.env,store:s.store});
    assert.equal((await handle(s.request("GET","wrong"))).status,401);
    assert.equal((await handle(s.request("GET","c".repeat(43)))).status,401);
    assert.throws(()=>openLocalStore({VERCEL:"1",SITEWITNESS_DATA_DIR:s.dir}),ServiceError);
    assert.throws(()=>openLocalStore({}),ServiceError);
  } finally {s.clean();}
});

test("inspection API rejects cross-origin, ownership injection, photos, invalid and oversized data",async()=>{
  const s=setup();
  try {
    const handle=createInspectionHandler({env:()=>s.env,store:s.store});
    const cross=s.request(); cross.headers.set("origin","https://attacker.invalid");
    assert.equal((await handle(cross)).status,403);
    for(const data of [{...record,owner:"bob"},{...record,photo:"bytes"},{}, {...record,question:"x".repeat(501)}])
      assert.equal((await handle(s.request("POST",tokenA,data))).status,400);
    assert.equal((await handle(s.request("POST",tokenA,{question:"x".repeat(33000)}))).status,413);
    assert.equal((await handle(s.request("DELETE",tokenA,undefined,"?id=../../other"))).status,400);
  } finally {s.clean();}
});

test("bad authentication is durably limited across handler instances",async()=>{
  const s=setup();
  try {
    for(let i=0;i<60;i++) assert.equal((await createInspectionHandler({env:()=>s.env,store:s.store,now:()=>100})(s.request("GET","wrong"))).status,401);
    const limited=await createInspectionHandler({env:()=>s.env,store:s.store,now:()=>100})(s.request());
    assert.equal(limited.status,429); assert.equal(limited.headers.get("retry-after"),"60");
    assert.equal(limited.headers.get("cache-control"),"no-store");
  } finally {s.clean();}
});

test("record cap applies inside transaction and storage errors remain private",async()=>{
  const s=setup();
  try {
    const db=s.store(); for(let i=0;i<100;i++) db.save("alice",String(i),record,100);
    assert.throws(()=>db.save("alice","overflow",record,100),ServiceError); db.close();
    const response=await createInspectionHandler({env:()=>s.env,store:()=>{throw new Error("PRIVATE PATH AND KEY");}})(s.request());
    assert.equal(response.status,503); assert.equal((await response.text()).includes("PRIVATE"),false);
  } finally {s.clean();}
});


test("configured disk store restricts permissions and rejects unsafe paths", () => {
  const s=setup();
  try {
    const env={SITEWITNESS_DATA_DIR:s.dir,SITEWITNESS_STORAGE_KEY:key.toString("hex")};
    let db=openLocalStore(env); db.reserve(1,100); db.close();
    db=openLocalStore(env); assert.throws(()=>db.reserve(1,200),ServiceError); db.close();
    assert.equal(statSync(s.dir).mode & 0o777,0o700);
    assert.equal(statSync(join(s.dir,"sitewitness.sqlite")).mode & 0o777,0o600);
    assert.throws(()=>openLocalStore({...env,SITEWITNESS_DATA_DIR:process.cwd()}),ServiceError);
    const link=join(s.dir,"link"); symlinkSync(s.dir,link);
    assert.throws(()=>openLocalStore({...env,SITEWITNESS_DATA_DIR:link}),ServiceError);
  } finally {s.clean();}
});
