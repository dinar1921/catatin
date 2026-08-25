import { db } from "../../db/index.js";
import { sv } from "../../db/sql.js";

export interface ReceiptItemExtracted {
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ExtractedReceipt {
  merchant: string;
  amount: number;
  categoryId: string | null;
  occurredAt: string | null;
  items: ReceiptItemExtracted[];
  paymentMethod: string | null;
  uncertainFields: string[];
  validationMessages: string[];
  inReview: boolean;
}

export type AiRoleKey = "ocr_vision" | "extraction" | "insight" | "agent";

export interface AiRoleConfig {
  provider: "heuristic" | "gemini" | "openai" | "claude" | "custom";
  model: string;
  fallbackProvider: "heuristic" | "gemini" | "openai" | "claude" | "custom" | "none";
  fallbackModel: string;
  temperature: number | null;
  maxTokens: number | null;
  timeoutMs: number | null;
  retryCount: number | null;
  customBaseUrl: string;
  enabled: boolean;
}

export interface AiConfig {
  roles: Record<AiRoleKey, AiRoleConfig>;
  apiKeyConfigured: boolean;
}

function defaultRole(): AiRoleConfig {
  return {
    provider: "heuristic",
    model: "heuristic-1",
    fallbackProvider: "none",
    fallbackModel: "",
    temperature: null,
    maxTokens: null,
    timeoutMs: null,
    retryCount: null,
    customBaseUrl: "",
    enabled: true,
  };
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  roles: {
    ocr_vision: defaultRole(),
    extraction: defaultRole(),
    insight: defaultRole(),
    agent: defaultRole(),
  },
  apiKeyConfigured: false,
};

export function mergeAiConfig(base: AiConfig, patch: Partial<AiConfig>): AiConfig {
  const roles = { ...base.roles };
  for (const key of Object.keys(patch.roles ?? {}) as AiRoleKey[]) {
    const p = patch.roles?.[key];
    if (p) roles[key] = { ...roles[key], ...p };
  }
  return { ...base, ...patch, roles };
}

const AI_KEY = "ai";
const CRED_KEY = "ai_credentials";

/** Baca konfigurasi AI dari DB untuk group tertentu. */
export function getAiSettings(groupId: string): AiConfig {
  const row = db.prepare("SELECT value_json FROM settings WHERE group_id = ? AND key = ?").get(groupId, AI_KEY) as
    | { value_json: string }
    | undefined;
  if (!row) return structuredClone(DEFAULT_AI_CONFIG);
  try {
    return mergeAiConfig(structuredClone(DEFAULT_AI_CONFIG), JSON.parse(row.value_json) as Partial<AiConfig>);
  } catch {
    return structuredClone(DEFAULT_AI_CONFIG);
  }
}

/** Baca API key tersimpan (untuk provider yang memerlukan credential). */
export function getCredentials(groupId: string): { provider: string; apiKey: string } | null {
  const row = db.prepare("SELECT value_json FROM settings WHERE group_id = ? AND key = ?").get(groupId, CRED_KEY) as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    const v = JSON.parse(row.value_json) as { provider?: string; apiKey?: string };
    if (!v.apiKey) return null;
    return { provider: v.provider ?? "custom", apiKey: v.apiKey };
  } catch {
    return null;
  }
}

/** Simpan API key untuk group. */
export function saveCredentials(groupId: string, provider: string, apiKey: string): void {
  const value = JSON.stringify({ provider, apiKey });
  const existing = db.prepare("SELECT id FROM settings WHERE group_id = ? AND key = ?").get(groupId, CRED_KEY);
  if (existing) {
    db.prepare("UPDATE settings SET value_json = ? WHERE group_id = ? AND key = ?").run(sv(value), sv(groupId), sv(CRED_KEY));
  } else {
    db.prepare("INSERT INTO settings (id, group_id, key, value_json) VALUES (?, ?, ?, ?)")
      .run(sv(`s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`), sv(groupId), sv(CRED_KEY), sv(value));
  }
}

