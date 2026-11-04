import { test, expect } from "@playwright/test";
import sharp from "sharp";

const marker="SYNTHETIC TEST DATA";
test.beforeEach(async({context})=>{
 await context.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==="/api/analyze"||!["127.0.0.1","localhost"].includes(url.hostname))return route.abort();
  return route.continue();
 });
});

test("first-run workspace has no auth inputs or fixture-first report and keeps analysis user-initiated",async({page})=>{
 let analyses=0;page.on("request",req=>{if(new URL(req.url()).pathname==="/api/analyze")analyses++;});
 await page.goto("/");
 await expect(page.getByRole("button",{name:"New inspection"})).toBeEnabled();
 await expect(page.getByLabel(/access code|bearer token|account|invitation/i)).toHaveCount(0);
 await expect(page.getByText(/Optional example · previously generated Meta report/)).toBeVisible();
 await expect(page.getByText(/Fresh Muse Spark suggestions/)).toHaveCount(0);
 await page.getByRole("button",{name:"New inspection"}).click();
 await expect(page.getByLabel("Inspection title or question")).toBeFocused();
 expect(analyses).toBe(0);
});

test("legacy browser reports and photographs migrate into one inspection without deleting the old source",async({page})=>{
 const warnings:string[]=[];page.on("console",msg=>{if(msg.type()==="warning")warnings.push(msg.text());});
 const id="6e1b2c74-c78d-4a7d-9769-93d4f1f20c73",bytes=await sharp({create:{width:40,height:30,channels:3,background:"#456789"}}).png().toBuffer();
 const legacy={id,question:`${marker}: retained legacy report`,filename:`${marker}-legacy.png`,model:"muse-spark-1.3",generatedAt:"2026-11-03T12:00:00.000Z",imageSha256:"a".repeat(64),report:{overview:`${marker}: legacy overview.`,findings:[{id:"legacy-finding",category:"observation",title:`${marker}: legacy member`,description:`${marker}: legacy original.`,evidence:`${marker}: visual evidence.`,limitation:`${marker}: uncertain.`}],unanswered_questions:[],notice:`${marker}: human review required.`},reviews:{"legacy-finding":"unreviewed"},edits:{},notes:{}};
 await page.goto("/");
 await page.evaluate(async({legacy,data})=>{
  localStorage.setItem("sitewitness-live-reviews-v1",JSON.stringify([legacy]));
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open("sitewitness-photographs",1);req.onupgradeneeded=()=>req.result.createObjectStore("photos");req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(new Blob([new Uint8Array(data)],{type:"image/png"}),legacy.id);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
 },{legacy,data:Array.from(bytes)});
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem("sitewitness-legacy-imported-v1"))).not.toBeNull();
 const migration=await page.evaluate(()=>localStorage.getItem("sitewitness-legacy-imported-v1"));
 if(!migration?.includes(`live:${id}`))throw new Error(`Migration marker ${migration}; warnings: ${warnings.join(" | ")}`);
 const item=page.getByRole("button",{name:/Human review \+ Muse Spark/});await expect(item).toBeVisible();await item.click();
 await expect(page.getByRole("img",{name:`Inspection photograph: ${marker}-legacy.png`})).toBeVisible();
 await expect(page.getByRole("button",{name:/Muse Spark · SYNTHETIC TEST DATA: legacy member/})).toBeVisible();
 await page.getByLabel("Reviewer decision").selectOption("investigate");
 await page.getByLabel("Reviewer notes").fill(`${marker}: retained reviewer note.`);
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem("sitewitness-live-reviews-v1"))).toContain(legacy.question);
 await page.reload();await page.getByRole("button",{name:/Human review \+ Muse Spark/}).click();
 await expect(page.getByLabel("Reviewer decision")).toHaveValue("investigate");
 await expect(page.getByLabel("Reviewer notes")).toHaveValue(`${marker}: retained reviewer note.`);
});

test("a saved captured example review is imported into the unified inspection and remains in its source store",async({page})=>{
 await page.goto("/evidence?sample=1");
 await expect(page.getByRole("button",{name:"Save review and photograph"})).toBeVisible();
 await page.getByRole("button",{name:"Save review and photograph"}).click();
 await expect(page.getByRole("status")).toContainText("Review and photograph saved");
 await page.goto("/");
 const item=page.getByRole("button",{name:/Human review \+ Muse Spark/});await expect(item).toBeVisible();await item.click();
 await expect(page.getByLabel("Inspection title or question")).toHaveValue("Review captured construction photograph");
 await expect(page.getByRole("img",{name:"Inspection photograph: captured-construction.jpg"})).toBeVisible();
 const retained=await page.evaluate(()=>new Promise<boolean>((resolve,reject)=>{
  const req=indexedDB.open("sitewitness-captured-review-v1",1);
  req.onsuccess=()=>{const db=req.result,read=db.transaction("reviews").objectStore("reviews").get("muse-spark-2026-11-03-attempt-2");read.onsuccess=()=>{db.close();resolve(!!read.result);};read.onerror=()=>{db.close();reject(read.error);};};
  req.onerror=()=>reject(req.error);
 }));
 expect(retained).toBe(true);
});

test("local preview refuses analysis and server persistence while inference remains disabled",async({request})=>{
 for(const path of ["/api/analyze","/api/inspections"]){
  const response=await request.post(path,{data:{}});
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
 }
});
