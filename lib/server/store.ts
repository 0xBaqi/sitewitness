import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ServiceError } from "./errors";

// Single-host storage only. Never substitute /tmp or memory for durable storage.
export class LocalStore {
  private db: DatabaseSync;
  constructor(path: string, private key?: Buffer) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE;
      PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS inspections (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS inspections_owner ON inspections(owner);`);
  }
  close() { this.db.close(); }
  purgeExpired(now: number) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid cleanup time");
    return Number(this.db.prepare("DELETE FROM inspections WHERE expires<=?").run(now).changes);
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  consume(name: string, max: number, window: number, now: number) {
    if (!Number.isSafeInteger(max) || max < 0 || !Number.isSafeInteger(now) || now < 0)
      throw new ServiceError(503, "Usage protection is unavailable.");
    this.transaction(() => {
      const row = this.db.prepare("SELECT count, until FROM counters WHERE name=?").get(name) as {count: number; until: number} | undefined;
      const active = row && now < row.until;
      const count = active ? row.count : 0;
      const until = active ? row.until : now + window;
      if (count >= max) throw new ServiceError(429, "Usage limit reached. Try later.", Math.max(1, Math.ceil((until-now)/1000)));
      this.db.prepare("INSERT INTO counters VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET count=excluded.count, until=excluded.until").run(name, count+1, until);
    });
  }
  // Lifetime reservations are never refunded, even when upstream fails or the process dies.
  reserve(max: number, now: number) { this.consume("inference-lifetime", max, Number.MAX_SAFE_INTEGER - now, now); }
  private cipherKey() {
    if (this.key?.length !== 32) throw new ServiceError(503, "Inspection storage is unavailable.");
    return this.key;
  }
  save(owner: string, id: string, value: unknown, now: number) {
    const expires = now + 7 * 86400000;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.cipherKey(), iv);
    cipher.setAAD(Buffer.from(JSON.stringify([owner, id, expires])));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    const data = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
    this.transaction(() => {
      this.db.prepare("DELETE FROM inspections WHERE expires<=?").run(now);
      const usage=this.db.prepare("SELECT COALESCE(SUM(length(data)),0) AS n FROM inspections").get() as {n:number};
      const ownUsage=this.db.prepare("SELECT COALESCE(SUM(length(data)),0) AS n FROM inspections WHERE owner=?").get(owner) as {n:number};
      if(usage.n+data.length>128*1024*1024 || ownUsage.n+data.length>40*1024*1024) throw new ServiceError(429,"Photograph storage quota reached. Export and delete older snapshots.");
      const total = this.db.prepare("SELECT COUNT(*) AS n FROM inspections").get() as {n:number};
      const user = this.db.prepare("SELECT COUNT(*) AS n FROM inspections WHERE owner=?").get(owner) as {n:number};
      if (total.n >= 1000 || user.n >= 100) throw new ServiceError(429, "Inspection storage limit reached. Delete older records.");
      this.db.prepare("INSERT INTO inspections VALUES (?, ?, ?, ?)").run(id, owner, data, expires);
    });
    return expires;
  }
  list(owner: string, now: number) {
    this.db.prepare("DELETE FROM inspections WHERE expires<=?").run(now);
    const rows = this.db.prepare("SELECT id, data, expires FROM inspections WHERE owner=? ORDER BY expires DESC LIMIT 100").all(owner) as {id:string; data:string; expires:number}[];
    return rows.map(row => {
      const data = Buffer.from(row.data, "base64");
      const decipher = createDecipheriv("aes-256-gcm", this.cipherKey(), data.subarray(0,12));
      decipher.setAAD(Buffer.from(JSON.stringify([owner, row.id, row.expires])));
      decipher.setAuthTag(data.subarray(12,28));
      const record: unknown = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
      return {id: row.id, expiresAt: new Date(row.expires).toISOString(), record};
    });
  }
  remove(owner: string, id: string) { this.db.prepare("DELETE FROM inspections WHERE owner=? AND id=?").run(owner,id); }
}

export function openLocalStore(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL || !env.SITEWITNESS_DATA_DIR || !isAbsolute(env.SITEWITNESS_DATA_DIR))
    throw new ServiceError(503, "Durable storage is not configured for this host.");
  const dir = resolve(env.SITEWITNESS_DATA_DIR);
  const checkoutRelative = relative(process.cwd(), dir);
  if (!checkoutRelative.startsWith(`..${sep}`) && checkoutRelative !== ".." && !isAbsolute(checkoutRelative))
    throw new ServiceError(503, "Storage must be outside the application checkout.");
  if (dir === resolve(dir, "..")) throw new ServiceError(503, "Invalid storage directory.");
  mkdirSync(dir, {recursive:true, mode:0o700});
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new ServiceError(503, "Invalid storage directory.");
  chmodSync(dir, 0o700);
  const path = `${dir}/sitewitness.sqlite`;
  // Directory must be operator-owned, outside the checkout and any served path.
  let exists = false;
  try { const file = lstatSync(path); exists = true; if (!file.isFile() || file.isSymbolicLink()) throw new Error("Invalid database"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (exists) chmodSync(path, 0o600);
  const hex = env.SITEWITNESS_STORAGE_KEY;
  if (hex && !/^[a-f0-9]{64}$/i.test(hex)) throw new ServiceError(503, "Invalid storage configuration.");
  const store = new LocalStore(path, hex ? Buffer.from(hex, "hex") : undefined);
  chmodSync(path, 0o600);
  return store;
}
