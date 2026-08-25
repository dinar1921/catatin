import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { sv } from "../db/sql.js";
import type { ProfileRow } from "./auth.js";

const KEY_PREFIX = "catatin_hk_";
const KEY_WINDOW_MS = 60_000;
const KEY_MAX_HITS = 120;

/** Rate limit per-key (hash -> timestamp). In-memory, cukup untuk single process. */
const perKeyHits = new Map<string, number[]>();

function hitRateLimit(keyHash: string): boolean {
  const now = Date.now();
  const recent = (perKeyHits.get(keyHash) ?? []).filter((t) => now - t < KEY_WINDOW_MS);
  if (recent.length >= KEY_MAX_HITS) return true;
  recent.push(now);
  perKeyHits.set(keyHash, recent);
  return false;
}

function extractKey(authHeader: string | undefined, apiKeyHeader: string | string[] | undefined): string | null {
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const k = authHeader.slice(7).trim();
    if (k) return k;
  }
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader;
  }
  return null;
}

/**
 * Opsional: mengisi req.profile + req.groupId bila header berisi API key valid
 * (Authorization: Bearer <key> atau x-api-key). Request tanpa key dibiarkan
 * lewat agar cookie session tetap jalan. Dipasang SEBELUM requireAuth.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = extractKey(req.headers.authorization, req.headers["x-api-key"]);
  if (!key) {
    next();
    return;
  }

  const normalized = key.trim();
  if (!normalized.startsWith(KEY_PREFIX)) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const keyHash = crypto.createHash("sha256").update(normalized).digest("hex");

  const row = db
    .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(sv(keyHash)) as unknown as
    | { id: string; group_id: string; name: string; key_hash: string; created_by: string; created_at: string; revoked_at: string | null }
    | undefined;

  if (!row) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  if (hitRateLimit(row.key_hash)) {
    res.status(429).json({ error: "Terlalu banyak request. Coba lagi nanti." });
    return;
  }

  const group = db.prepare("SELECT id, name, owner_profile_id FROM groups WHERE id = ?").get(sv(row.group_id)) as
    | { id: string; name: string; owner_profile_id: string }
    | undefined;
  if (!group) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  let profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(sv(group.owner_profile_id)) as unknown as
    | ProfileRow
    | undefined;
  if (!profile || profile.role !== "admin" || profile.is_active !== 1) {
    profile = db
      .prepare("SELECT * FROM profiles WHERE group_id = ? AND role = 'admin' AND is_active = 1 LIMIT 1")
      .get(sv(group.id)) as unknown as ProfileRow | undefined;
  }
  if (!profile) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.profile = profile;
  req.groupId = group.id;
  next();
}
