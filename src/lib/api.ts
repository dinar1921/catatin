/* ------------------------------------------------------------------ */
/* Catatin API client — satu-satunya jalur komunikasi ke backend      */
/* Semua fungsi mengembalikan Promise, menggunakan credentials cookie. */
/* ------------------------------------------------------------------ */
import type {
  AppData,
  CategoryDirection,
  Draft,
  NewTransactionInput,
  PaymentMethod,
  Transaction,
  Wallet,
} from "./types";

const BASE = "/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Permintaan gagal (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch { /* abaikan */ }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */
export function login(email: string, password: string) {
  return request<{ profile: any; group: any }>("POST", "/auth/login", { email, password });
}

export function register(name: string, email: string, password: string) {
  return request<{ profile: any; group: any }>("POST", "/auth/register", { name, email, password });
}

export function logout() {
  return request<{ ok: boolean }>("POST", "/auth/logout");
}

export function getMe() {
  return request<{ profile: any; group: any }>("GET", "/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return request("POST", "/auth/change-password", { currentPassword, newPassword });
}

export function listSessions(): Promise<{ sessions: { id: string; createdAt: string; expiresAt: number; current: boolean }[] }> {
  return request("GET", "/auth/sessions");
}

export function revokeSession(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/auth/sessions/${id}`);
}

export function updateProfile(patch: { name?: string; color?: string }): Promise<{ profile: any }> {
  return request("PATCH", "/profile", patch);
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
export function getDashboard(): Promise<AppData> {
  return request<AppData>("GET", "/dashboard");
}

export function getTransactions(params?: Record<string, string | undefined>): Promise<{ transactions: unknown[] }> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v!)]),
      ).toString()
    : "";
  return request("GET", `/transactions${qs}`);
}

/* ------------------------------------------------------------------ */
/*  Transactions CRUD                                                  */
/* ------------------------------------------------------------------ */
export function createTransaction(input: NewTransactionInput): Promise<{ id: string }> {
  return request("POST", "/transactions", input);
}

export function updateTransaction(id: string, patch: Partial<Transaction>): Promise<{ ok: boolean }> {
  return request("PATCH", `/transactions/${id}`, patch);
}

export function deleteTransaction(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/transactions/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Wallets CRUD                                                       */
/* ------------------------------------------------------------------ */
export function createWallet(w: { name: string; scope: "personal" | "shared"; ownerProfileId: string | null }): Promise<{ id: string }> {
  return request("POST", "/wallets", w);
}

export function updateWallet(id: string, patch: Partial<Pick<Wallet, "name" | "scope" | "ownerProfileId">>): Promise<{ ok: boolean }> {
  return request("PATCH", `/wallets/${id}`, patch);
}

export function deleteWallet(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/wallets/${id}`);
}

export function transferBetweenWallets(input: { fromWalletId: string; toWalletId: string; amount: number; occurredAt?: string; description?: string }): Promise<{ fromTxId: string; toTxId: string }> {
  return request("POST", "/wallets/transfer", input);
}

/* ------------------------------------------------------------------ */
/*  Budgets                                                            */
/* ------------------------------------------------------------------ */
export function createBudget(b: { categoryId: string; amount: number; ownerProfileId: string | null }): Promise<{ id: string }> {
  return request("POST", "/budgets", b);
}

export function updateBudget(id: string, patch: { categoryId?: string; amount?: number; ownerProfileId?: string | null }): Promise<{ ok: boolean }> {
  return request("PATCH", `/budgets/${id}`, patch);
}

export function deleteBudget(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/budgets/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Categories CRUD                                                    */
/* ------------------------------------------------------------------ */
export function createCategory(c: { name: string; direction: string }): Promise<{ id: string }> {
  return request("POST", "/categories", c);
}

export function updateCategory(id: string, patch: { name?: string; direction?: CategoryDirection }): Promise<{ ok: boolean }> {
  return request("PATCH", `/categories/${id}`, patch);
}

export function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/categories/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Groups                                                             */
/* ------------------------------------------------------------------ */
export function updateGroupName(id: string, name: string): Promise<{ ok: boolean }> {
  return request("PATCH", `/groups/${id}/name`, { name });
}

/* ------------------------------------------------------------------ */
/*  Members (management)                                               */
/* ------------------------------------------------------------------ */
export function createMember(input: { name: string; email: string; password: string; role?: "admin" | "member" }): Promise<{ id: string; name: string; email: string; role: string }> {
  return request("POST", "/members", input);
}

export function updateMemberRole(id: string, role: "admin" | "member"): Promise<{ ok: boolean }> {
  return request("PATCH", `/members/${id}/role`, { role });
}

export function deleteMember(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/members/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Bills (pay)                                                        */
/* ------------------------------------------------------------------ */
export function payBill(id: string, opts: { amount: number; walletId: string; method: PaymentMethod | null; full?: boolean }): Promise<{ id: string; paid: number }> {
  return request("POST", `/bills/${id}/pay`, opts);
}

/* ------------------------------------------------------------------ */
/*  Approvals                                                          */
/* ------------------------------------------------------------------ */
export function approveDraft(id: string, patch: Partial<Draft>): Promise<{ id: string }> {
  return request("POST", `/approvals/${id}/approve`, patch);
}

export function rejectDraft(id: string, reason?: string): Promise<{ ok: boolean }> {
  return request("POST", `/approvals/${id}/reject`, { reason });
}

export function deleteDraft(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/approvals/${id}`);
}

export function listApprovals(params?: { source?: string; status?: string }): Promise<{ drafts: Draft[] }> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v!)]),
      ).toString()
    : "";
  return request("GET", `/approvals${qs}`);
}

/* ------------------------------------------------------------------ */
/*  Receipts (OCR)                                                     */
/* ------------------------------------------------------------------ */
export function uploadReceipt(file: File): Promise<{ id: string; attachment: any; extracted: any }> {
  const form = new FormData();
  form.append("file", file);
  return fetch(`${BASE}/receipts/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  }).then(async (res) => {
    if (!res.ok) {
      let msg = `Upload gagal (${res.status})`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch { /* abaikan */ }
      throw new Error(msg);
    }
    return res.json() as Promise<{ id: string; attachment: any; extracted: any }>;
  });
}

