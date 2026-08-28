import type { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.js";

export interface Migration {
  id: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

export function currentVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return Number(row.user_version);
}

export function getPendingMigrations(db: DatabaseSync, list: Migration[] = migrations): Migration[] {
  const v = currentVersion(db);
  return list.filter((m) => m.id > v).sort((a, b) => a.id - b.id);
}

/**
 * Jalankan migrasi yang belum diterapkan secara berurutan.
 *
 * - Setiap migrasi dieksekusi dalam satu transaksi; `PRAGMA user_version`
 *   diperbarui di dalam transaksi yang sama, sehingga versi hanya berubah
 *   setelah migrasi sukses (dan ikut rollback bila gagal — DDL SQLite transaksional).
 * - Migrasi yang sudah diterapkan (id <= user_version) dilewati.
 */
export function runMigrations(db: DatabaseSync, list: Migration[] = migrations): number {
  let version = currentVersion(db);
  for (const m of list) {
    if (m.id <= version) continue;
    db.exec("BEGIN");
    try {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.id}`);
      db.exec("COMMIT");
      version = m.id;
      console.log(`[migrate] applied ${m.id}: ${m.name}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migrasi ${m.id} (${m.name}) gagal: ${(err as Error).message}`);
    }
  }
  return version;
}

export function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function indexExists(db: DatabaseSync, indexName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(indexName) as
    | { name: string }
    | undefined;
  return Boolean(row);
}
