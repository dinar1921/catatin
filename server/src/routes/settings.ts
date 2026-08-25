import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { DEFAULT_AI_CONFIG, mergeAiConfig, getAiSettings, getCredentials, saveCredentials, type AiConfig } from "../services/ai/index.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const AI_KEY = "ai";

const roleConfigSchema = z.object({
  provider: z.enum(["heuristic", "gemini", "openai", "claude", "custom"]).optional(),
  model: z.string().optional(),
  fallbackProvider: z.enum(["heuristic", "gemini", "openai", "claude", "custom", "none"]).optional(),
  fallbackModel: z.string().optional(),
  temperature: z.number().nullable().optional(),
  maxTokens: z.number().nullable().optional(),
  timeoutMs: z.number().nullable().optional(),
  retryCount: z.number().nullable().optional(),
  customBaseUrl: z.string().optional(),
  enabled: z.boolean().optional(),
});

const aiSchema = z.object({
  roles: z.record(roleConfigSchema).optional(),
  apiKeyConfigured: z.boolean().optional(),
  apiKey: z.string().optional(),
});

/** GET /api/settings/ai — konfigurasi AI (tanpa secret; hanya status key). */
router.get("/ai", requireAdmin, (req: Request, res: Response) => {
  const cfg = getAiSettings(req.groupId!);
  const cred = getCredentials(req.groupId!);
  res.json({
    ...cfg,
    apiKeyConfigured: Boolean(cred),
    apiKeyLast4: cred?.apiKey ? cred.apiKey.slice(-4) : "",
  });
});

/** PUT /api/settings/ai — update konfigurasi AI + opsional API key (admin only). */
router.put("/ai", requireAdmin, (req: Request, res: Response) => {
  const parsed = aiSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const groupId = req.groupId!;
  const current = getAiSettings(groupId);
  const { apiKey, ...rest } = parsed.data;
  const next = mergeAiConfig(current, rest as Partial<AiConfig>);
  const existing = db.prepare("SELECT id FROM settings WHERE group_id = ? AND key = ?").get(groupId, AI_KEY);
  if (existing) {
    db.prepare("UPDATE settings SET value_json = ? WHERE group_id = ? AND key = ?")
      .run(sv(JSON.stringify(next)), sv(groupId), sv(AI_KEY));
  } else {
    db.prepare("INSERT INTO settings (id, group_id, key, value_json) VALUES (?, ?, ?, ?)")
      .run(sv(nid("s")), sv(groupId), sv(AI_KEY), sv(JSON.stringify(next)));
  }
  const provider = next.roles.extraction?.provider ?? next.roles.ocr_vision?.provider ?? "custom";
  if (apiKey && apiKey.trim()) {
    saveCredentials(groupId, provider, apiKey.trim());
    logActivity(groupId, req.profile!.id, "ai.api_key_saved", { provider });
  }
  const cred = getCredentials(groupId);
  res.json({
    ...next,
    apiKeyConfigured: Boolean(cred),
    apiKeyLast4: cred?.apiKey ? cred.apiKey.slice(-4) : "",
  });
});

const testSchema = z.object({
  provider: z.enum(["heuristic", "gemini", "openai", "claude", "custom"]).default("heuristic"),
  model: z.string().optional(),
  customBaseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

async function testConnection(input: { provider: string; model?: string; customBaseUrl?: string; apiKey?: string }) {
  const start = Date.now();
  if (input.provider === "heuristic") {
    return { ok: true, latencyMs: 0, message: "Heuristic berjalan offline tanpa koneksi." };
  }
  const apiKey = input.apiKey || "";
  if (!apiKey) {
    return { ok: false, latencyMs: 0, message: "API key belum diisi." };
  }
  try {
    let url = "";
    let headers: Record<string, string> = {};
    if (input.provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    } else if (input.provider === "claude") {
      url = "https://api.anthropic.com/v1/models";
      headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    } else {
      const base = (input.customBaseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
      url = `${base}/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (r.ok) {
      return { ok: true, latencyMs, message: `Koneksi berhasil (${r.status}) dalam ${latencyMs}ms.` };
    }
    return { ok: false, latencyMs, message: `Koneksi gagal (${r.status}). Cek token/base URL.` };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, message: "Koneksi timeout / tidak dapat dihubungi." };
  }
}

/** POST /api/settings/ai/test — uji koneksi ke provider (tanpa menyimpan). */
router.post("/ai/test", requireAdmin, async (req: Request, res: Response) => {
  const parsed = testSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const cred = getCredentials(req.groupId!);
  const input = {
    ...parsed.data,
    apiKey: parsed.data.apiKey || cred?.apiKey || "",
  };
  const result = await testConnection(input);
  res.json(result);
});

export default router;