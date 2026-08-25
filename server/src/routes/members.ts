import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { db } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(60),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  role: z.enum(["admin", "member"]).optional(),
});

const roleSchema = z.object({ role: z.enum(["admin", "member"]) });

/** POST /api/members — admin membuat akun anggota baru di group (PRD §4.5). */
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, email, password, role } = parsed.data;
  const groupId = req.groupId!;

  const existing = db.prepare("SELECT id FROM profiles WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const passwordHash = await hash(password);
  const profileId = nid("p");
  const walletId = nid("w");

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color, password_hash) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
      .run(profileId, groupId, name, email, role ?? "member", "#2456e6", passwordHash);
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES (?, ?, ?, ?, 'personal')")
      .run(walletId, groupId, `Cash ${name}`, profileId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[members] create error:", err);
    res.status(500).json({ error: "Gagal membuat anggota" });
    return;
  }

  logActivity(groupId, req.profile!.id, "member.create", { profileId, name, email, role: role ?? "member" });
  res.status(201).json({ id: profileId, name, email, role: role ?? "member" });
});

/** PATCH /api/members/:id/role — ubah role anggota (owner tidak bisa diubah). */
router.patch("/:id/role", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = roleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const groupId = req.groupId!;
  const owner = db.prepare("SELECT owner_profile_id FROM groups WHERE id = ?").get(groupId) as { owner_profile_id: string };
  if (id === owner.owner_profile_id) {
    res.status(403).json({ error: "Role pemilik grup tidak dapat diubah" });
    return;
  }
  const member = db.prepare("SELECT id, name FROM profiles WHERE id = ? AND group_id = ? AND is_active = 1").get(id, groupId) as
    | { id: string; name: string }
    | undefined;
  if (!member) {
    res.status(404).json({ error: "Anggota tidak ditemukan" });
    return;
  }
  db.prepare("UPDATE profiles SET role = ? WHERE id = ? AND group_id = ?").run(sv(parsed.data.role), sv(id), sv(groupId));
  logActivity(groupId, req.profile!.id, "member.role_change", { profileId: id, role: parsed.data.role });
  res.json({ ok: true });
});

/** DELETE /api/members/:id — soft delete (is_active = 0); owner tidak bisa dihapus. */
router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const owner = db.prepare("SELECT owner_profile_id FROM groups WHERE id = ?").get(groupId) as { owner_profile_id: string };
  if (id === owner.owner_profile_id) {
    res.status(403).json({ error: "Pemilik grup tidak dapat dihapus" });
    return;
  }
  const member = db.prepare("SELECT id, name FROM profiles WHERE id = ? AND group_id = ? AND is_active = 1").get(id, groupId) as
    | { id: string; name: string }
    | undefined;
  if (!member) {
    res.status(404).json({ error: "Anggota tidak ditemukan" });
    return;
  }
  db.prepare("UPDATE profiles SET is_active = 0 WHERE id = ? AND group_id = ?").run(sv(id), sv(groupId));
  db.prepare("DELETE FROM sessions WHERE profile_id = ?").run(sv(id));
  logActivity(groupId, req.profile!.id, "member.remove", { profileId: id, name: member.name });
  res.json({ ok: true });
});

export default router;