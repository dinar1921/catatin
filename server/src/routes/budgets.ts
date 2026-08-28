import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { assertCategoryOwnership, assertProfileOwnership, firstValidationError } from "../validation.js";

const router = Router();

const createSchema = z.object({
  categoryId: z.string(),
  amount: z.number().min(1),
  ownerProfileId: z.string().nullable().optional(),
});

const updateSchema = z.object({
  categoryId: z.string().optional(),
  amount: z.number().min(1).optional(),
  ownerProfileId: z.string().nullable().optional(),
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { categoryId, amount, ownerProfileId } = parsed.data;
  const groupId = req.groupId!;

  const err = firstValidationError([
    () => assertCategoryOwnership(db, categoryId, groupId),
    () => assertProfileOwnership(db, ownerProfileId, groupId),
  ]);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  const id = nid("bg");
  db.prepare("INSERT INTO budgets (id, group_id, category_id, amount, owner_profile_id) VALUES (?, ?, ?, ?, ?)").run(
    sv(id), sv(groupId), sv(categoryId), sv(amount), sv(ownerProfileId ?? null),
  );
  res.status(201).json({ id });
});

router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const existing = db.prepare("SELECT id FROM budgets WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Budget tidak ditemukan" });
    return;
  }
  const patch = parsed.data;
  const groupId = req.groupId!;
  const patchErr = firstValidationError([
    () => assertCategoryOwnership(db, patch.categoryId, groupId),
    () => assertProfileOwnership(db, patch.ownerProfileId, groupId),
  ]);
  if (patchErr) {
    res.status(400).json({ error: patchErr });
    return;
  }
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (patch.categoryId !== undefined) { setClauses.push("category_id = ?"); params.push(patch.categoryId); }
  if (patch.amount !== undefined) { setClauses.push("amount = ?"); params.push(patch.amount); }
  if (patch.ownerProfileId !== undefined) { setClauses.push("owner_profile_id = ?"); params.push(patch.ownerProfileId ?? null); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, req.groupId!);
  db.prepare(`UPDATE budgets SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM budgets WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Budget tidak ditemukan" });
    return;
  }
  db.prepare("DELETE FROM budgets WHERE id = ? AND group_id = ?").run(sv(id), sv(req.groupId!));
  res.json({ ok: true });
});

export default router;