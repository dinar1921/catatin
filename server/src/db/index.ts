import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { applySchema } from "./schema.js";
import { DATA_DIR, DB_PATH } from "./paths.js";
import { backupDatabase } from "./backup.js";
import { getPendingMigrations, runMigrations } from "./migrate.js";

// DATA_DIR: satu titik mount untuk semua data persisten (DB + uploads + backups).
// Bila tidak di-set, fallback ke server/server/data (dev).
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Catat apakah database sudah ada SEBELUM dibuka: hanya database yang sudah
// memiliki data asli yang wajib di-backup sebelum migrasi.
const dbExisted = fs.existsSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
applySchema(db);

// --- Revision 01: backup + migrasi incremental saat startup ---
const pending = getPendingMigrations(db);
if (pending.length > 0) {
  if (dbExisted) {
    // Backup WAJIB sukses sebelum migrasi; jika gagal, throw dan startup berhenti.
    const backup = backupDatabase(db, DB_PATH);
    if (backup) {
      console.log(`[db] Backup sebelum migrasi: ${backup.path} (${backup.size} bytes)`);
    }
  } else {
    console.log("[db] Database baru — backup tidak diperlukan.");
  }
  const to = runMigrations(db);
  console.log(`[db] Migrasi selesai: user_version=${to}`);
}

export { db, DATA_DIR, DB_PATH };
