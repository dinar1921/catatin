import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, "Nama kategori wajib diisi"),
  direction: z.enum(["income", "expense"]),
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, direction } = parsed.data;
  const id = nid("c");
  db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES (?, ?, ?, ?, 0)").run(
    sv(id), sv(req.groupId!), sv(name), sv(direction),
  );
  logActivity(req.groupId!, req.profile!.id, "category.create", { categoryId: id, name, direction });
  res.status(201).json({ id });
});

router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM categories WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Kategori tidak ditemukan" });
    return;
  }
  const patch = req.body ?? {};
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { setClauses.push("name = ?"); params.push(patch.name); }
  if (patch.direction !== undefined) { setClauses.push("direction = ?"); params.push(patch.direction); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, req.groupId!);
  db.prepare(`UPDATE categories SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  logActivity(req.groupId!, req.profile!.id, "category.update", { categoryId: id, patch });
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM categories WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Kategori tidak ditemukan" });
    return;
  }
  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM transactions WHERE category_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM bills WHERE category_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM budgets WHERE category_id = ? AND group_id = ?) AS total`,
    )
    .get(id, req.groupId!, id, req.groupId!, id, req.groupId!) as { total: number };
  if (usage.total > 0) {
    res.status(409).json({ error: `Kategori masih dipakai ${usage.total} data` });
    return;
  }
  db.prepare("DELETE FROM categories WHERE id = ? AND group_id = ?").run(id, req.groupId!);
  logActivity(req.groupId!, req.profile!.id, "category.delete", { categoryId: id });
  res.json({ ok: true });
});

export default router;