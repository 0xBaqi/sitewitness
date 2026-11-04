import { createHash } from "node:crypto";
import { createReadStream, lstatSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { NeonInferenceBudget } from "../lib/server/neon-inference-budget";
import { openNeonDatabase } from "../lib/server/remote-provider";

async function sha256(path:string){
 const hash=createHash("sha256");
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest("hex");
}

async function main(){
 const input=process.argv[2];
 if(!input||!isAbsolute(input))throw new Error("Supply the absolute path to the authoritative, closed SQLite database.");
 const path=resolve(input),relativePath=relative(process.cwd(),path);
 if((!relativePath.startsWith(`..${sep}`)&&relativePath!=="..")||path===resolve(path,".."))
  throw new Error("The authoritative counter database must be outside the application checkout.");
 const info=lstatSync(path);
 if(!info.isFile()||info.isSymbolicLink())throw new Error("The authoritative SQLite input must be a regular non-symlink file.");
 const digestBefore=await sha256(path);
 const sqlite=new DatabaseSync(path,{readOnly:true});
 let sourceCount:number,counters:{name:string;count:number;until:number}[];
 try{
  sqlite.exec("PRAGMA query_only=ON");
  const rows=sqlite.prepare("SELECT name,count,until FROM counters ORDER BY name").all() as {name:string;count:number;until:number}[];
  const lifetime=rows.find(row=>row.name==="inference-lifetime");
  if(!lifetime||!Number.isSafeInteger(lifetime.count)||lifetime.count<0)throw new Error("Authoritative lifetime reservation is missing or invalid; no zero-count fallback is allowed.");
  if(rows.some(row=>!Number.isSafeInteger(row.count)||row.count<0||!Number.isSafeInteger(row.until)||row.until<0))throw new Error("Authoritative request counters are invalid.");
  counters=rows;sourceCount=lifetime.count;
 }finally{sqlite.close();}
 const digestAfter=await sha256(path);
 if(digestBefore!==digestAfter)throw new Error("SQLite source changed while it was inspected. Stop all writers and retry with a closed database.");
 const budget=new NeonInferenceBudget(openNeonDatabase(process.env));
 try{
  const result=await budget.importCounters(digestBefore,counters,Date.now());
  process.stdout.write(JSON.stringify({imported:true,sourceSha256:digestBefore,countersImported:counters.length,sourceLifetimeCount:sourceCount,neonLifetimeCount:result.count})+"\n");
 }finally{await budget.close();}
}

main().catch(error=>{
 process.stderr.write(`${error instanceof Error?error.message:"Counter import failed."}\n`);
 process.exitCode=1;
});
