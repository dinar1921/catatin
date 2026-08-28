import path from "node:path";

// DATA_DIR: satu titik mount untuk semua data persisten (DB + uploads + backups).
// Bila tidak di-set, fallback ke server/server/data (dev).
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "server", "data");

export const DB_PATH = path.join(DATA_DIR, "catatin.db");
