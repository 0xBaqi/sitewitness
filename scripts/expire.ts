import { openLocalStore } from "../lib/server/store";
// No request traffic or decryption is necessary. Never print credentials or records.
try {
  if (process.env.INSPECTION_STORAGE_ENABLED !== "true") throw new Error();
  const store = openLocalStore();
  try { console.log(JSON.stringify({ expired: store.purgeExpired(Date.now()) })); }
  finally { store.close(); }
} catch { console.error("Expiry cleanup failed; check storage configuration and permissions."); process.exitCode = 1; }
