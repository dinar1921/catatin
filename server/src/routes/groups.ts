import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const nameSchema = z.object({ name: z.string().min(1, "Nama grup wajib diisi") });

router.patch("/:id/name", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  if (id !== req.groupId) {
    res.status(403).json({ error: "Forbidden: bukan grup milikmu" });
    return;
  }
  const parsed = nameSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(sv(parsed.data.name), sv(id));
  logActivity(id, req.profile!.id, "group.rename", { name: parsed.data.name });
  res.json({ ok: true });
});

export default router;