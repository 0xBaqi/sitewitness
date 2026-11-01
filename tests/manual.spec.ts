import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const title="SYNTHETIC TEST DATA: manual site visit";
const png=()=>sharp({create:{width:40,height:30,channels:3,background:"#336688"}}).png().toBuffer();
async function create(page:Page) {
  await page.goto("/");
  await page.getByRole("button",{name:"New manual inspection",exact:true}).click();
  await page.getByLabel("Inspection title",{exact:true}).fill(title);
}
async function observation(page:Page,name="Human observation one") {
  await page.getByRole("button",{name:"Add observation",exact:true}).click();
  await page.getByLabel("Observation title",{exact:true}).fill(name);
  await page.getByRole("textbox",{name:"Observation description",exact:true}).fill("SYNTHETIC TEST DATA: entered by a human, not generated.");
}
async function reopen(page:Page) {
  await page.getByRole("button").filter({hasText:title}).click();
  await expect(page.getByLabel("Inspection title",{exact:true})).toHaveValue(title);
}
test.beforeEach(async({context})=>{
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname==="/api/analyze")return route.abort();
    return route.continue();
  });
});

test("manual create, photographs, observations, notes, decisions, save, reopen and export",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await create(page);
  await page.getByLabel("Inspection summary").fill("SYNTHETIC TEST DATA: human-authored summary");
  await page.getByRole("textbox",{name:"Inspection notes",exact:true}).fill("Weather recorded by the inspector.");
  const bytes=await png();
  await page.getByLabel("Add photographs",{exact:true}).setInputFiles([{name:"first.png",mimeType:"image/png",buffer:bytes},{name:"second.png",mimeType:"image/png",buffer:bytes}]);
  await expect(page.getByRole("img",{name:"Manual inspection photograph: second.png"})).toBeVisible();
  await observation(page);
  await page.getByLabel("Evidence noted").fill("Visible surface in first photograph.");
  await page.getByLabel("Limitations noted").fill("Hidden structure not inspected.");
  await page.getByLabel("Reviewer decision").selectOption("investigate");
  await page.getByLabel("Reviewer notes").fill("Arrange an independent site check.");
  await observation(page,"Human observation two");
  await page.getByLabel("Reviewer decision").selectOption("accepted");
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  await page.reload();await reopen(page);
  await expect(page.getByRole("textbox",{name:"Inspection notes",exact:true})).toHaveValue("Weather recorded by the inspector.");
  await expect(page.getByRole("img",{name:/Manual inspection photograph:/})).toHaveCount(2);
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("investigate");
  await expect(page.getByLabel("Reviewer notes")).toHaveValue("Arrange an independent site check.");
  await page.getByLabel("Observation title",{exact:true}).fill("Edited human observation");
  await page.getByRole("textbox",{name:"Observation description",exact:true}).fill("Human correction after review.");
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export manual JSON with photographs",exact:true}).click();
  const download=await downloadPromise;
  const exported=JSON.parse(await readFile((await download.path())!,"utf8"));
  expect(exported.format).toBe("sitewitness-manual-v1");
  expect(exported.provenance).toEqual({kind:"manual"});
  expect(exported.inspection.provenance).toEqual({kind:"manual"});
  expect(exported.inspection.report.findings[0].description).toBe("Human correction after review.");
  expect(exported.inspection.report.notice).toContain("No AI analysis was performed");
  expect(exported.photographs).toHaveLength(2);
  expect(Buffer.from(exported.photographs[0].dataUrl.split(",")[1],"base64")).toEqual(bytes);
  await page.reload();await reopen(page);
  await expect(page.getByLabel("Observation title",{exact:true})).toHaveValue("Edited human observation");
  await page.getByRole("button",{name:"2. Human observation two",exact:true}).click();
  await expect(page.getByLabel("Reviewer decision")).toHaveValue("accepted");
  expect(errors).toEqual([]);
});

test("manual photo validation rejects spoofed, oversized, undecodable and excess uploads",async({page})=>{
  await create(page);
  for(const [file,message] of [
    [{name:"fake.png",mimeType:"image/png",buffer:Buffer.from("not an image")},"contents do not match"],
    [{name:"large.png",mimeType:"image/png",buffer:Buffer.alloc(4*1024*1024+1)},"between 1 byte and 4 MB"],
    [{name:"broken.png",mimeType:"image/png",buffer:Buffer.from([137,80,78,71,13,10,26,10])},"could not be decoded"],
    [{name:"bad.txt",mimeType:"text/plain",buffer:Buffer.from("text")},"Use JPEG, PNG, or WebP"],
  ] as const) {
    await page.getByLabel("Add photographs",{exact:true}).setInputFiles(file);
    await expect(page.locator("form").getByRole("alert")).toContainText(message);
    await expect(page.getByRole("img",{name:/Manual inspection photograph:/})).toHaveCount(0);
  }
  const bytes=await png();
  await page.getByLabel("Add photographs",{exact:true}).setInputFiles(Array.from({length:6},(_,i)=>({name:`${i}.png`,mimeType:"image/png",buffer:bytes})));
  await expect(page.locator("form").getByRole("alert")).toContainText("up to five");
});

