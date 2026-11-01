import { DatabaseSync } from "node:sqlite";
import { chmodSync, copyFileSync, constants, lstatSync, mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { LocalStore } from "./store";

type Snapshot = { id: string; owner: string; data: string; expires: number };
// Offline only: stop every writer before supplying a current authority database.
// Never treat a second old backup as current authority.
export function recoverBackup(backup: string, destination: string, key: Buffer, authority?: string, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || key.length !== 32) throw new Error("Invalid recovery configuration");
  for (const path of [backup, destination, ...(authority ? [authority] : [])])
    if (!isAbsolute(path)) throw new Error("Recovery paths must be absolute");
  if (authority && resolve(backup) === resolve(authority)) throw new Error("Backup cannot authorize itself");
  if (authority) {
    const a = lstatSync(backup), b = lstatSync(authority);
    if (a.dev === b.dev && a.ino === b.ino) throw new Error("Backup cannot authorize itself");
  }
  for (const path of [backup, ...(authority ? [authority] : [])]) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid recovery input");
  }
  // Read-only inputs are never migrated, cleaned or modified.
  const source = new DatabaseSync(backup, { readOnly: true });
  let current: DatabaseSync | undefined;
  let created = false;
  let target: DatabaseSync | undefined;
  let validator: LocalStore | undefined;
  try {
    if (source.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Invalid backup");
    if (authority) {
      current = new DatabaseSync(authority, { readOnly: true });
      if (current.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Invalid authority");
    }
    // New directory only; never overwrite a live database or earlier recovery.
    mkdirSync(destination, { mode: 0o700 });
    created = true;
    const path = join(destination, "sitewitness.sqlite");
    copyFileSync(backup, path, constants.COPYFILE_EXCL);
    chmodSync(path, 0o600);
    target = new DatabaseSync(path);
    target.exec("PRAGMA secure_delete=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
    const rows = target.prepare("SELECT id, owner, data, expires FROM inspections").all() as Snapshot[];
    let retained = 0;
    for (const row of rows) {
      const live = current?.prepare("SELECT id, owner, data, expires FROM inspections WHERE id=? AND owner=?").get(row.id, row.owner) as Snapshot | undefined;
      if (Number.isSafeInteger(row.expires) && row.expires > now && live &&
          live.expires === row.expires && live.data === row.data) retained++;
      else target.prepare("DELETE FROM inspections WHERE id=?").run(row.id);
    }
    // Conservatively preserve usage protections; never refund lifetime reservations.
    if (current) for (const row of current.prepare("SELECT name, count, until FROM counters").all()) {
      target.prepare(`INSERT INTO counters VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET
        count=MAX(counters.count,excluded.count), until=MAX(counters.until,excluded.until)`).run(row.name, row.count, row.until);
    }
    // Missing authority also means lifetime usage history is incomplete: block inference.
    if (!current) target.prepare(`INSERT INTO counters VALUES ('inference-lifetime', ?, ?)
      ON CONFLICT(name) DO UPDATE SET count=excluded.count, until=excluded.until`).run(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    target.exec("COMMIT; VACUUM");
    target.close(); target = undefined;
    // Authenticate every retained envelope before declaring recovery successful.
    validator = new LocalStore(path, key);
    for (const owner of new Set(rows.map(row => row.owner))) validator.list(owner, now);
    validator.close(); validator = undefined;
    return { retained, discarded: rows.length - retained, authority: !!current };
  } catch (error) {
    validator?.close(); target?.close();
    if (created) rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally { current?.close(); source.close(); }
}
