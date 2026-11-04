import { manualSchema, newManualInspection, type ManualInspection } from "./inspection";
import { reportSchema } from "./schema";
import { loadPhoto } from "./photos";
import { captured } from "./captured";
import { loadCaptured } from "./captured-storage";
export type StoredManual = {inspection:ManualInspection; photos:Blob[]};
function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    let blocked=false;
    const req=indexedDB.open("sitewitness-manual",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("inspections",{keyPath:"inspection.id"});
    req.onsuccess=()=>{if(blocked){req.result.close();return;}req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(new Error("Browser storage is unavailable. Export your draft to keep a copy."));
    req.onblocked=()=>{blocked=true;reject(new Error("Close other SiteWitness tabs and try again."));};
  });
}
export async function listManual():Promise<StoredManual[]> {
  const db=await database();
  try {
    return await new Promise((resolve,reject)=>{
      const req=db.transaction("inspections").objectStore("inspections").getAll();
      req.onerror=()=>reject(new Error("Saved inspections could not be read."));
      req.onsuccess=()=>{
        try {
          const records=req.result.map(value=>{
            const inspection=manualSchema.parse(value.inspection);
            if(!Array.isArray(value.photos)||value.photos.length!==inspection.photos.length||value.photos.some((p:unknown,i:number)=>!(p instanceof Blob)||p.size!==inspection.photos[i].size||p.type!==inspection.photos[i].type)) throw new Error("Invalid photos");
            return {inspection,photos:value.photos as Blob[]};
          });
          resolve(records.sort((a,b)=>b.inspection.date.localeCompare(a.inspection.date)));
        }catch{reject(new Error("Saved manual data is damaged. Nothing was overwritten. Export any open draft and recover from a backup."));}
      };
    });
  }finally{db.close();}
}

