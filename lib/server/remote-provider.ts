import { Pool } from "pg";
import { put, get, del } from "@vercel/blob";
import { RemoteStore, type Database } from "./remote-store";
import { ServiceError, readBounded } from "./errors";

export function openNeonDatabase(env:Record<string,string|undefined>):Database {
 let url:URL;
 try {url=new URL(env.DATABASE_URL??"");if(!["postgres:","postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") || !url.hostname.includes("-pooler.") || !url.username || !url.password)throw new Error();}
 catch {throw new ServiceError(503,"A pooled Neon database connection is required.");}
 // Do not let URL sslmode options weaken certificate verification.
 for(const key of [...url.searchParams.keys()])url.searchParams.delete(key);
 const pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000,statement_timeout:20000,idle_in_transaction_session_timeout:30000});
 const db:Database={async transaction(fn){const c=await pool.connect();try{await c.query("BEGIN");const result=await fn(c);await c.query("COMMIT");return result;}catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}},async close(){await pool.end();}};
 return db;
}

export function openRemoteStore(env:Record<string,string|undefined>) {
 if(env.INSPECTION_STORAGE_ENABLED!=="true" || env.SITEWITNESS_STORAGE_PROVIDER!=="neon-blob" || !env.BLOB_READ_WRITE_TOKEN || !/^[a-f0-9]{64}$/i.test(env.SITEWITNESS_STORAGE_KEY??""))throw new ServiceError(503,"Remote storage is not configured.");
 const db=openNeonDatabase(env);
 const token=env.BLOB_READ_WRITE_TOKEN;
 return new RemoteStore(db,{
  async put(path,bytes){await put(path,bytes,{access:"private",token,addRandomSuffix:false,allowOverwrite:true,contentType:"application/octet-stream",abortSignal:AbortSignal.timeout(10000)});},
  async get(path){const result=await get(path,{access:"private",useCache:false,token,abortSignal:AbortSignal.timeout(10000)});if(!result || result.statusCode!==200)throw new Error("Object unavailable");return Buffer.from(await readBounded(result.stream,4*1024*1024+28,AbortSignal.timeout(10000)));},
  async remove(paths){await del(paths,{token,abortSignal:AbortSignal.timeout(10000)});},
 },Buffer.from(env.SITEWITNESS_STORAGE_KEY!,"hex"));
}
