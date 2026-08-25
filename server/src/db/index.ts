import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { applySchema } from "./schema.js";

// DATA_DIR: satu titik mount untuk semua data persisten (DB + uploads).
// Bila tidak di-set, fallback ke server/server/data (dev).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "server", "data");

const DB_PATH = path.join(DATA_DIR, "catatin.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
applySchema(db);

export { db, DATA_DIR };