// Copy old localStorage report formats into the current inspection store without
// deleting their source records or changing the existing photograph database.
export async function migrateLegacyInspections():Promise<number> {
  const migrationKey="sitewitness-legacy-imported-v1";
  let imported=new Set<string>();
  try{const value:unknown=JSON.parse(localStorage.getItem(migrationKey)||"[]");if(Array.isArray(value))imported=new Set(value.filter(x=>typeof x==="string"));}catch{}
  const existingRecords=await listManual(),knownIds=new Set(existingRecords.map(item=>item.inspection.id));
  const sources=[
    ["sitewitness-inspections-v1","saved"],
    ["sitewitness-live-reviews-v1","live"],
  ] as const;
  let count=0;
  for(const [key,kind] of sources){
    let entries:unknown;
    try{entries=JSON.parse(localStorage.getItem(key)||"[]");}catch{continue;}
    if(!Array.isArray(entries))continue;
    for(const rawEntry of entries){
      if(!rawEntry||typeof rawEntry!=="object"||Array.isArray(rawEntry))continue;
      const entry=rawEntry as Record<string,unknown>;
      if(typeof entry.id!=="string"||typeof entry.question!=="string"||typeof entry.filename!=="string")continue;
      const marker=`${kind}:${entry.id}`;
      if(imported.has(marker))continue;
      try{
        const report=reportSchema.parse(entry.report),inspection=newManualInspection();
        const sameId=zUuid(entry.id)?entry.id:await stableUuid(`${kind}:${entry.id}`);
        if(knownIds.has(sameId)){imported.add(marker);continue;}
        inspection.id=sameId;inspection.question=entry.question.slice(0,500);inspection.filename=entry.filename.slice(0,255);
        inspection.date=typeof entry.date==="string"&&Number.isFinite(Date.parse(entry.date))?new Date(entry.date).toISOString():typeof entry.generatedAt==="string"&&Number.isFinite(Date.parse(entry.generatedAt))?new Date(entry.generatedAt).toISOString():new Date().toISOString();
        inspection.report=report;inspection.reviews=validReviews(entry.reviews,report.findings.map(f=>f.id));
        inspection.edits=validTextMap(entry.edits,report.findings.map(f=>f.id),1200);inspection.notes=validTextMap(entry.notes,report.findings.map(f=>f.id),1000);
        const blob=await loadPhoto(entry.id).catch(()=>undefined);
        let photoId:string|null=null;
        if(blob&&blob.size>0&&blob.size<=4*1024*1024&&["image/jpeg","image/png","image/webp"].includes(blob.type)){
          const file=new File([blob],inspection.filename||"saved-photo",{type:blob.type});
          await validateManualPhoto(file);
          photoId=crypto.randomUUID();inspection.photos=[{id:photoId,name:file.name.slice(0,255),type:file.type as "image/jpeg"|"image/png"|"image/webp",size:file.size}];
        }
        const provenance=entry.provenance&&typeof entry.provenance==="object"?entry.provenance as Record<string,unknown>:{};
        const model=entry.model==="muse-spark-1.3"?entry.model:provenance.model==="muse-spark-1.3"?provenance.model:null;
        if(model){
          inspection.aiFindingIds=report.findings.map(f=>f.id);
          inspection.aiAnalysis={model,generatedAt:typeof entry.generatedAt==="string"&&Number.isFinite(Date.parse(entry.generatedAt))?new Date(entry.generatedAt).toISOString():null,photoId,imageSha256:typeof entry.imageSha256==="string"&&/^[a-f0-9]{64}$/i.test(entry.imageSha256)?entry.imageSha256:null,overview:report.overview,source:"legacy"};
        }
        await saveManual({inspection,photos:blob&&photoId?[blob]:[]});
        knownIds.add(sameId);imported.add(marker);count++;
      }catch{
        // Another tab may have imported this same deterministic ID while this
        // tab was preparing it. Treat that as success after confirming it.
        try{const expectedId=zUuid(entry.id)?entry.id:await stableUuid(`${kind}:${entry.id}`);if((await listManual()).some(item=>item.inspection.id===expectedId)){knownIds.add(expectedId);imported.add(marker);}}catch{}
        // Keep unreadable legacy entries untouched in their source store.
      }
    }
  }
  const capturedMarker=`captured:${captured.id}`;
  if(!imported.has(capturedMarker))try{
    const old=await loadCaptured();
    if(old){
      const id=await stableUuid(capturedMarker);
      if(knownIds.has(id))imported.add(capturedMarker);
      else {
      const inspection=newManualInspection(),photoId=crypto.randomUUID(),file=new File([old.photo],"captured-construction.jpg",{type:"image/jpeg"});
      inspection.id=id;
      await validateManualPhoto(file);
      inspection.question="Review captured construction photograph";inspection.filename=file.name;
      inspection.date=captured.generatedAt;inspection.report=captured.report;
      inspection.photos=[{id:photoId,name:file.name,type:"image/jpeg",size:file.size}];
      inspection.aiFindingIds=captured.report.findings.map(f=>f.id);
      inspection.aiAnalysis={model:captured.model,generatedAt:captured.generatedAt,photoId,imageSha256:captured.imageSha256,overview:captured.report.overview,source:"legacy"};
      inspection.reviews=validReviews(old.human.reviews,captured.report.findings.map(f=>f.id));
      inspection.edits=validTextMap(old.human.edits,captured.report.findings.map(f=>f.id),1200);
      inspection.notes=validTextMap(old.human.notes,captured.report.findings.map(f=>f.id),1000);
      inspection.inspectionNotes=[old.human.reviewer?`Previous self-reported reviewer: ${old.human.reviewer}`:"",...old.human.answers.map((answer,index)=>answer?`Response to question ${index+1}: ${answer}`:"")].filter(Boolean).join("\n").slice(0,3000);
      await saveManual({inspection,photos:[old.photo]});
      knownIds.add(id);imported.add(capturedMarker);count++;
      }
    }
  }catch{ /* Preserve an invalid or unavailable captured review in its original database. */ }
  // Merge markers written by a competing tab so a slower migration cannot
  // overwrite another tab's completion record.
  try{const value:unknown=JSON.parse(localStorage.getItem(migrationKey)||"[]");if(Array.isArray(value))for(const item of value)if(typeof item==="string")imported.add(item);}catch{}
  localStorage.setItem(migrationKey,JSON.stringify([...imported]));
  return count;
}
function zUuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
async function stableUuid(value:string){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`sitewitness-legacy:${value}`))),bytes=digest.slice(0,16);
 bytes[6]=(bytes[6]&0x0f)|0x50;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function validReviews(raw:unknown,ids:string[]):ManualInspection["reviews"] {
  const result:Record<string,"unreviewed"|"accepted"|"rejected"|"investigate">={};
  if(raw&&typeof raw==="object")for(const [id,value] of Object.entries(raw))if(ids.includes(id)&&["unreviewed","accepted","rejected","investigate"].includes(String(value)))result[id]=value as typeof result[string];
  return result;
}
function validTextMap(raw:unknown,ids:string[],max:number):Record<string,string> {
  const result:Record<string,string>={};
  if(raw&&typeof raw==="object")for(const [id,value] of Object.entries(raw))if(ids.includes(id)&&typeof value==="string")result[id]=value.slice(0,max);
  return result;
}
export async function saveManual(value:StoredManual):Promise<StoredManual> {
  const parsed=manualSchema.safeParse(value.inspection);
  if(!parsed.success)throw new Error("Enter an inspection title and a title and description for every observation. Check field limits.");
  if(value.photos.length!==parsed.data.photos.length||value.photos.some((p,i)=>p.size!==parsed.data.photos[i].size||p.type!==parsed.data.photos[i].type))throw new Error("Photograph data is incomplete.");
  const next={inspection:{...parsed.data,revision:parsed.data.revision+1},photos:value.photos};
  const db=await database();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction("inspections","readwrite");
      const store=tx.objectStore("inspections");
      let reason="Could not save in this browser. Free storage space or export the draft; your edits are still open.";
      const existing=store.get(parsed.data.id);
      existing.onsuccess=()=>{
        if((existing.result?.inspection.revision??0)!==parsed.data.revision){reason="This inspection changed in another tab. Export your draft, then reopen the saved version.";tx.abort();return;}
        const count=store.count();
        count.onsuccess=()=>{
          if(!existing.result && count.result>=25){reason="This browser holds 25 manual inspections. Export and delete an older one before saving another.";tx.abort();return;}
          try { store.put(next); } catch { tx.abort(); }
        };
      };
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(new Error(reason));
      tx.onerror=()=>{ /* onabort reports the transaction failure */ };
    });
    return next;
  }finally{db.close();}
}
export async function deleteManual(id:string,revision:number) {
  const db=await database();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction("inspections","readwrite"), store=tx.objectStore("inspections");
      const req=store.get(id);
      req.onsuccess=()=>{if(req.result && req.result.inspection.revision!==revision)tx.abort();else store.delete(id);};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error("Could not delete. Reopen the inspection and try again."));
    });
  }finally{db.close();}
}
// Decode locally before retention. No photograph leaves the browser in manual mode.
export async function validateManualPhoto(file:File) {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Use JPEG, PNG, or WebP photographs.");
  if(!file.size||file.size>4*1024*1024)throw new Error("Each photograph must be between 1 byte and 4 MB.");
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const signature=file.type==="image/jpeg" ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 : file.type==="image/png" ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) : String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!signature)throw new Error("Photograph contents do not match the file type.");
  let image:ImageBitmap;
  try{image=await createImageBitmap(file);}catch{throw new Error("This photograph could not be decoded. Choose a valid JPEG, PNG, or WebP.");}
  const pixels=image.width*image.height; image.close();
  if(pixels>24000000)throw new Error("Photographs must be under 24 megapixels.");
}
export async function exportManual(value:StoredManual) {
  const photos=await Promise.all(value.photos.map((blob,index)=>new Promise<{id:string;dataUrl:string}>((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error("Photograph export failed."));
    reader.onload=()=>resolve({id:value.inspection.photos[index].id,dataUrl:String(reader.result)});reader.readAsDataURL(blob);
  })));
  return {format:"sitewitness-manual-v1",provenance:{kind:"manual"},inspection:value.inspection,photographs:photos};
}