/** Provider heuristic: hasil ekstraksi contoh yang dapat diedit. */
export function getProvider(config: AiConfig, apiKey: string | null) {
  const role = config.roles.extraction ?? config.roles.ocr_vision ?? defaultRole();
  if (role.provider !== "heuristic" && apiKey) {
    return {
      extractReceipt: (imageBase64: string): Promise<ExtractedReceipt> => extractViaOpenAiCompatible(role, apiKey, imageBase64),
    };
  }
  return {
    extractReceipt: async (_imageBase64?: string): Promise<ExtractedReceipt> => ({
      merchant: "Merchant Contoh",
      amount: 0,
      categoryId: null,
      occurredAt: new Date().toISOString().slice(0, 10),
      items: [],
      paymentMethod: null,
      uncertainFields: ["merchant", "amount", "categoryId"],
      validationMessages: [],
      inReview: true,
    }),
  };
}

async function extractViaOpenAiCompatible(
  role: AiRoleConfig,
  apiKey: string,
  imageBase64: string,
): Promise<ExtractedReceipt> {
  const baseUrl = (role.customBaseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = role.model || "gpt-4o-mini";
  const timeoutMs = role.timeoutMs ?? 30000;

  const systemPrompt = `Extract data from this receipt image. Return raw JSON only (no markdown, no code fences). Schema:
{
  "merchant": "string (nama toko/merchant)",
  "total": "number (total nominal, angka tanpa Rp/koma)",
  "date": "string (YYYY-MM-DD)",
  "items": [{"name": "string", "qty": "number", "price": "number"}],
  "payment_method": "string | null (metode bayar jika terlihat)"
}
If uncertain about a field, set it to null. If image is not a receipt, set merchant to null.`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/webp;base64,${imageBase64}` } },
            { type: "text", text: "Extract receipt data." },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: role.temperature ?? 0.1,
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[ai] OpenAI API error ${res.status}: ${await res.text().catch(() => "")}`);
      return fallback("Provider mengembalikan error");
    }

    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json?.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback("Respons kosong dari AI");

    const parsed = JSON.parse(raw) as {
      merchant?: string | null;
      total?: number | null;
      date?: string | null;
      items?: { name?: string; qty?: number; price?: number }[];
      payment_method?: string | null;
    };

    const uncertainFields: string[] = [];
    const merchant = parsed.merchant ?? "";
    if (!merchant) uncertainFields.push("merchant");
    const amount = typeof parsed.total === "number" && parsed.total > 0 ? parsed.total : 0;
    if (amount <= 0) uncertainFields.push("amount");
    const occurredAt = isValidDate(parsed.date) ? parsed.date! : null;
    if (!occurredAt) uncertainFields.push("occurredAt");
    const paymentMethod = parsed.payment_method ?? null;
    const items = Array.isArray(parsed.items) ? parsed.items.map((i) => ({
      itemName: i.name ?? "",
      quantity: i.qty ?? 1,
      unitPrice: i.price ?? 0,
      totalPrice: (i.qty ?? 1) * (i.price ?? 0),
    })) : [];
    if (!merchant) uncertainFields.push("merchant");

    return {
      merchant,
      amount,
      categoryId: null,
      occurredAt,
      items,
      paymentMethod,
      uncertainFields,
      validationMessages: amount <= 0 ? ["Nominal tidak terdeteksi, periksa manual"] : [],
      inReview: uncertainFields.length > 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memanggil AI";
    console.warn(`[ai] extract failed: ${msg}`);
    return fallback(msg);
  }
}

function fallback(reason: string): ExtractedReceipt {
  return {
    merchant: "Merchant Contoh",
    amount: 0,
    categoryId: null,
    occurredAt: new Date().toISOString().slice(0, 10),
    items: [],
    paymentMethod: null,
    uncertainFields: ["merchant", "amount", "categoryId"],
    validationMessages: [reason],
    inReview: true,
  };
}

