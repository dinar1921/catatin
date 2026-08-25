import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const KEY_PREFIX = "catatin_hk_";

/** Generate key aman dengan prefix. */
function generateKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString("hex");
}

/** Hash SHA-256. */
function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** POST / — buat API key baru (admin only). Mengembalikan plaintext sekali. */
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const name = (req.body?.name as string | undefined)?.trim() ?? "Hermes Key";
  const plain = generateKey();
  const keyHash = hashKey(plain);
  const id = nid("ak");
  db.prepare("INSERT INTO api_keys (id, group_id, name, key_hash, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(sv(id), sv(groupId), sv(name), sv(keyHash), sv(req.profile!.id));
  logActivity(groupId, req.profile!.id, "api_key.create", { keyId: id, name });
  res.status(201).json({ id, name, key: plain });
});

/** GET / — daftar API key aktif (metadata, tanpa hash). */
router.get("/", requireAdmin, (req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT id, name, created_by, created_at, revoked_at FROM api_keys WHERE group_id = ? AND revoked_at IS NULL ORDER BY created_at DESC")
    .all(req.groupId!) as unknown as { id: string; name: string; created_by: string; created_at: string; revoked_at: string | null }[];
  res.json({ keys: rows.map((r) => ({ ...r, revoked: 0 })) });
});

/** DELETE /:id — revoke key. */
router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM api_keys WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "API key tidak ditemukan" });
    return;
  }
  db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND group_id = ?").run(sv(id), sv(req.groupId!));
  logActivity(req.groupId!, req.profile!.id, "api_key.revoke", { keyId: id });
  res.json({ ok: true });
});

/** POST /:id/rotate — buat key baru, revoke yang lama. */
router.post("/:id/rotate", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM api_keys WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "API key tidak ditemukan" });
    return;
  }
  const name = (req.body?.name as string | undefined)?.trim() ?? "Hermes Key";
  const plain = generateKey();
  const keyHash = hashKey(plain);
  const newId = nid("ak");
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND group_id = ?").run(sv(id), sv(req.groupId!));
    db.prepare("INSERT INTO api_keys (id, group_id, name, key_hash, created_by) VALUES (?, ?, ?, ?, ?)")
      .run(sv(newId), sv(req.groupId!), sv(name), sv(keyHash), sv(req.profile!.id));
    db.exec("COMMIT");
    logActivity(req.groupId!, req.profile!.id, "api_key.rotate", { oldKeyId: id, newKeyId: newId, name });
    res.status(201).json({ id: newId, name, key: plain });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[api-keys] rotate error:", err);
    res.status(500).json({ error: "Gagal merotasi key" });
  }
});

export default router;