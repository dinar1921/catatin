import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";
import { sendTelegramMessage, telegramApi } from "../services/telegram-bot.js";

const router = Router();

const BIND_KEY = "telegram_pending_bind";
const BOT_KEY = "telegram_bot";
const BIND_TTL_MS = 15 * 60 * 1000; // 15 menit
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "catatin_bot";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";

const TELEGRAM_API = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";

interface BotConfig { token: string; username: string; webhookSecret: string }

function getBotConfig(): BotConfig | null {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = ? LIMIT 1").get(BOT_KEY) as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    const v = JSON.parse(row.value_json) as { token?: string; username?: string; webhookSecret?: string };
    if (!v.token) return null;
    return { token: v.token, username: v.username ?? BOT_USERNAME, webhookSecret: v.webhookSecret ?? "" };
  } catch {
    return null;
  }
}

function saveBotConfig(groupId: string, cfg: BotConfig): void {
  const existing = db.prepare("SELECT id FROM settings WHERE key = ?").get(BOT_KEY);
  const value = JSON.stringify(cfg);
  if (existing) {
    db.prepare("UPDATE settings SET value_json = ? WHERE key = ?").run(sv(value), sv(BOT_KEY));
  } else {
    db.prepare("INSERT INTO settings (id, group_id, key, value_json) VALUES (?, ?, ?, ?)")
      .run(sv(nid("s")), sv(groupId), sv(BOT_KEY), sv(value));
  }
}

function getPendingBind(groupId: string): { code: string; profileId: string | null; expiresAt: number } | null {
  const row = db.prepare("SELECT value_json FROM settings WHERE group_id = ? AND key = ?").get(groupId, BIND_KEY) as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    const val = JSON.parse(row.value_json) as { code?: string; profileId?: string; expiresAt?: number };
    if (!val.code || !val.expiresAt) return null;
    if (Date.now() > val.expiresAt) return null;
    return { code: val.code, profileId: val.profileId ?? null, expiresAt: val.expiresAt };
  } catch {
    return null;
  }
}

/** GET /api/telegram/status — status koneksi bot + daftar chat terhubung. */
router.get("/status", requireAdmin, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const links = db
    .prepare(
      `SELECT t.chat_id, t.profile_id, t.created_at, p.name AS profile_name
       FROM telegram_chat_links t LEFT JOIN profiles p ON p.id = t.profile_id
       WHERE t.group_id = ? ORDER BY t.created_at DESC`,
    )
    .all(groupId) as unknown as { chat_id: string; profile_id: string | null; created_at: string; profile_name: string | null }[];
  const pending = getPendingBind(groupId);
  const cfg = getBotConfig();
  const envSecret = process.env.TELEGRAM_BOT_SECRET ?? "";
  const webhookSecret = cfg?.webhookSecret ?? "";
  res.json({
    mode: "polling",
    secretConfigured: Boolean(envSecret || webhookSecret),
    connected: Boolean(cfg?.token),
    botUsername: cfg?.username ?? BOT_USERNAME,
    webhookUrl: `${PUBLIC_BASE_URL}/api/webhooks/telegram`,
    links: links.map((l) => ({
      chatId: l.chat_id,
      profileId: l.profile_id,
      profileName: l.profile_name,
      createdAt: l.created_at,
    })),
    pendingBind: pending ? { code: pending.code, expiresAt: pending.expiresAt } : null,
  });
});

