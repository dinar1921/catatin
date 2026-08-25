/**
 * Layanan bot Telegram — long polling (getUpdates) + pemrosesan update bersama.
 * Dipakai oleh poller background (mode token + chat ID) dan webhook POST (opsional).
 * Referensi: grammY long polling — getUpdates + offset, at-least-once.
 */
import { db } from "../db/index.js";
import { sv, nid } from "../db/sql.js";
import { getAiSettings, getCredentials, parseChatMessage, type ChatParsed } from "./ai/index.js";
import { processReceiptImage } from "./receipt.js";
import { approveDraftById, rejectDraftById } from "./drafts.js";

const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";

/** Secret token Telegram: env diutamakan, lalu config tersimpan (dari set-webhook). */
export function getTelegramSecret(): string {
  if (process.env.TELEGRAM_BOT_SECRET) return process.env.TELEGRAM_BOT_SECRET;
  try {
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'telegram_bot' LIMIT 1").get() as
      | { value_json: string }
      | undefined;
    if (!row) return "";
    const v = JSON.parse(row.value_json) as { webhookSecret?: string };
    return v.webhookSecret ?? "";
  } catch {
    return "";
  }
}

/** Token bot Telegram tersimpan (dari POST /api/telegram/config). */
export function getBotToken(): string {
  try {
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'telegram_bot' LIMIT 1").get() as
      | { value_json: string }
      | undefined;
    if (!row) return "";
    return (JSON.parse(row.value_json) as { token?: string }).token ?? "";
  } catch {
    return "";
  }
}

