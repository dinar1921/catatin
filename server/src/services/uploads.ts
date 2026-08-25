import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "../db/index.js";

export const UPLOADS_DIR = process.env.DATA_DIR
  ? path.resolve(DATA_DIR, "uploads", "receipts")
  : path.resolve(process.cwd(), "server", "uploads", "receipts");

/** Pastikan direktori uploads ada. */
export function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Menghapus file yang aman (nama berasal dari whitelist pattern uuid.<ext>). */
export function safeUnlink(fileName: string): boolean {
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/i.test(fileName)) return false;
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
