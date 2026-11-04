import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const title="SYNTHETIC TEST DATA: manual site visit";
const png=()=>sharp({create:{width:40,height:30,channels:3,background:"#336688"}}).png().toBuffer();
async function create(page:Page) {
 await page.goto("/");await page.getByRole("button",{name:"New inspection",exact:true}).click();
 await page.getByLabel("Inspection title or question").fill(title);
}
async function observation(page:Page,name="Human observation one") {
 await page.getByRole("button",{name:"Add human observation",exact:true}).click();
 await page.getByLabel("Observation title").fill(name);
 await page.getByLabel("Observation description").fill("SYNTHETIC TEST DATA: entered by a human, not generated.");
}
async function reopen(page:Page) {
 await page.getByRole("button").filter({hasText:title}).last().click();
 await expect(page.getByLabel("Inspection title or question")).toHaveValue(title);
}
test.beforeEach(async({context})=>{
 await context.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname==="/api/analyze")return route.abort();
  return route.continue();
 });
});

test("human observations, photos, reviewer decisions and JSON export survive save and reopen",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await create(page);
 await page.getByLabel("Site or project name").fill("SYNTHETIC TEST DATA: site");
 await page.getByLabel("Human inspection summary").fill("SYNTHETIC TEST DATA: human summary");
 await page.getByLabel("Human notes").fill("SYNTHETIC TEST DATA: field note.");
 const bytes=await png();
 await page.getByLabel("Add construction photographs").setInputFiles([{name:"first.png",mimeType:"image/png",buffer:bytes},{name:"second.png",mimeType:"image/png",buffer:bytes}]);
 await expect(page.getByRole("img",{name:"Inspection photograph: second.png"})).toBeVisible();
 await observation(page);await page.getByLabel("Evidence noted").fill("SYNTHETIC TEST DATA: visible surface.");
 await page.getByLabel("Limitations noted").fill("SYNTHETIC TEST DATA: hidden structure not inspected.");
 await page.getByLabel("Reviewer decision").selectOption("investigate");
 await page.getByLabel("Reviewer notes").fill("SYNTHETIC TEST DATA: arrange an independent check.");
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();await page.reload();await reopen(page);
 await expect(page.getByLabel("Human notes")).toHaveValue("SYNTHETIC TEST DATA: field note.");
 await expect(page.getByRole("img",{name:/Inspection photograph:/})).toHaveCount(2);
 await expect(page.getByLabel("Reviewer decision")).toHaveValue("investigate");
 await expect(page.getByLabel("Reviewer notes")).toHaveValue("SYNTHETIC TEST DATA: arrange an independent check.");
 const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Export JSON backup"}).click();
 const download=await downloadPromise,exported=JSON.parse(await readFile((await download.path())!,"utf8"));
 expect(exported.format).toBe("sitewitness-manual-v1");expect(exported.inspection.provenance).toEqual({kind:"manual"});
 expect(exported.inspection.report.findings[0].description).toBe("SYNTHETIC TEST DATA: entered by a human, not generated.");
 expect(exported.photographs).toHaveLength(2);expect(Buffer.from(exported.photographs[0].dataUrl.split(",")[1],"base64")).toEqual(bytes);
 expect(errors).toEqual([]);
});

test("photo validation rejects spoofed, oversized, undecodable and excess uploads",async({page})=>{
 await create(page);
 for(const [file,message] of [
  [{name:"fake.png",mimeType:"image/png",buffer:Buffer.from("not an image")} ,"contents do not match"],
  [{name:"large.png",mimeType:"image/png",buffer:Buffer.alloc(4*1024*1024+1)},"between 1 byte and 4 MB"],
  [{name:"broken.png",mimeType:"image/png",buffer:Buffer.from([137,80,78,71,13,10,26,10])},"could not be decoded"],
  [{name:"bad.txt",mimeType:"text/plain",buffer:Buffer.from("text")},"Use JPEG, PNG, or WebP"],
 ] as const){
  await page.getByLabel("Add construction photographs").setInputFiles(file);
  await expect(page.locator("form").getByRole("alert")).toContainText(message);
  await expect(page.getByRole("img",{name:/Inspection photograph:/})).toHaveCount(0);
 }
 const bytes=await png();await page.getByLabel("Add construction photographs").setInputFiles(Array.from({length:6},(_,i)=>({name:`${i}.png`,mimeType:"image/png",buffer:bytes})));
 await expect(page.locator("form").getByRole("alert")).toContainText("up to five");
});

test("failed save preserves draft and can recover",async({page})=>{
 await create(page);await observation(page);
 await page.evaluate(()=>{
  const original=IDBDatabase.prototype.transaction;
  (window as unknown as {restoreStorage:()=>void}).restoreStorage=()=>{IDBDatabase.prototype.transaction=original;};
  IDBDatabase.prototype.transaction=function(...args:Parameters<typeof original>){if(args[1]==="readwrite")throw new DOMException("Storage quota exceeded","QuotaExceededError");return original.apply(this,args);};
 });
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(page.locator("form").getByRole("alert")).toContainText("Storage quota exceeded");
 await expect(page.getByLabel("Observation description")).toHaveValue("SYNTHETIC TEST DATA: entered by a human, not generated.");
 await page.evaluate(()=>(window as unknown as {restoreStorage:()=>void}).restoreStorage());
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
});