/** Panggil Telegram Bot API (best-effort). */
export async function telegramApi(method: string, params: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const token = getBotToken();
  if (!token) return null;
  try {
    const r = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Kirim balasan teks + inline keyboard (opsional) ke chat Telegram. */
export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: unknown): Promise<void> {
  const params: Record<string, unknown> = { chat_id: String(chatId), text };
  if (replyMarkup) params.reply_markup = replyMarkup;
  await telegramApi("sendMessage", params);
}

async function answerCallbackQuery(id: string, text: string): Promise<void> {
  await telegramApi("answerCallbackQuery", { callback_query_id: id, text });
}

async function editMessageReplyMarkup(chatId: string | number, messageId: number): Promise<void> {
  await telegramApi("editMessageReplyMarkup", { chat_id: String(chatId), message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

/** Unduh file dari Telegram (foto struk). */
async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const token = getBotToken();
  if (!token) throw new Error("Bot token belum dikonfigurasi");
  const res = await telegramApi("getFile", { file_id: fileId });
  const filePath = (res?.result as { file_path?: string } | undefined)?.file_path;
  if (!filePath) throw new Error("File tidak ditemukan");
  const fr = await fetch(`${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`);
  if (!fr.ok) throw new Error("Gagal mengunduh file");
  return Buffer.from(await fr.arrayBuffer());
}

export function fmtIDR(n: number): string {
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ambil group+profile dari chat mapping Telegram (chatId → groupId). */
export function resolveTelegramChat(chatId: string): { groupId: string; profileId: string | null } | null {
  const link = db.prepare("SELECT group_id, profile_id FROM telegram_chat_links WHERE chat_id = ?").get(chatId) as
    | { group_id: string; profile_id: string | null }
    | undefined;
  if (!link) return null;
  return { groupId: link.group_id, profileId: link.profile_id };
}

function groupOwner(groupId: string): string {
  const row = db.prepare("SELECT owner_profile_id FROM groups WHERE id = ?").get(groupId) as { owner_profile_id: string } | undefined;
  return row?.owner_profile_id ?? groupId;
}

function matchCategory(groupId: string, name: string | null): string | null {
  if (!name) return null;
  const row = db.prepare("SELECT id FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?) LIMIT 1").get(groupId, name) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

/* ------------------------------------------------------------------ */
/*  State klarifikasi per chat                                         */
/* ------------------------------------------------------------------ */
function getPendingChat(chatId: string): { context: string } | null {
  const row = db.prepare("SELECT context FROM chat_pending WHERE chat_id = ?").get(chatId) as { context: string } | undefined;
  return row ?? null;
}
function setPendingChat(chatId: string, groupId: string, context: string): void {
  db.prepare(`INSERT INTO chat_pending (chat_id, group_id, context) VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET context = excluded.context`).run(sv(chatId), sv(groupId), sv(context));
}
function clearPendingChat(chatId: string): void {
  db.prepare("DELETE FROM chat_pending WHERE chat_id = ?").run(sv(chatId));
}

/* ------------------------------------------------------------------ */
/*  Draft dari chat                                                    */
/* ------------------------------------------------------------------ */
function approvalKeyboard(draftId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✓ Setujui", callback_data: `approve:${draftId}` },
        { text: "✗ Tolak", callback_data: `reject:${draftId}` },
      ],
    ],
  };
}

function draftSummary(parsed: ChatParsed): string {
  const t = parsed.type === "income" ? "Pemasukan" : "Pengeluaran";
  const lines = [
    `${t}: ${parsed.amount != null ? fmtIDR(parsed.amount) : "—"}`,
  ];
  if (parsed.merchant) lines.push(`Keterangan: ${parsed.merchant}`);
  if (parsed.date) lines.push(`Tanggal: ${parsed.date}`);
  lines.push("", "Setujui lewat tombol di bawah, atau cek menu Persetujuan di aplikasi.");
  return lines.join("\n");
}

function createDraftFromChat(
  link: { groupId: string; profileId: string | null },
  parsed: ChatParsed,
  context: string,
): string {
  const draftId = nid("d");
  const now = new Date().toISOString();
  const categoryId = matchCategory(link.groupId, parsed.categoryName);
  const uncertain = [
    ...(parsed.amount == null ? ["amount"] : []),
    ...(categoryId ? [] : ["categoryId"]),
    "walletId",
  ];
  db.prepare(`INSERT INTO drafts (id, group_id, source, transaction_type, amount, category_id, wallet_id, occurred_at, merchant, description, items_json, attachment_json, uncertain_fields_json, validation_messages_json, status, owner_profile_id, created_at, updated_at)
    VALUES (?, ?, 'telegram', ?, ?, ?, NULL, ?, ?, ?, '[]', NULL, ?, '[]', 'draft', ?, ?, ?)`)
    .run(
      sv(draftId), sv(link.groupId), sv(parsed.type ?? "expense"), sv(parsed.amount ?? 0), sv(categoryId),
      sv(parsed.date ?? todayISO()), sv(parsed.merchant ?? ""), sv(`Dari chat: ${context}`),
      sv(JSON.stringify(uncertain)), sv(link.profileId), sv(now), sv(now),
    );
  return draftId;
}

async function parseAndRespond(chatId: string | number, link: { groupId: string; profileId: string | null }, text: string): Promise<string | null> {
  const pending = getPendingChat(String(chatId));
  const context = pending ? `${pending.context}\n${text}` : text;

  const aiConfig = getAiSettings(link.groupId);
  const cred = getCredentials(link.groupId);
  const cats = (db.prepare("SELECT name FROM categories WHERE group_id = ?").all(link.groupId) as unknown as { name: string }[])
    .map((c) => c.name);
  const parsed = await parseChatMessage(context, aiConfig, cred?.apiKey ?? null, cats);

  if (!parsed.complete || parsed.amount == null || parsed.amount <= 0 || !parsed.merchant) {
    setPendingChat(String(chatId), link.groupId, context);
    await sendTelegramMessage(chatId, parsed.question ?? "Informasi belum lengkap. Bisa diulangi dengan nominal & keterangan?");
    return null;
  }

  clearPendingChat(String(chatId));
  const draftId = createDraftFromChat(link, parsed, context);
  await sendTelegramMessage(chatId, draftSummary(parsed), approvalKeyboard(draftId));
  return draftId;
}

/* ------------------------------------------------------------------ */
/*  Callback inline keyboard (Setujui / Tolak)                          */
/* ------------------------------------------------------------------ */
async function handleTelegramCallback(cq: {
  id: string;
  data?: string;
  message?: { chat?: { id?: number | string }; message_id?: number };
}): Promise<void> {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  if (chatId === undefined || !messageId) return;
  const data = cq.data ?? "";
  const [action, draftId] = data.split(":");
  if (!draftId) {
    await answerCallbackQuery(cq.id, "Aksi tidak dikenali");
    return;
  }
  const link = resolveTelegramChat(String(chatId));
  if (!link) {
    await answerCallbackQuery(cq.id, "Chat belum terhubung ke Catatin");
    return;
  }
  const draft = db.prepare("SELECT id, merchant FROM drafts WHERE id = ? AND group_id = ?").get(draftId, link.groupId) as
    | { id: string; merchant: string }
    | undefined;
  if (!draft) {
    await answerCallbackQuery(cq.id, "Draft tidak ditemukan");
    return;
  }
  const actor = link.profileId ?? groupOwner(link.groupId);
  try {
    if (action === "approve") {
      approveDraftById(link.groupId, draftId, actor, {});
      await answerCallbackQuery(cq.id, "Transaksi disimpan ✓");
      await editMessageReplyMarkup(chatId, messageId);
      await sendTelegramMessage(chatId, `✓ Transaksi disimpan: "${draft.merchant}". Lihat di aplikasi.`);
    } else if (action === "reject") {
      rejectDraftById(link.groupId, draftId, actor);
      await answerCallbackQuery(cq.id, "Draft ditolak ✗");
      await editMessageReplyMarkup(chatId, messageId);
      await sendTelegramMessage(chatId, "Draft dibatalkan.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memproses";
    console.error("[tg] callback error:", e instanceof Error ? e.stack : e);
    await answerCallbackQuery(cq.id, msg);
  }
}

/* ------------------------------------------------------------------ */
/*  Pemrosesan update (webhook & poller)                                */
/* ------------------------------------------------------------------ */
interface TgUpdate {
  update_id?: number;
  message?: {
    chat?: { id?: number | string };
    text?: string;
    photo?: { file_id?: string }[];
    document?: { file_id?: string; mime_type?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string }; message_id?: number };
  };
}

export async function processTelegramUpdate(update: TgUpdate): Promise<void> {
  // Callback inline keyboard (Setujui/Tolak)
  const cq = update.callback_query;
  if (cq?.id) {
    await handleTelegramCallback(cq as { id: string; data?: string; message?: { chat?: { id?: number | string }; message_id?: number } });
    return;
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text;
  if (chatId === undefined) return;

  // Deep-link bind: "/start KODE" → tautkan chatId ke group pemilik kode (sekali pakai).
  if (text?.trim().startsWith("/start")) {
    const code = text.trim().split(/\s+/)[1]?.toUpperCase();
    if (code) {
      const pending = db
        .prepare("SELECT group_id, value_json FROM settings WHERE key = 'telegram_pending_bind'")
        .all() as unknown as { group_id: string; value_json: string }[];
      for (const row of pending) {
        try {
          const val = JSON.parse(row.value_json) as { code?: string; profileId?: string | null; expiresAt?: number };
          if (val.code === code && val.expiresAt && Date.now() < val.expiresAt) {
            db.prepare(`INSERT INTO telegram_chat_links (id, group_id, chat_id, profile_id) VALUES (?, ?, ?, ?)
              ON CONFLICT(chat_id) DO UPDATE SET group_id = excluded.group_id, profile_id = excluded.profile_id`)
              .run(sv(nid("tl")), sv(row.group_id), sv(String(chatId)), sv(val.profileId ?? null));
            db.prepare("DELETE FROM settings WHERE group_id = ? AND key = 'telegram_pending_bind'").run(sv(row.group_id));
            clearPendingChat(String(chatId));
            const groupRow = db.prepare("SELECT name FROM groups WHERE id = ?").get(row.group_id) as { name: string } | undefined;
            await sendTelegramMessage(
              String(chatId),
              `Chat terhubung ke group "${groupRow?.name ?? "Catatin"}".\nCoba kirim: "beli makan 50rb" atau foto struk.`,
            );
            return;
          }
        } catch { continue; }
      }
    }
    return;
  }

  const link = resolveTelegramChat(String(chatId));
  if (!link) {
    // Chat tak dikenal → beri tahu chat ID-nya agar mudah dihubungkan (mode token + chat ID).
    await sendTelegramMessage(
      String(chatId),
      `Chat ini belum terhubung ke Catatin.\nChat ID kamu: ${String(chatId)}\nBuka Settings → Telegram → masukkan Chat ID ini (atau gunakan link koneksi /start).`,
    );
    return;
  }

  // Foto / dokumen gambar → proses OCR → draft → balas konfirmasi + tombol.
  const photo = message?.photo?.[message.photo.length - 1];
  const document = message?.document;
  const fileId = photo?.file_id ?? (document && String(document.mime_type ?? "").startsWith("image/") ? document.file_id : null);
  if (fileId) {
    try {
      clearPendingChat(String(chatId));
      const buf = await downloadTelegramFile(fileId);
      const { draftId, extracted } = await processReceiptImage(buf, link.groupId, "telegram", link.profileId);
      const total = extracted.amount > 0 ? `: "${extracted.merchant}" ${fmtIDR(extracted.amount)}` : " (nominal belum terbaca)";
      await sendTelegramMessage(chatId, `Struk terbaca${total}\nTinjau lalu setujui lewat tombol di bawah, atau cek menu Persetujuan.`, approvalKeyboard(draftId));
    } catch (e) {
      console.error("[tg] photo error:", e);
      await sendTelegramMessage(chatId, "Gagal memproses foto struk. Coba kirim ulang gambar yang lebih jelas.");
    }
    return;
  }

  if (!text) return;

  // Teks → AI parse (deteksi income/expense) + klarifikasi bila belum lengkap.
  await parseAndRespond(chatId, link, text);
}

/* ------------------------------------------------------------------ */
/*  Long polling (getUpdates) — mode token + chat ID, tanpa webhook     */
/* ------------------------------------------------------------------ */
let pollerTimer: NodeJS.Timeout | null = null;
let pollOffset = 0;
let tickRunning = false;
let conflictBackoffUntil = 0;

/** Jalankan long polling secara berkelanjutan (getUpdates + offset). */
export function startTelegramPoller(): void {
  if (pollerTimer) return;
  pollerTimer = setInterval(() => { void runPollerTick(); }, 3000);
  void runPollerTick();
}

async function runPollerTick(): Promise<void> {
  if (tickRunning) return;
  const token = getBotToken();
  if (!token) return;
  if (Date.now() < conflictBackoffUntil) return;
  tickRunning = true;
  try {
    const res = await telegramApi("getUpdates", {
      offset: pollOffset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });
    if (!res) return;
    if (res.ok === false) {
      const desc = String(res.description ?? "");
      // Konflik getUpdates terjadi bila webhook masih terpasang — jeda sementara.
      if (desc.toLowerCase().includes("conflict")) {
        conflictBackoffUntil = Date.now() + 30_000;
        console.warn("[tg-poller] konflik getUpdates (webhook mungkin masih terpasang). Mencoba lagi dalam 30 detik.");
      }
      return;
    }
    const updates = (res.result as TgUpdate[]) ?? [];
    for (const u of updates) {
      if (typeof u?.update_id === "number") pollOffset = u.update_id + 1;
    }
    for (const u of updates) {
      await processTelegramUpdate(u).catch((e) => console.error("[tg-poller] update error:", e));
    }
  } catch (e) {
    console.warn("[tg-poller] tick error:", e instanceof Error ? e.message : e);
  } finally {
    tickRunning = false;
  }
}