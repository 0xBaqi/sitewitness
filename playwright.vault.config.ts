import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const dir=mkdtempSync(join(tmpdir(),"sitewitness-vault-e2e-"));
export default defineConfig({testDir:"./tests",testMatch:"vault.e2e.ts",workers:1,timeout:60000,use:{baseURL:"http://127.0.0.1:3108"},webServer:{command:"npm run start -- --hostname 127.0.0.1 --port 3108",url:"http://127.0.0.1:3108",reuseExistingServer:false,env:{SITEWITNESS_PUBLIC_ORIGIN:"http://127.0.0.1:3108",MODEL_API_KEY:"",SITEWITNESS_ACCESS_CODE:"",INFERENCE_ENABLED:"false",VERCEL:"",INSPECTION_STORAGE_ENABLED:"true",SITEWITNESS_STORAGE_KEY:"42".repeat(32),SITEWITNESS_DATA_DIR:dir,SITEWITNESS_USERS:JSON.stringify(["a","b"].map(id=>({id,tokenHash:createHash("sha256").update(id.repeat(43)).digest("hex")})))}}});