test("manual save failure retains draft, reports unsaved status, and recovers",async({page})=>{
  await create(page);await observation(page);
  await page.evaluate(()=>{
    const original=IDBDatabase.prototype.transaction;
    (window as unknown as {restoreStorage:()=>void}).restoreStorage=()=>{IDBDatabase.prototype.transaction=original;};
    IDBDatabase.prototype.transaction=function(...args:Parameters<typeof original>){
      if(args[1]==="readwrite")throw new DOMException("Storage quota exceeded","QuotaExceededError");
      return original.apply(this,args);
    };
  });
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Storage quota exceeded");
  await expect(page.getByText("Not saved. Your draft is still open.",{exact:false})).toBeVisible();
  await expect(page.getByRole("textbox",{name:"Observation description",exact:true})).toHaveValue("SYNTHETIC TEST DATA: entered by a human, not generated.");
  await page.evaluate(()=>(window as unknown as {restoreStorage:()=>void}).restoreStorage());
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
});

test("manual concurrent edits are detected without overwriting another tab",async({page,context})=>{
  await create(page);await observation(page);
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  const other=await context.newPage();await other.goto("/");await reopen(other);
  await page.getByRole("textbox",{name:"Inspection notes",exact:true}).fill("First tab change");
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  await other.getByRole("textbox",{name:"Inspection notes",exact:true}).fill("Stale second tab change");
  await other.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(other.locator("form").getByRole("alert")).toContainText("changed in another tab");
  await page.reload();await reopen(page);
  await expect(page.getByRole("textbox",{name:"Inspection notes",exact:true})).toHaveValue("First tab change");
});

test("manual mobile keyboard flow, photograph removal and deletion",async({page})=>{
  await page.setViewportSize({width:375,height:812});await create(page);
  await observation(page);
  await expect(page.getByLabel("Observation title",{exact:true})).toHaveValue("Human observation one");
  const bytes=await png();
  await page.getByLabel("Add photographs",{exact:true}).setInputFiles({name:"mobile.png",mimeType:"image/png",buffer:bytes});
  await expect(page.getByRole("img",{name:"Manual inspection photograph: mobile.png"})).toBeVisible();
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).focus();await page.keyboard.press("Enter");
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/manual-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Remove photograph mobile.png"}).click();
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  await page.reload();await reopen(page);
  await expect(page.getByRole("img",{name:/Manual inspection photograph:/})).toHaveCount(0);
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Delete saved inspection",exact:true}).click();
  await expect(page.getByText("No manual inspections saved yet.",{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText("No manual inspections saved yet.",{exact:true})).toBeVisible();
});


test("manual upload exposes busy state and prevents editing during validation",async({page})=>{
  await create(page);
  await page.evaluate(()=>{
    const original=window.createImageBitmap;
    let release!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    (window as unknown as {releaseDecode:()=>void}).releaseDecode=()=>{release();window.createImageBitmap=original;};
    window.createImageBitmap=((...args:Parameters<typeof createImageBitmap>)=>held.then(()=>Reflect.apply(original,window,args))) as typeof createImageBitmap;
  });
  await page.getByLabel("Add photographs",{exact:true}).setInputFiles({name:"held.png",mimeType:"image/png",buffer:await png()});
  await expect(page.locator("form")).toHaveAttribute("aria-busy","true");
  await expect(page.getByLabel("Inspection title",{exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"New manual inspection",exact:true})).toBeDisabled();
  await expect(page.getByText("Checking photographs…",{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as unknown as {releaseDecode:()=>void}).releaseDecode());
  await expect(page.getByRole("img",{name:"Manual inspection photograph: held.png"})).toBeVisible();
  await expect(page.locator("form")).toHaveAttribute("aria-busy","false");
});


test("first-time view is clear and manual data stays within its browser profile",async({page,browser})=>{
  await create(page);
  await expect(page.getByRole("heading",{name:"Awaiting an inspection"})).toHaveCount(0);
  await page.getByRole("button",{name:"Save manual inspection",exact:true}).click();
  await expect(page.getByText("Saved in this browser, including photographs.",{exact:false})).toBeVisible();
  const isolated=await browser.newContext();
  try {
    await isolated.route("**/*",route=>{
      const url=new URL(route.request().url());
      return !["localhost","127.0.0.1"].includes(url.hostname)||url.pathname==="/api/analyze" ? route.abort() : route.continue();
    });
    const visitor=await isolated.newPage();await visitor.goto("http://127.0.0.1:3107/");
    await expect(visitor.getByText("No manual inspections saved yet.",{exact:true})).toBeVisible();
    await expect(visitor.getByRole("button").filter({hasText:title})).toHaveCount(0);
  } finally {await isolated.close();}
  await page.reload();await reopen(page);
});
