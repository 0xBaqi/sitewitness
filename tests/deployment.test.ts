import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { LocalStore } from "../lib/server/store";
import { newManualInspection } from "../lib/inspection";

test("production HTTP archive survives restart; isolation, revocation, deletion and idle expiry", {timeout:90000}, async () => {
 const dir=mkdtempSync(join(tmpdir(),"sitewitness-deployment-"));
 const origin="http://127.0.0.1:3119", key=Buffer.alloc(32,37);
 const users=["alice","bob"].map((id,i)=>({id,tokenHash:createHash("sha256").update((i?"b":"a").repeat(43)).digest("hex")}));
 const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",INFERENCE_ENABLED:"false",MODEL_API_KEY:"",SITEWITNESS_ACCESS_CODE:"",VERCEL:"",INSPECTION_STORAGE_ENABLED:"true",SITEWITNESS_DATA_DIR:dir,SITEWITNESS_STORAGE_KEY:key.toString("hex"),SITEWITNESS_PUBLIC_ORIGIN:origin,SITEWITNESS_USERS:JSON.stringify(users)};
 let child:ChildProcess|undefined;
 let requestNumber=0, startNumber=0;
 async function stop(){if(child && child.exitCode===null){const done=once(child,"exit");child.kill("SIGTERM");await done;}child=undefined;}
 async function start(){startNumber++;child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3119"],{env,stdio:"ignore"});
  for(let i=0;i<100;i++){if(child?.exitCode!==null)throw new Error("Production server exited");try{if((await fetch(origin,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error("Production server did not become ready");}
 async function request(method="GET",token="a".repeat(43),body?:unknown,id="",requestOrigin=origin){requestNumber++;return fetch(origin+"/api/archives"+(id?"?id="+id:""),{method,headers:{authorization:"Bearer "+token,origin:requestOrigin,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)}).catch(() => {throw new Error(`Archive request ${requestNumber} (${method}) after server start ${startNumber} did not complete`);});}
 try {
  await start();assert.equal((await request("GET","wrong")).status,401);
  assert.equal((await request("GET","a".repeat(43),undefined,"","https://foreign.invalid")).status,403);
  const inspection=newManualInspection();inspection.question="SYNTHETIC restart smoke";
  const bytes=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
  inspection.photos=[{id:randomUUID(),name:"smoke.png",type:"image/png",size:bytes.length}];
  const archive={format:"sitewitness-manual-v1",provenance:{kind:"manual"},inspection,photographs:[{id:inspection.photos[0].id,dataUrl:"data:image/png;base64,"+bytes.toString("base64")}]};
  const saved=await request("POST",undefined,archive);assert.equal(saved.status,201);const {id,expiresAt}=await saved.json();
  assert.ok(Math.abs(Date.parse(expiresAt)-Date.now()-7*86400000)<10000);
  await stop();assert.equal(readFileSync(join(dir,"sitewitness.sqlite")).includes(Buffer.from(inspection.question)),false);await start();
  let response=await request();assert.equal(response.headers.get("cache-control"),"no-store");
  let rows=(await response.json()).inspections;assert.equal(rows[0].id,id);assert.deepEqual(rows[0].record.photographs,archive.photographs);
  assert.deepEqual((await (await request("GET","b".repeat(43))).json()).inspections,[]);
  assert.equal((await request("DELETE","b".repeat(43),undefined,id)).status,200);
  assert.equal((await (await request()).json()).inspections.length,1);
  await stop();env.SITEWITNESS_USERS=JSON.stringify([users[1]]);await start();assert.equal((await request()).status,401);
  await stop();env.SITEWITNESS_USERS=JSON.stringify(users);await start();assert.equal((await request("DELETE",undefined,undefined,id)).status,200);
  await stop();await start();assert.deepEqual((await (await request()).json()).inspections,[]);await stop();
  const db=new LocalStore(join(dir,"sitewitness.sqlite"),key);db.save("alice",randomUUID(),archive,Date.now()-8*86400000);db.save("bob","unexpired",archive,Date.now());db.close();
  execFileSync(process.execPath,["--import","tsx","scripts/expire.ts"],{env});
  // Inspect SQL directly: list() itself would purge and hide a broken cleanup command.
  const {DatabaseSync}=await import("node:sqlite");const raw=new DatabaseSync(join(dir,"sitewitness.sqlite"));
  assert.deepEqual(raw.prepare("SELECT id FROM inspections").all().map(x=>x.id),["unexpired"]);raw.close();
 } finally {await stop();rmSync(dir,{recursive:true,force:true});}
});
