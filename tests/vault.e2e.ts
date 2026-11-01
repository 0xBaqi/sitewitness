import { test,expect } from "@playwright/test";
import { newManualInspection } from "../lib/inspection";
import sharp from "sharp";
test("real authenticated snapshot upload, account separation, restore and deletion",async({page,context})=>{
 await context.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
 const inspection=newManualInspection();inspection.question="SYNTHETIC vault visit";
 const bytes=await sharp({create:{width:2,height:2,channels:3,background:"red"}}).png().toBuffer();
 inspection.photos=[{id:crypto.randomUUID(),name:"test.png",type:"image/png",size:bytes.length}];
 const archive={format:"sitewitness-manual-v1",provenance:{kind:"manual"},inspection,photographs:[{id:inspection.photos[0].id,dataUrl:`data:image/png;base64,${bytes.toString("base64")}`}]};
 await page.goto("/vault");await page.getByLabel("Personal access token").fill("a".repeat(43));await page.getByRole("button",{name:"Connect",exact:true}).click();
 await expect(page.getByText("Connected. Private snapshots loaded.")).toBeVisible();
 await page.getByLabel("Upload exported inspection JSON").setInputFiles({name:"archive.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(archive))});
 await expect(page.getByRole("heading",{name:inspection.question})).toBeVisible();
 await page.getByRole("button",{name:"Disconnect",exact:true}).click();await page.getByLabel("Personal access token").fill("b".repeat(43));await page.getByRole("button",{name:"Connect",exact:true}).click();await expect(page.getByText("Connected. Private snapshots loaded.")).toBeVisible();await expect(page.getByRole("heading",{name:inspection.question})).toHaveCount(0);
 await page.getByLabel("Personal access token").fill("a".repeat(43));await page.getByRole("button",{name:"Connect",exact:true}).click();await page.getByRole("button",{name:"Restore to this browser"}).click();await expect(page.getByText("Restored as a new browser copy.",{exact:false})).toBeVisible();
 page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Delete snapshot"}).click();await expect(page.getByRole("heading",{name:inspection.question})).toHaveCount(0);
 await page.goto("/");await page.getByRole("button").filter({hasText:inspection.question}).click();await expect(page.getByLabel("Inspection title",{exact:true})).toHaveValue(inspection.question);await expect(page.getByRole("img",{name:"Manual inspection photograph: test.png"})).toBeVisible();
});
