import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";
import { getCreditCardMetrics, getStatementCalc } from "../services/statement-domain.js";

const router = Router();

const ccSchema = z.object({
  name: z.string().min(1, "Nama kartu wajib diisi").max(60),
  issuer: z.string().max(40).optional().default(""),
  lastFour: z.string().regex(/^\d{0,4}$/, "Maksimal 4 digit akhir").optional().default(""),
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  creditLimit: z.number().int().min(0).optional().default(0),
  ownerProfileId: z.string().nullable().optional(),
  scope: z.enum(["personal", "shared"]).optional().default("shared"),
});

const ccPatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  issuer: z.string().max(40).optional(),
  lastFour: z.string().regex(/^\d{0,4}$/, "Maksimal 4 digit akhir").optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  creditLimit: z.number().int().min(0).optional(),
  ownerProfileId: z.string().nullable().optional(),
  scope: z.enum(["personal", "shared"]).optional(),
});

/** GET /api/credit-cards — daftar kartu kredit group dengan metrik dinamis (Phase 12). */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const rows = db
    .prepare("SELECT id FROM credit_cards WHERE group_id = ? ORDER BY id ASC")
    .all(groupId) as { id: string }[];

  const creditCards = rows
    .map((r) => getCreditCardMetrics(db, groupId, r.id))
    .filter(Boolean);

  res.json({ creditCards });
});

/** GET /api/credit-cards/:id/statements — daftar statement kartu kredit (Phase 13). */
router.get("/:id/statements", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const card = db.prepare("SELECT id FROM credit_cards WHERE id = ? AND group_id = ?").get(id, groupId);
  if (!card) {
    res.status(404).json({ error: "Kartu kredit tidak ditemukan" });
    return;
  }
  const rows = db
    .prepare("SELECT id FROM statements WHERE credit_card_id = ? AND group_id = ? ORDER BY period_start DESC")
    .all(id, groupId) as { id: string }[];

  const statements = rows.map((r) => getStatementCalc(db, r.id)).filter(Boolean);
  res.json({ statements });
});

/** POST /api/credit-cards — tambah kartu kredit (admin). */
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const parsed = ccSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, issuer, lastFour, statementDay, dueDay, creditLimit, ownerProfileId, scope } = parsed.data;
  const id = nid("cc");
  const effectiveOwner = ownerProfileId ?? req.profile!.id;
  // Validasi owner profile milik group aktif
  const owner = db.prepare("SELECT id FROM profiles WHERE id = ? AND group_id = ?").get(effectiveOwner, req.groupId!);
  if (!owner) {
    res.status(400).json({ error: "Profile pemilik kartu tidak ditemukan atau bukan milik group ini" });
    return;
  }
  db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(sv(id), sv(req.groupId!), sv(name), sv(issuer), sv(lastFour), sv(statementDay), sv(dueDay), sv(creditLimit), sv(effectiveOwner), sv(scope));
  logActivity(req.groupId!, req.profile!.id, "credit_card.create", { cardId: id, name, scope });
  res.status(201).json({ id, name, issuer, lastFour, statementDay, dueDay, creditLimit, ownerProfileId: effectiveOwner, scope });
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
  if (patch.ownerProfileId !== undefined) {
    if (patch.ownerProfileId) {
      const owner = db.prepare("SELECT id FROM profiles WHERE id = ? AND group_id = ?").get(patch.ownerProfileId, req.groupId!);
      if (!owner) {
        res.status(400).json({ error: "Profile pemilik kartu tidak ditemukan atau bukan milik group ini" });
        return;
      }
    }
    setClauses.push("owner_profile_id = ?");
    params.push(patch.ownerProfileId);
  }
  if (patch.scope !== undefined) { setClauses.push("scope = ?"); params.push(patch.scope); }
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
        (SELECT COUNT(*) FROM statements WHERE credit_card_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM credit_card_statement_items csi JOIN statements s ON s.id = csi.statement_id WHERE s.credit_card_id = ? AND s.group_id = ?) AS total`,
    )
    .get(id, groupId, id, groupId, id, groupId, id, groupId) as { total: number };
  if (usage.total > 0) {
    res.status(409).json({ error: `Kartu masih dipakai ${usage.total} data` });
    return;
  }
  db.prepare("DELETE FROM credit_cards WHERE id = ? AND group_id = ?").run(sv(id), sv(groupId));
  logActivity(groupId, req.profile!.id, "credit_card.delete", { cardId: id });
  res.json({ ok: true });
});

export default router;