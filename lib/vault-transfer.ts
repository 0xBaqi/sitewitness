import { manualSchema } from "./inspection";
type RequestJson=(method:string,body?:string,id?:string)=>Promise<any>;
export async function uploadSnapshot(text:string,token:string,remote:boolean,request:RequestJson) {
 if(!remote){await request("POST",text);return;}
 const archive=JSON.parse(text),inspection=manualSchema.parse(archive.inspection);
 if(archive.format!=="sitewitness-manual-v1" || archive.provenance?.kind!=="manual" || !Array.isArray(archive.photographs) || archive.photographs.length!==inspection.photos.length)throw new Error("Invalid manual archive.");
 // Validate all encoding before reserving server storage.
 const photos=inspection.photos.map((meta,i)=>{
  const entry=archive.photographs[i],prefix=`data:${meta.type};base64,`;
  if(entry.id!==meta.id || typeof entry.dataUrl!=="string" || !entry.dataUrl.startsWith(prefix))throw new Error("Invalid photograph.");
  const encoded=entry.dataUrl.slice(prefix.length),decoded=atob(encoded);
  if(btoa(decoded)!==encoded || decoded.length!==meta.size)throw new Error("Invalid photograph encoding.");
  return {meta,bytes:Uint8Array.from(decoded,c=>c.charCodeAt(0))};
 });
 const id=crypto.randomUUID();
 await request("POST",JSON.stringify({id,inspection}));
 try {
  for(const {meta,bytes} of photos){const response=await fetch(`/api/archives?id=${id}&photo=${meta.id}`,{method:"PUT",headers:{authorization:`Bearer ${token}`,"content-type":meta.type},body:bytes,cache:"no-store"});if(!response.ok)throw new Error((await response.json()).error||"Photo upload failed.");}
  await request("POST",undefined,id);
 }catch(error){await request("DELETE",undefined,id).catch(()=>{});throw error;}
}
export async function fetchPhotographs(item:any,token:string):Promise<{id:string;dataUrl:string}[]> {
 if(!item.remote)return item.record.photographs;
 const inspection=manualSchema.parse(item.record.inspection),photos=[];
 for(const meta of inspection.photos){
  const response=await fetch(`/api/archives?id=${item.id}&photo=${meta.id}`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"});
  if(!response.ok)throw new Error("Photograph unavailable. Reconnect and try again.");
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==meta.size)throw new Error("Invalid photograph size.");
  let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  photos.push({id:meta.id,dataUrl:`data:${meta.type};base64,${btoa(binary)}`});
 }
 return photos;
}
