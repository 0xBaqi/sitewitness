import { recoverBackup } from "../lib/server/recovery";
// Positional paths only. Key comes from protected environment, never argv or logs.
try {
  const [backup, destination, authority, ...extra] = process.argv.slice(2);
  const hex = process.env.SITEWITNESS_STORAGE_KEY;
  if (!backup || !destination || !authority || extra.length || !hex || !/^[a-f0-9]{64}$/i.test(hex)) throw new Error();
  console.log(JSON.stringify(recoverBackup(backup, destination, Buffer.from(hex, "hex"),
    authority === "--discard-all" ? undefined : authority)));
} catch {
  console.error("Recovery failed. Use absolute closed-backup, new-directory and current-authority paths (or --discard-all), with the storage key in the environment.");
  process.exitCode = 1;
}
