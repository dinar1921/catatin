import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { logActivity } from "../services/audit.js";
import { assertWalletOwnership, firstValidationError } from "../validation.js";
import { getStatementCalc, payStatement, DomainError, getDerivedSlicesForStatement } from "../services/statement-domain.js";

const router = Router();

const payStmtSchema = z.object({
  amount: z.number().min(1, "Nominal pembayaran tidak valid"),
  walletId: z.string().min(1, "Wallet wajib diisi"),
});

/** GET /api/credit-card-statements/:id — detail statement + daftar item transaksi (Phase 13).
 * R09.1: GET read-only — TIDAK ada mutasi DB. Item periode berjalan yang belum
 * dimaterialisasi ditampilkan sebagai item DERIVED (isDerived: true).
 */
router.get("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;

  const calc = getStatementCalc(db, id);
  if (!calc || calc.groupId !== groupId) {
    res.status(404).json({ error: "Statement kartu kredit tidak ditemukan" });
    return;
  }

  // Ambil item penyusun statement (historis tersimpan — immutable)
  const items = db
    .prepare(
      `SELECT csi.id, csi.transaction_id AS transactionId, csi.item_type AS itemType,
              csi.amount, csi.description, csi.created_at AS createdAt,
              t.merchant, t.occurred_at AS occurredAt
       FROM credit_card_statement_items csi
       LEFT JOIN transactions t ON t.id = csi.transaction_id
       WHERE csi.statement_id = ? AND csi.group_id = ?
       ORDER BY csi.created_at DESC`,
    )
    .all(id, groupId) as {
    id: string;
    transactionId: string | null;
    itemType: string;
    amount: number;
    description: string;
    createdAt: string;
    merchant: string | null;
    occurredAt: string | null;
  }[];

  // Item derived (periode berjalan yang belum dimaterialisasi — read-only)
  const derived = getDerivedSlicesForStatement(db, groupId, id);

  res.json({
    statement: calc,
    items: [
      ...items.map((i) => ({
        id: i.id,
        transactionId: i.transactionId,
        itemType: i.itemType,
        merchant: i.merchant || i.description || "Tanpa merchant",
        amount: i.amount,
        description: i.description,
        occurredAt: i.occurredAt || i.createdAt,
        isDerived: false,
      })),
      ...derived.map((d) => ({
        id: `derived-${d.installmentId}`,
        transactionId: null,
        itemType: "installment",
        merchant: "Cicilan",
        amount: d.amount,
        description: `Cicilan periode berjalan (periode ${d.periodStart.slice(0, 7)})`,
        occurredAt: d.periodStart,
        isDerived: true,
      })),
    ],
  });
});

/** POST /api/credit-card-statements/:id/pay — bayar tagihan statement kartu kredit (Phase 14).
 * Menggunakan SATU mesin pembayaran statement (payStatement) yang juga dipakai
 * /api/bills/:id/pay — tidak ada duplikasi logika pembayaran.
 */
router.post("/:id/pay", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;

  const parsed = payStmtSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }

  const calc = getStatementCalc(db, id);
  if (!calc || calc.groupId !== groupId) {
    res.status(404).json({ error: "Statement kartu kredit tidak ditemukan" });
    return;
  }

  const err = firstValidationError([() => assertWalletOwnership(db, parsed.data.walletId, groupId)]);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  try {
    const result = payStatement(db, groupId, id, parsed.data.amount, parsed.data.walletId, req.profile!.id);
    logActivity(groupId, req.profile!.id, "credit_card_statement.pay", {
      statementId: id,
      amount: result.paid,
      transactionId: result.id,
      completedInstallments: result.completedInstallments,
    });
    res.status(201).json({ id: result.id, paid: result.paid });
  } catch (e) {
    if (e instanceof DomainError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error("[credit-card-statements] pay error:", e);
    res.status(500).json({ error: "Gagal memproses pembayaran statement" });
  }
});

export default router;
