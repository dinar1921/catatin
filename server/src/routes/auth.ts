import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { db } from "../db/index.js";
import { createSession, destroySession, requireAuth, SESSION_COOKIE } from "../middleware/auth.js";
import { nid } from "../db/sql.js";
import { rateLimit } from "../middleware/security.js";
import { logActivity } from "../services/audit.js";

const router = Router();

// Rate limit khusus kredensial (10/menit/IP) — bukan /me, /logout.
const authRateLimit = rateLimit(60_000, 10);

const registerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(60),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password lama wajib diisi"),
  newPassword: z.string().min(6, "Password baru minimal 6 karakter"),
});

const defaultCategories: { name: string; direction: string }[] = [
  { name: "Gaji", direction: "income" },
  { name: "Bonus", direction: "income" },
  { name: "Pendapatan Lain", direction: "income" },
  { name: "Makanan & Minuman", direction: "expense" },
  { name: "Transportasi", direction: "expense" },
  { name: "Belanja Rumah", direction: "expense" },
  { name: "Tagihan & Utilitas", direction: "expense" },
  { name: "Kesehatan", direction: "expense" },
  { name: "Hiburan", direction: "expense" },
  { name: "Pendidikan", direction: "expense" },
  { name: "Lainnya", direction: "expense" },
];

function publicProfile(row: { id: string; group_id: string; name: string; email: string; role: string; is_active: number; color: string }) {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active === 1,
    color: row.color,
  };
}

router.post("/register", authRateLimit, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, email, password } = parsed.data;

  const existing = db.prepare("SELECT id FROM profiles WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const passwordHash = await hash(password);
  const groupId = nid("g");
  const profileId = nid("p");
  const walletId = nid("w");

  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES (?, ?, ?)").run(groupId, `${name}'s Family`, profileId);
    db.prepare(
      "INSERT INTO profiles (id, group_id, name, email, role, is_active, color, password_hash) VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)",
    ).run(profileId, groupId, name, email, "#2456e6", passwordHash);
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES (?, ?, 'Cash', ?, 'personal')").run(
      walletId,
      groupId,
      profileId,
    );
    const insCat = db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES (?, ?, ?, ?, 1)");
    for (const c of defaultCategories) {
      insCat.run(nid("c"), groupId, c.name, c.direction);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const sid = createSession(profileId);
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as {
    id: string; group_id: string; name: string; email: string; role: string; is_active: number; color: string;
  };
  res.status(201).json({ profile: publicProfile(row), group: { id: groupId, name: `${name}'s Family`, ownerProfileId: profileId } });
});

router.post("/login", authRateLimit, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { email, password } = parsed.data;

  const row = db
    .prepare("SELECT * FROM profiles WHERE email = ? AND is_active = 1")
    .get(email) as unknown as { id: string; group_id: string; name: string; email: string; role: string; is_active: number; color: string; password_hash: string | null } | undefined;

  if (!row || !row.password_hash) {
    res.status(401).json({ error: "Email atau password salah" });
    return;
  }
  try {
    const ok = await verify(row.password_hash, password);
    if (!ok) {
      res.status(401).json({ error: "Email atau password salah" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Email atau password salah" });
    return;
  }

  const sid = createSession(row.id);
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  const group = db.prepare("SELECT id, name, owner_profile_id FROM groups WHERE id = ?").get(row.group_id) as {
    id: string; name: string; owner_profile_id: string;
  };
  res.json({ profile: publicProfile(row), group });
});

router.post("/logout", (req: Request, res: Response) => {
  const sid = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  if (sid) destroySession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.profile!.id) as {
    id: string; group_id: string; name: string; email: string; role: string; is_active: number; color: string;
  };
  const group = db.prepare("SELECT id, name, owner_profile_id FROM groups WHERE id = ?").get(row.group_id) as {
    id: string; name: string; owner_profile_id: string;
  };
  res.json({ profile: publicProfile(row), group });
});

/** POST /api/auth/change-password — verifikasi password lama, hash baru, revoke session lain. */
router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const profile = db.prepare("SELECT password_hash FROM profiles WHERE id = ?").get(req.profile!.id) as
    | { password_hash: string | null }
    | undefined;
  if (!profile?.password_hash) {
    res.status(400).json({ error: "Akun ini tidak memiliki password" });
    return;
  }
  try {
    const ok = await verify(profile.password_hash, parsed.data.currentPassword);
    if (!ok) {
      res.status(401).json({ error: "Password lama salah" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Password lama salah" });
    return;
  }
  const newHash = await hash(parsed.data.newPassword);
  const sid = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  db.prepare("UPDATE profiles SET password_hash = ? WHERE id = ?").run(newHash, req.profile!.id);
  if (sid) {
    db.prepare("DELETE FROM sessions WHERE profile_id = ? AND id != ?").run(req.profile!.id, sid);
  }
  logActivity(req.groupId!, req.profile!.id, "auth.change_password");
  res.json({ ok: true });
});

/** GET /api/auth/sessions — daftar session aktif milik profile. */
router.get("/sessions", requireAuth, (req: Request, res: Response) => {
  const sid = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  const rows = db
    .prepare("SELECT id, created_at, expires_at FROM sessions WHERE profile_id = ? AND expires_at > ? ORDER BY created_at DESC")
    .all(req.profile!.id, Date.now()) as unknown as { id: string; created_at: string; expires_at: number }[];
  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      current: r.id === sid,
    })),
  });
});

/** DELETE /api/auth/sessions/:id — revoke session milik profile. */
router.delete("/sessions/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const sid = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  const row = db.prepare("SELECT id FROM sessions WHERE id = ? AND profile_id = ?").get(id, req.profile!.id);
  if (!row) {
    res.status(404).json({ error: "Session tidak ditemukan" });
    return;
  }
  db.prepare("DELETE FROM sessions WHERE id = ? AND profile_id = ?").run(id, req.profile!.id);
  logActivity(req.groupId!, req.profile!.id, "auth.revoke_session", { sessionId: id, current: id === sid });
  res.json({ ok: true });
});

export default router;
