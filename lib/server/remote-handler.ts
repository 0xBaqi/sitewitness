import { z } from "zod";
import { openRemoteStore } from "./remote-provider";
import { type RemoteStore } from "./remote-store";
import { readBounded, ServiceError } from "./errors";
import { authenticateUser, parseConfiguredUsers } from "./users";
const uuid=(value:string|null)=>{if(!value || !z.string().uuid().safeParse(value).success)throw new ServiceError(400,"Invalid identifier.");return value;};
export function createRemoteHandler(options:{env?:()=>Record<string,string|undefined>;store?:(env:Record<string,string|undefined>)=>RemoteStore;now?:()=>number}={}) {
 return async(request:Request)=>{
  let store:RemoteStore|undefined;
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Vary":"Authorization"};
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
  try {
   const env=options.env?.()??process.env, now=options.now?.()??Date.now();
   if(env.INSPECTION_STORAGE_ENABLED!=="true" || env.SITEWITNESS_STORAGE_PROVIDER!=="neon-blob")throw new ServiceError(503,"Server inspection storage is disabled.");
   let origin:string;
   try {origin=env.SITEWITNESS_PUBLIC_ORIGIN!;if(new URL(origin).origin!==origin)throw new Error();}catch{throw new ServiceError(503,"Public origin is not configured.");}
   if((request.headers.get("origin") && request.headers.get("origin")!==origin) || request.headers.get("sec-fetch-site")==="cross-site")throw new ServiceError(403,"Invalid request origin.");
   const users=parseConfiguredUsers(env.SITEWITNESS_USERS);
   store=(options.store??openRemoteStore)(env);await store.consume(now);
   const user=authenticateUser(request.headers.get("authorization")??"",users);
   const url=new URL(request.url),id=url.searchParams.get("id"),photo=url.searchParams.get("photo");
   if(request.method==="GET") {
    if(photo){const data=await store.photo(user.id,uuid(id),uuid(photo),now);return new Response(new Uint8Array(data.bytes),{headers:{...headers,"Content-Type":data.type,"Content-Disposition":"attachment"}});}
    const after=url.searchParams.get("after");return reply(await store.list(user.id,now,after?uuid(after):undefined));
   }
   if(request.method==="DELETE"){await store.remove(user.id,uuid(id));return reply({deleted:true});}
   if(request.method==="PUT"){
    const sid=uuid(id),pid=uuid(photo),type=request.headers.get("content-type")??"";
    if(!["image/png","image/jpeg","image/webp"].includes(type))throw new ServiceError(415,"Send an image.");
    const bytes=Buffer.from(await readBounded(request.body,4*1024*1024,AbortSignal.timeout(10000)));
    try{await store.upload(user.id,sid,pid,bytes,type,now);}catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError(503,"Photograph validation or storage failed.");}
    return reply({uploaded:true});
   }
   if(request.method==="POST") {
    if(id)return reply(await store.finalize(user.id,uuid(id),now));
    if(request.headers.get("content-type")?.split(";")[0]!=="application/json")throw new ServiceError(415,"Send JSON metadata.");
    const bytes=await readBounded(request.body,65536,AbortSignal.timeout(10000));
    let body:{id:string;inspection:unknown};
    try{body=z.object({id:z.string().uuid(),inspection:z.unknown()}).strict().parse(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw new ServiceError(400,"Invalid upload metadata.");}
    try{return reply(await store.begin(user.id,body.id,body.inspection,now),201);}catch(e){if(e instanceof z.ZodError)throw new ServiceError(400,"Invalid manual inspection.");throw e;}
   }
   throw new ServiceError(405,"Method not supported.");
  }catch(e){const response=reply({error:e instanceof ServiceError?e.message:"Inspection storage is unavailable."},e instanceof ServiceError?e.status:503);if(e instanceof ServiceError && e.retryAfter)response.headers.set("Retry-After",String(e.retryAfter));return response;}
  finally{await store?.close().catch(()=>{});}
 };
}