test("mobile layout fits viewport and supports removing saved photos",async({page})=>{
 await page.setViewportSize({width:375,height:812});await create(page);await observation(page);
 await page.getByLabel("Add construction photographs").setInputFiles({name:"mobile.png",mimeType:"image/png",buffer:await png()});
 await expect(page.getByRole("img",{name:"Inspection photograph: mobile.png"})).toBeVisible();
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/manual-mobile.png",fullPage:true});
 await page.getByRole("button",{name:"Remove photograph mobile.png"}).click();
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 await page.reload();await reopen(page);await expect(page.getByRole("img",{name:/Inspection photograph:/})).toHaveCount(0);
 page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Delete saved inspection"}).click();
 await expect(page.getByText("No inspections saved yet.")).toBeVisible();
});

test("stale-tab edits cannot overwrite a newer saved inspection",async({page,context})=>{
 await create(page);await observation(page);await page.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 const other=await context.newPage();await other.goto("/");await reopen(other);
 await page.getByLabel("Human notes").fill("SYNTHETIC TEST DATA: first tab wins.");
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 await other.getByLabel("Human notes").fill("SYNTHETIC TEST DATA: stale edit.");
 await other.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(other.locator("form").getByRole("alert")).toContainText("changed in another tab");
 await page.reload();await reopen(page);await expect(page.getByLabel("Human notes")).toHaveValue("SYNTHETIC TEST DATA: first tab wins.");
});

test("upload busy state prevents editing while a photograph is decoded",async({page})=>{
 await create(page);
 await page.evaluate(()=>{
  const original=window.createImageBitmap;let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  (window as unknown as {releaseDecode:()=>void}).releaseDecode=()=>{release();window.createImageBitmap=original;};
  window.createImageBitmap=((...args:Parameters<typeof createImageBitmap>)=>held.then(()=>Reflect.apply(original,window,args))) as typeof createImageBitmap;
 });
 await page.getByLabel("Add construction photographs").setInputFiles({name:"held.png",mimeType:"image/png",buffer:await png()});
 await expect(page.locator("form")).toHaveAttribute("aria-busy","true");
 await expect(page.getByLabel("Inspection title or question")).toBeDisabled();
 await expect(page.getByRole("button",{name:"New inspection",exact:true})).toBeDisabled();
 await expect(page.getByText("Checking photographs…")).toBeVisible();
 await page.evaluate(()=>(window as unknown as {releaseDecode:()=>void}).releaseDecode());
 await expect(page.getByRole("img",{name:"Inspection photograph: held.png"})).toBeVisible();
 await expect(page.locator("form")).toHaveAttribute("aria-busy","false");
});

test("saved records stay in their browser profile and new visitors start with a clean workspace",async({page,browser})=>{
 await create(page);await observation(page);await page.getByRole("button",{name:"Save inspection",exact:true}).click();
 await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 const isolated=await browser.newContext();
 try{
  await isolated.route("**/*",route=>{const url=new URL(route.request().url());return !["localhost","127.0.0.1"].includes(url.hostname)||url.pathname==="/api/analyze"?route.abort():route.continue();});
  const visitor=await isolated.newPage();await visitor.goto("http://127.0.0.1:3107/");
  await expect(visitor.getByText("No inspections saved yet.", {exact:true})).toBeVisible();
  await expect(visitor.getByRole("button").filter({hasText:title})).toHaveCount(0);
 }finally{await isolated.close();}
 await page.reload();await reopen(page);
});

test("switching saved inspections restores each photo, notes and review decisions",async({page})=>{
 await create(page);await observation(page,"SYNTHETIC TEST DATA: record one");
 const bytes=await png();await page.getByLabel("Add construction photographs").setInputFiles({name:"one.png",mimeType:"image/png",buffer:bytes});
 await page.getByLabel("Reviewer notes").fill("SYNTHETIC TEST DATA: note one.");
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 await page.getByRole("button",{name:"New inspection",exact:true}).click();
 await page.getByLabel("Inspection title or question").fill("SYNTHETIC TEST DATA: second inspection");
 await observation(page,"SYNTHETIC TEST DATA: record two");
 await page.getByLabel("Reviewer decision").selectOption("accepted");
 await page.getByRole("button",{name:"Save inspection",exact:true}).click();await expect(page.getByText(/Inspection saved in this browser/)).toBeVisible();
 await page.reload();
 await page.getByRole("button").filter({hasText:title}).last().click();
 await expect(page.getByRole("img",{name:"Inspection photograph: one.png"})).toBeVisible();
 await expect(page.getByLabel("Reviewer notes")).toHaveValue("SYNTHETIC TEST DATA: note one.");
 await page.getByRole("button").filter({hasText:"SYNTHETIC TEST DATA: second inspection"}).last().click();
 await expect(page.getByLabel("Reviewer decision")).toHaveValue("accepted");
 await expect(page.getByRole("img",{name:/Inspection photograph:/})).toHaveCount(0);
});
