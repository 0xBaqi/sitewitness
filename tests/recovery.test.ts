import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, existsSync, linkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { LocalStore } from "../lib/server/store";
import { recoverBackup } from "../lib/server/recovery";

const key = Buffer.alloc(32, 71), week = 7 * 86400000;
globalThis.fetch = async () => { throw new Error("External HTTP forbidden"); };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sitewitness-recovery-"));
  const primary = join(root, "primary.sqlite"), backup = join(root, "backup.sqlite"), out = join(root, "restored");
  return { root, primary, backup, out, clean: () => rmSync(root, {recursive:true, force:true}) };
}
test("isolated recovery drill reconciles post-backup deletion, exact expiry, ownership, photos and usage across restart", () => {
  const f = fixture();
  try {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const record = { provenance: {kind:"manual"}, photographs: [{dataUrl:photo}] };
    let db = new LocalStore(f.primary, key);
    db.save("alice", "expired", record, 100);
    db.save("alice", "deleted", record, 101);
    db.save("alice", "keep", record, 101);
    db.save("bob", "bob-only", record, 101);
    db.reserve(10, 100); db.close();
    copyFileSync(f.primary, f.backup);
    const original = readFileSync(f.backup);
    db = new LocalStore(f.primary, key);
    db.remove("bob", "keep"); // A foreign deletion cannot suppress Alice's recovery.
    db.remove("alice", "deleted");
    db.reserve(10, 101); db.close();
    const authority = readFileSync(f.primary);
    assert.deepEqual(recoverBackup(f.backup, f.out, key, f.primary, 100 + week),
      {retained:2, discarded:2, authority:true});
    assert.deepEqual(readFileSync(f.backup), original);
    assert.deepEqual(readFileSync(f.primary), authority);
    const path = join(f.out, "sitewitness.sqlite");
    const raw = new DatabaseSync(path, {readOnly:true});
    assert.deepEqual(raw.prepare("SELECT id FROM inspections ORDER BY id").all().map(r=>r.id), ["bob-only","keep"]);
    raw.close();
    db = new LocalStore(path, key);
    assert.deepEqual(db.list("alice", 100+week).map(r=>r.id), ["keep"]);
    assert.deepEqual(db.list("alice", 100+week)[0].record, record);
    assert.deepEqual(db.list("bob", 100+week).map(r=>r.id), ["bob-only"]);
    assert.throws(()=>db.reserve(2, 102)); db.close();
    db = new LocalStore(path,key);
    assert.equal(db.list("alice",100+week)[0].expiresAt,new Date(101+week).toISOString());
    assert.equal(db.purgeExpired(101+week),2); db.close();
    assert.equal(statSync(f.out).mode & 0o777,0o700);
    assert.equal(statSync(path).mode & 0o777,0o600);
  } finally { f.clean(); }
});
test("missing authority discards all snapshots and blocks refunded inference; invalid authority fails closed", () => {
  const f=fixture();
  try {
    const db=new LocalStore(f.primary,key); db.save("alice","id",{private:"synthetic"},100); db.close();
    copyFileSync(f.primary,f.backup);
    assert.throws(()=>recoverBackup(f.backup,f.out,key,join(f.root,"missing"),101));
    assert.equal(existsSync(f.out),false);
    assert.deepEqual(recoverBackup(f.backup,f.out,key,undefined,101),{retained:0,discarded:1,authority:false});
    const restored=new LocalStore(join(f.out,"sitewitness.sqlite"),key);
    assert.deepEqual(restored.list("alice",101),[]);
    assert.throws(()=>restored.reserve(1000,101)); restored.close();
    assert.throws(()=>recoverBackup(f.backup,f.out,key,undefined,101));
  } finally { f.clean(); }
});
test("wrong key, self-authority, invalid time and tampering cannot publish a recovered directory",()=>{
  const f=fixture();
  try {
    const db=new LocalStore(f.primary,key); db.save("alice","id",{private:"synthetic"},100); db.close();
    copyFileSync(f.primary,f.backup);
    assert.throws(()=>recoverBackup(f.backup,f.out,key,f.backup,101));
    const alias=join(f.root,"alias.sqlite"); linkSync(f.backup,alias);
    assert.throws(()=>recoverBackup(f.backup,f.out,key,alias,101));
    const symlink=join(f.root,"symlink.sqlite"); symlinkSync(f.primary,symlink);
    assert.throws(()=>recoverBackup(f.backup,f.out,key,symlink,101));
    assert.throws(()=>recoverBackup(f.backup,f.out,key,f.primary,NaN));
    assert.throws(()=>recoverBackup(f.backup,f.out,Buffer.alloc(32),f.primary,101));
    assert.equal(existsSync(f.out),false);
    const raw=new DatabaseSync(f.backup); raw.prepare("UPDATE inspections SET expires=expires+1").run(); raw.close();
    assert.deepEqual(recoverBackup(f.backup,f.out,key,f.primary,101),{retained:0,discarded:1,authority:true});
  } finally { f.clean(); }
});

test("operator CLI recovers into isolation and fails privately without a valid key",()=>{
  const f=fixture();
  try {
    const db=new LocalStore(f.primary,key); db.save("alice","id",{private:"synthetic"},Date.now()); db.close();
    copyFileSync(f.primary,f.backup);
    const args=["--import","tsx","scripts/recover.ts",f.backup,f.out,f.primary];
    const env={...process.env,SITEWITNESS_STORAGE_KEY:key.toString("hex")};
    const output=execFileSync(process.execPath,args,{env,encoding:"utf8"});
    assert.deepEqual(JSON.parse(output),{retained:1,discarded:0,authority:true});
    const failed=spawnSync(process.execPath,args,{env:{...env,SITEWITNESS_STORAGE_KEY:"invalid-secret"},encoding:"utf8"});
    assert.equal(failed.status,1);
    assert.equal(failed.stderr.includes("invalid-secret"),false);
    assert.equal(failed.stdout,"");
  } finally {f.clean();}
});
