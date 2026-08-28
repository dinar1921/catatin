import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./paths.js";
import { backupDatabase } from "./backup.js";

// Skrip manual: buat backup database tanpa menyentuh alur migrasi startup.
// Jalankan: npm run db:backup
if (!fs.existsSync(DB_PATH)) {
  console.log("Tidak ada database untuk di-backup:", DB_PATH);
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");

try {
  const result = backupDatabase(db, DB_PATH);
  if (result) {
    console.log(`Backup dibuat: ${result.path}`);
    console.log(`Ukuran: ${result.size} bytes`);
  } else {
    console.log("Backup tidak dibuat (database tidak ada).");
  }
} finally {
  db.close();
}
