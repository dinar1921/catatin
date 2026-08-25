import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";

/** GET /api/whatsapp/status — status konfigurasi webhook WhatsApp (tanpa secret). */
router.get("/status", requireAdmin, (_req: Request, res: Response) => {
  res.json({
    webhookUrl: `${PUBLIC_BASE_URL}/api/webhooks/whatsapp`,
    secretConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
  });
});

export default router;