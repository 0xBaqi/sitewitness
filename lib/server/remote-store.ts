import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { manualSchema, manualNotice, type ManualInspection } from "../inspection";
import { ServiceError } from "./errors";
import sharp from "sharp";

export interface Sql { query(text:string, values?:unknown[]):Promise<{rows:any[]}> }
export interface Database { transaction<T>(fn:(sql:Sql)=>Promise<T>):Promise<T>; close():Promise<void> }
export interface Objects { put(path:string,bytes:Buffer):Promise<void>; get(path:string):Promise<Buffer>; remove(paths:string[]):Promise<void> }
export const DAY=86400000;
type Row={id:string;owner:string;data:string;expires:string;pending_until:string;state:string;fingerprint:string};
const missing=()=>new ServiceError(404,"Snapshot unavailable.");

export class RemoteStore {
 constructor(private db:Database, private objects:Objects, private key:Buffer) {
  if(key.length!==32)throw new Error("Invalid encryption key");
 }
 close(){return this.db.close();}
 private encrypt(bytes:Buffer,aad:unknown[]) {
  const iv=randomBytes(12), c=createCipheriv("aes-256-gcm",this.key,iv);
  c.setAAD(Buffer.from(JSON.stringify(["sitewitness-v2",...aad])));
  const body=Buffer.concat([c.update(bytes),c.final()]);
  return Buffer.concat([iv,c.getAuthTag(),body]);
 }
 private decrypt(bytes:Buffer,aad:unknown[]) {
  const d=createDecipheriv("aes-256-gcm",this.key,bytes.subarray(0,12));
  d.setAAD(Buffer.from(JSON.stringify(["sitewitness-v2",...aad])));d.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([d.update(bytes.subarray(28)),d.final()]);
 }
 private record(row:Row):ManualInspection {
  return manualSchema.parse(JSON.parse(this.decrypt(Buffer.from(row.data,"base64"),[row.owner,row.id,Number(row.expires),"metadata"]).toString()));
 }
 private locked<T>(fn:(sql:Sql)=>Promise<T>) {return this.db.transaction(async sql=>{
  // One durable lock serializes quota reservations and photo/delete races across instances.
  const lock=await sql.query("SELECT id FROM sw_lock WHERE id=1 FOR UPDATE");
  if(lock.rows.length!==1)throw new Error("Storage migration is incomplete");return fn(sql);
 });}
 async consume(now:number) {return this.locked(async sql=>{
  const r=(await sql.query("SELECT * FROM sw_counters WHERE name='attempts'")).rows[0];
  const active=r && now<Number(r.until_ms), count=active?Number(r.count):0, until=active?Number(r.until_ms):now+60000;
  if(count>=60)throw new ServiceError(429,"Usage limit reached. Try later.",Math.max(1,Math.ceil((until-now)/1000)));
  await sql.query("INSERT INTO sw_counters VALUES ('attempts',$1,$2) ON CONFLICT(name) DO UPDATE SET count=excluded.count,until_ms=excluded.until_ms",[count+1,until]);
 });}
 async begin(owner:string,id:string,input:unknown,now:number) {
  const inspection=manualSchema.parse(input);inspection.report.notice=manualNotice;
  const json=JSON.stringify(inspection);
  if(Buffer.byteLength(json)>65536)throw new ServiceError(413,"Inspection metadata is too large.");
  const fingerprint=createHmac("sha256",this.key).update(json).digest("hex");
  return this.locked(async sql=>{
   const old=(await sql.query("SELECT * FROM sw_snapshots WHERE id=$1",[id])).rows[0] as Row|undefined;
   if(old){if(old.owner!==owner || old.fingerprint!==fingerprint || old.state==="deleted" || Number(old.expires)<=now || (old.state==="pending" && Number(old.pending_until)<=now))throw new ServiceError(409,"Upload ID is unavailable. Start a new upload.");return {id,expiresAt:new Date(Number(old.expires)).toISOString()};}
   const expires=now+7*DAY, data=this.encrypt(Buffer.from(json),[owner,id,expires,"metadata"]).toString("base64");
   // Reserve conservative base64-equivalent bytes, including all pending photos.
   const allocation=data.length+inspection.photos.reduce((n,p)=>n+4*Math.ceil((p.size+28)/3),0);
   const usage=(await sql.query("SELECT count(*) AS total,COALESCE(sum(allocation),0) AS bytes,count(*) FILTER(WHERE owner=$1) AS own,COALESCE(sum(allocation) FILTER(WHERE owner=$1),0) AS ownbytes FROM sw_snapshots",[owner])).rows[0];
   if(Number(usage.total)>=1000 || Number(usage.own)>=100 || Number(usage.bytes)+allocation>128*1024*1024 || Number(usage.ownbytes)+allocation>40*1024*1024)throw new ServiceError(429,"Snapshot quota reached. Delete older snapshots and allow cleanup to finish.");
   await sql.query("INSERT INTO sw_snapshots(id,owner,fingerprint,data,expires,pending_until,state,allocation) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)",[id,owner,fingerprint,data,expires,now+3600000,allocation]);
   for(const p of inspection.photos)await sql.query("INSERT INTO sw_photos(snapshot,id,path) VALUES($1,$2,$3)",[id,p.id,`snapshots/${randomUUID()}`]);
   return {id,expiresAt:new Date(expires).toISOString()};
  });
 }
 private async row(sql:Sql,owner:string,id:string,now:number,ready=false) {
  const row=(await sql.query("SELECT * FROM sw_snapshots WHERE owner=$1 AND id=$2",[owner,id])).rows[0] as Row|undefined;
  if(!row || row.state==="deleted" || Number(row.expires)<=now || (row.state==="pending" && Number(row.pending_until)<=now) || (ready && row.state!=="ready"))throw missing();
  return row;
 }
 async upload(owner:string,id:string,photo:string,bytes:Buffer,type:string,now:number) {
  return this.locked(async sql=>{
   const row=await this.row(sql,owner,id,now), inspection=this.record(row), meta=inspection.photos.find(p=>p.id===photo);
   if(!meta || meta.size!==bytes.length || meta.type!==type)throw new ServiceError(400,"Invalid photograph.");
   const image=sharp(bytes,{limitInputPixels:24000000}), info=await image.metadata();
   if(info.format!==({"image/jpeg":"jpeg","image/png":"png","image/webp":"webp"} as const)[meta.type])throw new ServiceError(400,"Invalid photograph format.");
   await image.stats();
   const p=(await sql.query("SELECT * FROM sw_photos WHERE snapshot=$1 AND id=$2",[id,photo])).rows[0];
   if(row.state==="ready")throw new ServiceError(409,"Finalized snapshots cannot be changed.");
   const aad=[owner,id,Number(row.expires),photo];
   if(p.uploaded){const previous=this.decrypt(await this.objects.get(p.path),aad);if(!previous.equals(bytes))throw new ServiceError(409,"Photo already uploaded with different bytes.");return;}
   // The object path was committed at begin, so a failed DB commit still leaves a cleanup reference.
   await this.objects.put(p.path,this.encrypt(bytes,aad));
   await sql.query("UPDATE sw_photos SET uploaded=true WHERE snapshot=$1 AND id=$2",[id,photo]);
  });
 }
 async finalize(owner:string,id:string,now:number) {return this.locked(async sql=>{
  const row=await this.row(sql,owner,id,now);
  const missingPhotos=(await sql.query("SELECT id FROM sw_photos WHERE snapshot=$1 AND NOT uploaded",[id])).rows;
  if(missingPhotos.length)throw new ServiceError(409,"Upload all photographs before finalizing.");
  await sql.query("UPDATE sw_snapshots SET state='ready' WHERE id=$1",[id]);
  return {id,expiresAt:new Date(Number(row.expires)).toISOString()};
 });}
 async list(owner:string,now:number,after?:string) {return this.db.transaction(async sql=>{
  const rows=(await sql.query("SELECT * FROM sw_snapshots WHERE owner=$1 AND state='ready' AND expires>$2 AND ($3::uuid IS NULL OR id>$3::uuid) ORDER BY id LIMIT 11",[owner,now,after??null])).rows as Row[];
  const page=rows.slice(0,10);
  return {inspections:page.map(row=>({id:row.id,expiresAt:new Date(Number(row.expires)).toISOString(),record:{format:"sitewitness-manual-v1",provenance:{kind:"manual"},inspection:this.record(row),photographs:[]},remote:true})),nextCursor:rows.length>10?page[9].id:null,transport:"split-v2"};
 });}
 async photo(owner:string,id:string,photo:string,now:number) {return this.locked(async sql=>{
  const row=await this.row(sql,owner,id,now,true), meta=this.record(row).photos.find(p=>p.id===photo);
  if(!meta)throw missing();
  const p=(await sql.query("SELECT path FROM sw_photos WHERE snapshot=$1 AND id=$2 AND uploaded",[id,photo])).rows[0];
  if(!p)throw missing();
  const bytes=this.decrypt(await this.objects.get(p.path),[owner,id,Number(row.expires),photo]);
  if(bytes.length!==meta.size)throw new Error("Corrupt object");
  return {bytes,type:meta.type};
 });}
 async remove(owner:string,id:string) {return this.locked(async sql=>{
  await sql.query("UPDATE sw_snapshots SET state='deleted',data='' WHERE owner=$1 AND id=$2",[owner,id]);
 });}
 async cleanup(now:number) {
  // Logical expiry is unconditional on every read. This job handles physical purge.
  await this.locked(async sql=>{await sql.query("UPDATE sw_snapshots SET state='deleted',data='' WHERE expires<=$1 OR (state='pending' AND pending_until<=$1)",[now]);});
  let cleaned=0;
  const deadline=Date.now()+40000;
  for(let i=0;i<10 && Date.now()<deadline;i++) {
   const count=await this.locked(async sql=>{
    const rows=(await sql.query("SELECT id,expires FROM sw_snapshots WHERE state='deleted' AND (cleaned_at IS NULL OR cleaned_at<=$1) ORDER BY cleaned_at NULLS FIRST,id LIMIT 100",[now-DAY])).rows;
    if(!rows.length)return 0;
    const ids=rows.map(r=>r.id);
    const paths=(await sql.query("SELECT path FROM sw_photos WHERE snapshot=ANY($1::uuid[])",[ids])).rows.map(p=>p.path);
    if(paths.length)await this.objects.remove(paths);
    // Retain tombstones/paths through expiry + 24h to cover ambiguous timed-out uploads.
    await sql.query("DELETE FROM sw_snapshots WHERE id=ANY($1::uuid[]) AND expires<=$2",[ids,now-DAY]);
    await sql.query("UPDATE sw_snapshots SET cleaned_at=$1,allocation=0 WHERE id=ANY($2::uuid[])",[now,ids]);
    return rows.length;
   });
   if(!count)break;cleaned+=count;
  }
  const remaining=await this.db.transaction(async sql=>Number((await sql.query("SELECT count(*) AS n FROM sw_snapshots WHERE state='deleted' AND (cleaned_at IS NULL OR cleaned_at<=$1)",[now-DAY])).rows[0].n));
  return {cleaned,remaining};
 }
}
