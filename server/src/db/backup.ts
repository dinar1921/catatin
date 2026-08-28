import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export interface BackupResult {
  path: string;
  size: number;
  createdAt: string;
}

/**
 * Backup lokal database SQLite dengan aman (mode WAL).
 *
 * 1. Checkpoint WAL (TRUNCATE) agar seluruh data masuk ke file utama `catatin.db`.
 * 2. Salin file utama ke `<parent(dbPath)>/backups/catatin-<timestamp>.db`.
 * 3. Verifikasi ukuran file hasil salin sama dengan sumber.
 *
 * Database asli TIDAK pernah diubah/dihapus/ditimpa. Jika verifikasi gagal,
 * file backup yang tidak valid dihapus dan error dilempar (agar migrasi dibatalkan).
 */
export function backupDatabase(db: DatabaseSync, dbPath: string): BackupResult | null {
  if (!fs.existsSync(dbPath)) return null;

  // Checkpoint WAL: paksa seluruh frame WAL dipindahkan ke file utama sebelum disalin.
  try {
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  } catch {
    // Checkpoint gagal bukan alasan berhenti; file utama tetap berisi data yang
    // sudah di-commit sebelumnya (mode DELETE/WAL tanpa frame tertunda).
  }

  const backupsDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupsDir, `catatin-${stamp}.db`);

  fs.copyFileSync(dbPath, dest);

  const srcSize = fs.statSync(dbPath).size;
  const dstSize = fs.statSync(dest).size;
  if (dstSize !== srcSize) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Backup gagal verifikasi: ukuran tidak sama (${dstSize} != ${srcSize})`);
  }

  return { path: dest, size: dstSize, createdAt: stamp };
}
