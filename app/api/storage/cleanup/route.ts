import { createHash, timingSafeEqual } from "node:crypto";
import { openRemoteStore } from "../../../../lib/server/remote-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET;
 const hash=(s:string)=>createHash("sha256").update(s).digest();
 const headers={"Cache-Control":"no-store"};
 if(!secret || secret.length<32 || !timingSafeEqual(hash(request.headers.get("authorization")??""),hash(`Bearer ${secret}`)))return Response.json({error:"Unauthorized"},{status:401,headers});
 let store;
 try{store=openRemoteStore(process.env);const result=await store.cleanup(Date.now());return Response.json(result,{headers,status:result.remaining?503:200});}
 catch{return Response.json({error:"Cleanup failed; retry required."},{status:503,headers});}
 finally{await store?.close().catch(()=>{});}
}
