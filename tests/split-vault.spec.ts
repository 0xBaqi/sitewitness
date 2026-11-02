import { test,expect } from "@playwright/test";
import { newManualInspection } from "../lib/inspection";
import sharp from "sharp";
test("split transport uploads binary photos, restores browser copy, and deletes",async({page,context})=>{
 const inspection=newManualInspection();inspection.question="SYNTHETIC split snapshot";
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
 inspection.photos=[{id:crypto.randomUUID(),name:"split.png",type:"image/png",size:bytes.length}];
 let saved:any,ready=false,photo:Buffer|undefined;const methods:string[]=[];
 await context.route("**/*",async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!=="127.0.0.1" || url.pathname==="/api/analyze")return route.abort();
  if(url.pathname!=="/api/archives")return route.continue();
  expect(request.headers().authorization).toBe(`Bearer ${"a".repeat(43)}`);
  methods.push(request.method());
  const reply=(body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  if(request.method()==="GET" && url.searchParams.has("photo"))return route.fulfill({contentType:"image/png",body:photo!});
  if(request.method()==="GET")return reply({transport:"split-v2",nextCursor:null,inspections:ready?[{id:saved.id,expiresAt:new Date(Date.now()+86400000).toISOString(),remote:true,record:{format:"sitewitness-manual-v1",inspection:saved.inspection,photographs:[]}}]:[]});
  if(request.method()==="POST" && !url.searchParams.has("id")){saved=request.postDataJSON();expect(saved.inspection).toEqual(inspection);expect(saved.photographs).toBeUndefined();return reply({id:saved.id},201);}
  if(request.method()==="PUT"){photo=request.postDataBuffer()!;expect(photo).toEqual(bytes);return reply({uploaded:true});}
  if(request.method()==="POST"){expect(photo).toEqual(bytes);ready=true;return reply({id:saved.id});}
  if(request.method()==="DELETE"){ready=false;return reply({deleted:true});}
  return reply({},405);
 });
 await page.goto("/vault");await page.getByLabel("Personal access token").fill("a".repeat(43));await page.getByRole("button",{name:"Connect",exact:true}).click();
 await expect(page.getByText("Connected. Private snapshots loaded.")).toBeVisible();
 const archive={format:"sitewitness-manual-v1",provenance:{kind:"manual"},inspection,photographs:[{id:inspection.photos[0].id,dataUrl:`data:image/png;base64,${bytes.toString("base64")}`}]};
 await page.getByLabel("Upload exported inspection JSON").setInputFiles({name:"archive.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(archive))});
 await expect(page.getByRole("heading",{name:inspection.question})).toBeVisible();
 await page.getByRole("button",{name:"Restore to this browser"}).click();await expect(page.getByText("Restored as a new browser copy.",{exact:false})).toBeVisible();
 page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Delete snapshot"}).click();await expect(page.getByRole("heading",{name:inspection.question})).toHaveCount(0);
 expect(methods).toContain("PUT");
 await page.goto("/");await page.getByRole("button").filter({hasText:inspection.question}).click();await expect(page.getByRole("img",{name:"Manual inspection photograph: split.png"})).toBeVisible();
});
