import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const ccSchema = z.object({
  name: z.string().min(1, "Nama kartu wajib diisi").max(60),
  issuer: z.string().max(40).optional().default(""),
  lastFour: z.string().regex(/^\d{0,4}$/, "Maksimal 4 digit akhir").optional().default(""),
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  creditLimit: z.number().int().min(0).optional().default(0),
});

const ccPatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  issuer: z.string().max(40).optional(),
  lastFour: z.string().regex(/^\d{0,4}$/, "Maksimal 4 digit akhir").optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  creditLimit: z.number().int().min(0).optional(),
});

/** GET /api/credit-cards — daftar kartu kredit group. */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT id, name, issuer, last_four, statement_day, due_day, credit_limit FROM credit_cards WHERE group_id = ? ORDER BY id ASC")
    .all(req.groupId!) as unknown as { id: string; name: string; issuer: string; last_four: string; statement_day: number; due_day: number; credit_limit: number }[];
  res.json({
    creditCards: rows.map((r) => ({
      id: r.id,
      name: r.name,
      issuer: r.issuer,
      lastFour: r.last_four,
      statementDay: r.statement_day,
      dueDay: r.due_day,
      creditLimit: r.credit_limit,
    })),
  });
});

/** POST /api/credit-cards — tambah kartu kredit (admin). */
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const parsed = ccSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, issuer, lastFour, statementDay, dueDay, creditLimit } = parsed.data;
  const id = nid("cc");
  db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(sv(id), sv(req.groupId!), sv(name), sv(issuer), sv(lastFour), sv(statementDay), sv(dueDay), sv(creditLimit));
  logActivity(req.groupId!, req.profile!.id, "credit_card.create", { cardId: id, name });
  res.status(201).json({ id, name, issuer, lastFour, statementDay, dueDay, creditLimit });
});

/** PATCH /api/credit-cards/:id — edit kartu (admin). */
router.patch("/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = ccPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const existing = db.prepare("SELECT id FROM credit_cards WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Kartu tidak ditemukan" });
    return;
  }
  const patch = parsed.data;
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { setClauses.push("name = ?"); params.push(patch.name); }
  if (patch.issuer !== undefined) { setClauses.push("issuer = ?"); params.push(patch.issuer); }
  if (patch.lastFour !== undefined) { setClauses.push("last_four = ?"); params.push(patch.lastFour); }
  if (patch.statementDay !== undefined) { setClauses.push("statement_day = ?"); params.push(patch.statementDay); }
  if (patch.dueDay !== undefined) { setClauses.push("due_day = ?"); params.push(patch.dueDay); }
  if (patch.creditLimit !== undefined) { setClauses.push("credit_limit = ?"); params.push(patch.creditLimit); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, req.groupId!);
  db.prepare(`UPDATE credit_cards SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  logActivity(req.groupId!, req.profile!.id, "credit_card.update", { cardId: id, patch });
  res.json({ ok: true });
});

/** DELETE /api/credit-cards/:id — hapus kartu (admin; blokir bila dipakai transaksi/statement). */
router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const existing = db.prepare("SELECT id FROM credit_cards WHERE id = ? AND group_id = ?").get(id, groupId);
  if (!existing) {
    res.status(404).json({ error: "Kartu tidak ditemukan" });
    return;
  }
  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM transactions WHERE credit_card_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM bills WHERE credit_card_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM statements WHERE credit_card_id = ? AND group_id = ?) AS total`,
    )
    .get(id, groupId, id, groupId, id, groupId) as { total: number };
  if (usage.total > 0) {
    res.status(409).json({ error: `Kartu masih dipakai ${usage.total} data` });
    return;
  }
  db.prepare("DELETE FROM credit_cards WHERE id = ? AND group_id = ?").run(sv(id), sv(groupId));
  logActivity(groupId, req.profile!.id, "credit_card.delete", { cardId: id });
  res.json({ ok: true });
});

export default router;