import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { sv, nid } from "../db/sql.js";
import { getAiSettings, getCredentials, parseChatMessage } from "../services/ai/index.js";
import { getTelegramSecret, processTelegramUpdate } from "../services/telegram-bot.js";

const router = Router();

const WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

/**
 * Verifikasi webhook WhatsApp (Meta Cloud API): GET hub.challenge.
 */
router.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;
  if (mode === "subscribe" && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN && challenge) {
    res.send(challenge);
    return;
  }
  res.status(403).json({ error: "Verifikasi webhook gagal" });
});

/**
 * Webhook WhatsApp: verifikasi HMAC signature raw-body, lalu buat draft (AI parse).
 * Chat/group tidak dikenal → 200 diabaikan.
 */
router.post("/whatsapp", (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = (req.headers["x-hub-signature-256"] as string | undefined) ?? "";
  if (!WHATSAPP_WEBHOOK_SECRET || !rawBody) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }
  const expected = "sha256=" + crypto.createHmac("sha256", WHATSAPP_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const sig = signature.startsWith("sha256=") ? signature : `sha256=${signature}`;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    res.status(401).json({ error: "Signature tidak valid" });
    return;
  }
  void (async () => {
    let body: { entry?: { changes?: { value?: { messages?: { text?: { body?: string } }[] } }[] }[] } = {};
    try { body = JSON.parse(rawBody.toString("utf8")); } catch { /* abaikan */ }
    const text = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
    if (!text) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    // WhatsApp tidak ter-mapping ke group — sementara: group pertama yang ada.
    const group = db.prepare("SELECT id FROM groups ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
    if (!group) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    const aiConfig = getAiSettings(group.id);
    const cred = getCredentials(group.id);
    const cats = (db.prepare("SELECT name FROM categories WHERE group_id = ?").all(group.id) as unknown as { name: string }[]).map((c) => c.name);
    const parsed = await parseChatMessage(text, aiConfig, cred?.apiKey ?? null, cats);
    const draftId = nid("d");
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO drafts (id, group_id, source, transaction_type, amount, category_id, wallet_id, occurred_at, merchant, description, items_json, attachment_json, uncertain_fields_json, validation_messages_json, status, owner_profile_id, created_at, updated_at)
      VALUES (?, ?, 'whatsapp', ?, ?, ?, NULL, ?, ?, ?, '[]', NULL, ?, '[]', 'draft', NULL, ?, ?)`)
      .run(
        sv(draftId), sv(group.id), sv(parsed.type ?? "expense"), sv(parsed.amount ?? 0), sv(parsed.categoryName ? matchCategory(group.id, parsed.categoryName) : null),
        sv(parsed.date ?? todayISO()), sv(parsed.merchant ?? ""), sv(`Dari chat: ${text}`),
        sv(JSON.stringify(parsed.amount == null ? ["amount", "categoryId", "walletId"] : ["categoryId", "walletId"])),
        sv(now), sv(now),
      );
    res.status(201).json({ ok: true, draftId });
  })().catch(() => res.status(200).json({ ok: true, ignored: true }));
});

/**
 * Webhook Telegram (opsional — alternatif dari long polling).
 * Verifikasi secret token lalu delegasikan pemrosesan ke layanan bot.
 */
router.post("/telegram", (req: Request, res: Response) => {
  const token = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  const expectedSecret = getTelegramSecret();
  if (expectedSecret && token !== expectedSecret) {
    res.status(403).json({ error: "Token tidak valid" });
    return;
  }
  void processTelegramUpdate(req.body ?? {})
    .catch((e) => console.error("[webhook-tg] error:", e))
    .finally(() => res.status(200).json({ ok: true }));
});

function matchCategory(groupId: string, name: string | null): string | null {
  if (!name) return null;
  const row = db.prepare("SELECT id FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?) LIMIT 1").get(groupId, name) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default router;