/** POST /api/telegram/connect — hubungkan chat ID secara manual ke group (mode polling). */
router.post("/connect", requireAdmin, (req: Request, res: Response) => {
  const parsed = z.object({ chatId: z.string().min(1, "Chat ID wajib diisi") }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const chatId = parsed.data.chatId.trim();
  if (!/^-?\d+$/.test(chatId)) {
    res.status(400).json({ error: "Chat ID harus berupa angka (bisa negatif untuk group)" });
    return;
  }
  const groupId = req.groupId!;
  db.prepare(`INSERT INTO telegram_chat_links (id, group_id, chat_id, profile_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET group_id = excluded.group_id, profile_id = excluded.profile_id`)
    .run(sv(nid("tl")), sv(groupId), sv(chatId), sv(req.profile!.id));
  logActivity(groupId, req.profile!.id, "telegram.connect", { chatId });
  const groupRow = db.prepare("SELECT name FROM groups WHERE id = ?").get(groupId) as { name: string } | undefined;
  void sendTelegramMessage(chatId, `Chat terhubung ke group "${groupRow?.name ?? "Catatin"}".\nCoba kirim: "beli makan 50rb" atau foto struk.`);
  res.status(201).json({ ok: true, chatId });
});

/** POST /api/telegram/config — simpan token bot (divalidasi via Telegram getMe). */
router.post("/config", requireAdmin, async (req: Request, res: Response) => {
  const parsed = z.object({ botToken: z.string().min(1, "Token bot wajib diisi") }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const token = parsed.data.botToken.trim();
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const body = await r.json() as { ok?: boolean; description?: string; result?: { username?: string; first_name?: string } };
    if (!body.ok) {
      res.status(400).json({ error: body.description ?? "Token bot tidak valid" });
      return;
    }
    const username = body.result?.username ?? BOT_USERNAME;
    const prev = getBotConfig();
    saveBotConfig(req.groupId!, { token, username, webhookSecret: prev?.webhookSecret ?? "" });
    // Mode default = long polling: bersihkan webhook lama agar getUpdates tidak konflik.
    void telegramApi("deleteWebhook", { drop_pending_updates: true });
    logActivity(req.groupId!, req.profile!.id, "telegram.config_saved", { username });
    res.json({ ok: true, botUsername: username });
  } catch (e) {
    console.error("[telegram] getMe error:", e);
    res.status(502).json({ error: "Tidak dapat menghubungi Telegram. Periksa koneksi internet." });
  }
});

/** POST /api/telegram/set-webhook — pasang webhook URL + secret token via Telegram API. */
router.post("/set-webhook", requireAdmin, async (req: Request, res: Response) => {
  const cfg = getBotConfig();
  if (!cfg) {
    res.status(400).json({ error: "Simpan token bot terlebih dahulu" });
    return;
  }
  const secret = cfg.webhookSecret || crypto.randomBytes(24).toString("hex");
  const webhookUrl = `${PUBLIC_BASE_URL}/api/webhooks/telegram`;
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${cfg.token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: secret, drop_pending_updates: true }),
    });
    const body = await r.json() as { ok?: boolean; description?: string; result?: boolean };
    if (!body.ok) {
      res.status(400).json({ error: body.description ?? "Gagal memasang webhook" });
      return;
    }
    saveBotConfig(req.groupId!, { ...cfg, webhookSecret: secret });
    logActivity(req.groupId!, req.profile!.id, "telegram.set_webhook", { webhookUrl });
    res.json({ ok: true, webhookUrl, secretConfigured: true });
  } catch (e) {
    console.error("[telegram] setWebhook error:", e);
    res.status(502).json({ error: "Tidak dapat menghubungi Telegram. Pastikan server dapat diakses publik (HTTPS)." });
  }
});

/** POST /api/telegram/bind-code — generate kode deep-link sekali pakai (expiry 15 menit). */
router.post("/bind-code", requireAdmin, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = Date.now() + BIND_TTL_MS;
  const value = JSON.stringify({ code, profileId: req.profile!.id, expiresAt });
  const existing = db.prepare("SELECT id FROM settings WHERE group_id = ? AND key = ?").get(groupId, BIND_KEY);
  if (existing) {
    db.prepare("UPDATE settings SET value_json = ? WHERE group_id = ? AND key = ?").run(sv(value), sv(groupId), sv(BIND_KEY));
  } else {
    db.prepare("INSERT INTO settings (id, group_id, key, value_json) VALUES (?, ?, ?, ?)")
      .run(sv(nid("s")), sv(groupId), sv(BIND_KEY), sv(value));
  }
  logActivity(groupId, req.profile!.id, "telegram.bind_code_created", { code });
  res.status(201).json({ code, url: `https://t.me/${BOT_USERNAME}?start=${code}`, expiresAt });
});

/** DELETE /api/telegram/links/:chatId — hapus mapping chat dari group. */
router.delete("/links/:chatId", requireAdmin, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const chatId = req.params.chatId;
  const row = db.prepare("SELECT id FROM telegram_chat_links WHERE chat_id = ? AND group_id = ?").get(chatId, groupId);
  if (!row) {
    res.status(404).json({ error: "Chat tidak ditemukan" });
    return;
  }
  db.prepare("DELETE FROM telegram_chat_links WHERE chat_id = ? AND group_id = ?").run(sv(chatId), sv(groupId));
  logActivity(groupId, req.profile!.id, "telegram.unbind", { chatId });
  res.json({ ok: true });
});

export default router;