/* ------------------------------------------------------------------ */
/*  API Keys (Hermes)                                                  */
/* ------------------------------------------------------------------ */
export function createApiKey(name: string): Promise<{ id: string; name: string; key: string }> {
  return request("POST", "/api-keys", { name });
}

export function listApiKeys(): Promise<{ keys: { id: string; name: string; created_at: string; revoked_at: string | null; revoked: number }[] }> {
  return request("GET", "/api-keys");
}

export function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/api-keys/${id}`);
}

export function rotateApiKey(id: string, name?: string): Promise<{ id: string; name: string; key: string }> {
  return request("POST", `/api-keys/${id}/rotate`, { name });
}

/* ------------------------------------------------------------------ */
/*  AI Settings                                                        */
/* ------------------------------------------------------------------ */
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

export interface AiSettings {
  roles: { ocr_vision: AiRoleConfig; extraction: AiRoleConfig; insight: AiRoleConfig; agent: AiRoleConfig };
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
}

export function getAiSettings(): Promise<AiSettings> {
  return request("GET", "/settings/ai");
}

export function updateAiSettings(patch: { roles?: Partial<Record<keyof AiSettings["roles"], Partial<AiRoleConfig>>>; apiKeyConfigured?: boolean; apiKey?: string }): Promise<AiSettings> {
  return request("PUT", "/settings/ai", patch);
}

export function testAiConnection(input: { provider: string; model?: string; customBaseUrl?: string; apiKey?: string }): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  return request("POST", "/settings/ai/test", input);
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */
export function listNotifications(): Promise<unknown[]> {
  return request("GET", "/notifications");
}

export function markNotifRead(id: string): Promise<{ ok: boolean }> {
  return request("POST", `/notifications/${id}/read`);
}

export function markNotifAllRead(): Promise<{ ok: boolean }> {
  return request("POST", "/notifications/read-all");
}

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */
export function exportReport(
  format: "pdf" | "xlsx",
  params: { from?: string; to?: string; profileId?: string },
): Promise<Blob> {
  const qs = new URLSearchParams({ format });
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.profileId && params.profileId !== "all") qs.set("profileId", params.profileId);
  return fetch(`${BASE}/reports/export?${qs.toString()}`, {
    method: "GET",
    credentials: "include",
  }).then(async (res) => {
    if (!res.ok) {
      let msg = `Export gagal (${res.status})`;
      try {
        const err = await res.json();
        if (err?.error) msg = err.error;
      } catch { /* abaikan */ }
      throw new Error(msg);
    }
    return res.blob();
  });
}

/* ------------------------------------------------------------------ */
/*  Telegram Settings                                                  */
/* ------------------------------------------------------------------ */
export interface TelegramStatus {
  mode: string;
  secretConfigured: boolean;
  connected: boolean;
  botUsername: string;
  webhookUrl: string;
  links: { chatId: string; profileId: string | null; profileName: string | null; createdAt: string }[];
  pendingBind: { code: string; expiresAt: number } | null;
}

export function getTelegramStatus(): Promise<TelegramStatus> {
  return request("GET", "/telegram/status");
}

export function configureTelegram(botToken: string): Promise<{ ok: boolean; botUsername: string }> {
  return request("POST", "/telegram/config", { botToken });
}

export function connectTelegramChat(chatId: string): Promise<{ ok: boolean; chatId: string }> {
  return request("POST", "/telegram/connect", { chatId });
}

export function setTelegramWebhook(): Promise<{ ok: boolean; webhookUrl: string; secretConfigured: boolean }> {
  return request("POST", "/telegram/set-webhook");
}

export function createTelegramBind(): Promise<{ code: string; url: string; expiresAt: number }> {
  return request("POST", "/telegram/bind-code");
}

export function deleteTelegramLink(chatId: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/telegram/links/${encodeURIComponent(chatId)}`);
}

/* ------------------------------------------------------------------ */
/*  WhatsApp Settings                                                  */
/* ------------------------------------------------------------------ */
export interface WhatsAppStatus {
  webhookUrl: string;
  secretConfigured: boolean;
  verifyTokenConfigured: boolean;
}

export function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return request("GET", "/whatsapp/status");
}