function isValidDate(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

/* ================================================================== */
/*  Chat message parsing (bot Telegram/WhatsApp)                       */
/* ================================================================== */

export interface ChatParsed {
  type: "income" | "expense" | null;
  amount: number | null;
  merchant: string | null;
  date: string | null;
  categoryName: string | null;
  complete: boolean;
  question: string | null;
}

function heuristicParseChat(text: string): ChatParsed {
  const clean = text.trim();
  const incomeKw = /(gaji|gajian|jualan|jual|terima|bonus|honor|upah|pemasukan|pendapatan|dapat)\b/i;
  const type = incomeKw.test(clean) ? "income" : "expense";
  const m = clean.match(/(\d+(?:[.,]\d+)?)\s*(rb|k|ribu|juta|jt|m|mil|gocap|goban)?/i);
  let amount: number | null = null;
  if (m) {
    let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "rb" || unit === "k" || unit === "ribu") v *= 1000;
    else if (unit === "juta" || unit === "jt" || unit === "m" || unit === "mil") v *= 1_000_000;
    else if (unit === "gocap") v = 50_000;
    else if (unit === "goban") v = 500_000;
    amount = Math.round(v);
  }
  const merchant = clean.replace(m?.[0] ?? "", "").trim().replace(/^(beli|bayar|catat|transfer|topup|top up|gaji|gajian|jualan|jual|terima|bonus|dapat)\s+/i, "") || null;
  const complete = amount !== null && amount > 0 && !!merchant;
  return {
    type,
    amount,
    merchant,
    date: null,
    categoryName: null,
    complete,
    question: !complete ? (amount === null ? "Berapa nominalnya?" : "Untuk apa transaksi ini? (misal: beli makan 50rb)") : null,
  };
}

/** Parse pesan chat menjadi data transaksi memakai AI (agent role); fallback heuristic. */
export async function parseChatMessage(
  text: string,
  config: AiConfig,
  apiKey: string | null,
  categories: string[],
): Promise<ChatParsed> {
  const role = config.roles.agent ?? config.roles.extraction ?? defaultRole();
  const fallback = heuristicParseChat(text);

  if (role.provider === "heuristic" || !apiKey) {
    return fallback;
  }

  const baseUrl = (role.customBaseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = role.model || "gpt-4o-mini";
  const timeoutMs = role.timeoutMs ?? 30000;

  const prompt = `Kamu adalah asisten pencatat keuangan "Catatin" (bahasa Indonesia). Ekstrak data transaksi dari pesan user.
Kategori yang tersedia: ${categories.join(", ") || "(tidak ada)"}
Balas HANYA JSON (tanpa markdown):
{"type":"expense|income|null","amount":123456|null,"merchant":"string|null","date":"YYYY-MM-DD|null","category":"nama kategori atau null","complete":true|false,"question":"string|null"}
Aturan:
- type=income untuk gaji/gajian/jualan/bonus/honor/pemasukan; type=expense untuk beli/bayar/catat/topup/pengeluaran.
- amount angka penuh rupiah ("50rb"=50000, "5jt"=5000000, "1.250.000"=1250000, "seratus ribu"=100000).
- complete=false bila nominal atau merchant belum jelas; isi question dengan pertanyaan singkat ramah (bahasa Indonesia).
Pesan user: "${text}"`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }],
        max_tokens: 500,
        temperature: role.temperature ?? 0.1,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json?.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      type?: string; amount?: number | string; merchant?: string | null; date?: string | null;
      category?: string | null; complete?: boolean; question?: string | null;
    };
    const num = typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount);
    const amount = Number.isFinite(num) && num > 0 ? Math.round(num) : null;
    const date = parsed.date ?? null;
    return {
      type: parsed.type === "income" ? "income" : parsed.type === "expense" ? "expense" : null,
      amount,
      merchant: parsed.merchant ?? null,
      date: isValidDate(date) ? date : null,
      categoryName: parsed.category ?? null,
      complete: parsed.complete === true && amount !== null && !!parsed.merchant,
      question: parsed.question ?? null,
    };
  } catch (e) {
    console.warn("[ai] parse chat failed:", e instanceof Error ? e.message : e);
    return fallback;
  }
}