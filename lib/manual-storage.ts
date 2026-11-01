import { manualSchema, type ManualInspection } from "./inspection";
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
