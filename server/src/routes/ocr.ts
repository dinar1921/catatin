import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { processReceiptImage } from "../services/receipt.js";

const router = Router();

const MIME_ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    // MIME check
    if (!MIME_ALLOWED.includes(file.mimetype)) {
      cb(new Error("Tipe file harus JPG, PNG, atau WEBP"));
      return;
    }
    cb(null, true);
  },
});

/** Magic bytes check: JPG ffd8ff, PNG 89504e47, WEBP 52494646 */
function checkMagic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // jpg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // png
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true; // riff/webp
  return false;
}

/**
 * POST /api/receipts/upload
 * Upload struk → validasi magic bytes → proses (resize + AI extraction) → draft in_review.
 */
router.post("/upload", requireAuth, (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || "Upload gagal" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "File tidak ditemukan" });
      return;
    }
    const buf = req.file.buffer;
    if (!checkMagic(buf)) {
      res.status(400).json({ error: "File bukan gambar yang valid" });
      return;
    }

    const groupId = req.groupId!;
    try {
      const result = await processReceiptImage(buf, groupId, "receipt_ocr", req.profile!.id);
      res.status(201).json({ id: result.draftId, attachment: result.attachment, extracted: result.extracted });
    } catch (e) {
      console.error("[ocr] upload error:", e);
      res.status(500).json({ error: "Gagal memproses gambar" });
    }
  });
});

export default router;