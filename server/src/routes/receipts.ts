import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { requireAuth } from "../middleware/auth.js";
import { UPLOADS_DIR } from "../services/uploads.js";

const router = Router();

/**
 * GET /api/receipts/:fileName
 * Mengembalikan file receipt. Auth + verifikasi file milik group (sederhana:
 * file di server/uploads/receipts/ tidak terikat group — cukup dicek bahwa
 * file ada dan user terautentikasi dalam group. Untuk keamanan lebih lanjut,
 * nama file adalah UUID, tidak mudah ditebak).
 */
router.get("/:fileName", requireAuth, (req: Request, res: Response) => {
  const { fileName } = req.params;
  // Hanya izinkan ekstensi gambar.
  if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
    res.status(400).json({ error: "Nama file tidak valid" });
    return;
  }
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File tidak ditemukan" });
    return;
  }
  const ext = path.extname(fileName).toLowerCase();
  const mime: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  res.setHeader("Content-Type", mime[ext] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=86400");
  fs.createReadStream(filePath).pipe(res);
});

export default router;