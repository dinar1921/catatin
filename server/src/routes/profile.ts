import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const profilePatchSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(60).optional(),
  color: z.string().optional(),
});

/** PATCH /api/profile — update profil sendiri (PRD §29.3). */
router.patch("/", requireAuth, (req: Request, res: Response) => {
  const parsed = profilePatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const patch = parsed.data;
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { setClauses.push("name = ?"); params.push(patch.name); }
  if (patch.color !== undefined) { setClauses.push("color = ?"); params.push(patch.color); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(req.profile!.id);
  db.prepare(`UPDATE profiles SET ${setClauses.join(", ")} WHERE id = ?`).run(...params.map(sv));
  logActivity(req.groupId!, req.profile!.id, "profile.update", { patch });
  const row = db.prepare("SELECT id, group_id, name, email, role, is_active, color FROM profiles WHERE id = ?").get(req.profile!.id) as {
    id: string; group_id: string; name: string; email: string; role: string; is_active: number; color: string;
  };
  res.json({
    profile: {
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: row.is_active === 1,
      color: row.color,
    },
  });
});

export default router;