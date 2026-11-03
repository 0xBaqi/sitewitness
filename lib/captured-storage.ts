import { captured, fingerprint, humanReviewSchema, type HumanReview } from "./captured";
export type CapturedReview={human:HumanReview;photo:Blob};
const dbName="sitewitness-captured-review-v1";
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let blocked=false;const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>req.result.createObjectStore("reviews",{keyPath:"human.sourceId"});
  req.onsuccess=()=>{if(blocked){req.result.close();return;}req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(new Error("Browser storage is unavailable. Export your open draft."));
  req.onblocked=()=>{blocked=true;reject(new Error("Close other SiteWitness tabs and try again."));};
});}
async function validate(value:CapturedReview){
  const human=humanReviewSchema.parse(value.human);
  if(!(value.photo instanceof Blob)||value.photo.type!=="image/jpeg"||value.photo.size>1024*1024||await fingerprint(value.photo)!==captured.imageSha256)throw new Error("The retained photograph does not match the captured report.");
  return {human,photo:value.photo};
}
export async function loadCaptured():Promise<CapturedReview|null>{
  const db=await database();try{
    const value=await new Promise<CapturedReview|undefined>((resolve,reject)=>{const req=db.transaction("reviews").objectStore("reviews").get(captured.id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error("Saved review could not be read."));});
    return value?await validate(value):null;
  }finally{db.close();}
}
export async function saveCaptured(value:CapturedReview){
  const checked=await validate(value),db=await database();
  const next={...checked,human:{...checked.human,revision:checked.human.revision+1,savedAt:new Date().toISOString()}};
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("reviews","readwrite"),store=tx.objectStore("reviews");
    let reason="Could not save. Your draft remains open; export it to keep a copy.";
    const req=store.get(captured.id);req.onsuccess=()=>{
      if((req.result?.human.revision??0)!==checked.human.revision){reason="This review changed in another tab. Export your draft, then reopen the saved review.";tx.abort();return;}
      store.put(next);
    };
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(reason));tx.onerror=()=>{};
  });return next;}finally{db.close();}
}
export async function deleteCaptured(revision:number){
  const db=await database();try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("reviews","readwrite"),store=tx.objectStore("reviews"),req=store.get(captured.id);
    req.onsuccess=()=>{if(req.result&&req.result.human.revision!==revision)tx.abort();else store.delete(captured.id);};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error("Review changed or deletion failed. Reopen and try again."));tx.onerror=()=>{};
  });}finally{db.close();}
}
