import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";
import { assertWalletOwnership, firstValidationError } from "../validation.js";
import { getStatementCalc } from "../services/statement-domain.js";

const router = Router();

const payStmtSchema = z.object({
  amount: z.number().min(1, "Nominal pembayaran tidak valid"),
  walletId: z.string().min(1, "Wallet wajib diisi"),
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** GET /api/credit-card-statements/:id — detail statement + daftar item transaksi (Phase 13). */
router.get("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;

  const calc = getStatementCalc(db, id);
  if (!calc || calc.groupId !== groupId) {
    res.status(404).json({ error: "Statement kartu kredit tidak ditemukan" });
    return;
  }

  // Ambil item penyusun statement
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

  res.json({
    statement: calc,
    items: items.map((i) => ({
      id: i.id,
      transactionId: i.transactionId,
      itemType: i.itemType,
      merchant: i.merchant || i.description || "Tanpa merchant",
      amount: i.amount,
      description: i.description,
      occurredAt: i.occurredAt || i.createdAt,
    })),
  });
});

/** POST /api/credit-card-statements/:id/pay — bayar tagihan statement kartu kredit (Phase 14).
 * Delegasi ke logika pembayaran settlement eksak (type=transfer, transfer_type=credit_card_payment).
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

  const payAmount = Math.min(parsed.data.amount, calc.remainingAmount);
  if (payAmount <= 0) {
    res.status(400).json({ error: "Nominal pembayaran tidak valid atau statement sudah lunas" });
    return;
  }

  // Cek apakah ada bill yang terhubung dengan statement ini
  const bill = db
    .prepare("SELECT id FROM bills WHERE statement_id = ? AND group_id = ? AND is_active = 1")
    .get(id, groupId) as { id: string } | undefined;

  const txId = nid("t");
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO transactions (id, group_id, type, transfer_type, source, amount, category_id, wallet_id, payment_method, credit_card_id, statement_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, attachment_json, items_json, created_at)
       VALUES (?, ?, 'transfer', 'credit_card_payment', 'manual', ?, 'c-lain', ?, 'Debit Card', ?, ?, ?, 'Kartu Kredit', 'Bayar tagihan kartu kredit', ?, ?, ?, NULL, '[]', ?)`,
    ).run(
      sv(txId),
      sv(groupId),
      sv(payAmount),
      sv(parsed.data.walletId),
      sv(calc.creditCardId),
      sv(id),
      sv(todayISO()),
      sv(req.profile!.id),
      sv(req.profile!.id),
      sv(bill?.id ?? null),
      now,
    );

    // Cap paid_amount dengan statement amount EFEKTIF (official ?? derived),
    // bukan kolom statement_amount yang bisa 0 untuk statement hasil derivasi.
    db.prepare(
      "UPDATE statements SET paid_amount = MIN(?, paid_amount + ?) WHERE id = ? AND group_id = ?",
    ).run(sv(calc.statementAmount), sv(payAmount), sv(id), sv(groupId));

    if (bill) {
      db.prepare(
        "UPDATE bills SET paid_amount = MIN(amount, paid_amount + ?) WHERE id = ? AND group_id = ?",
      ).run(sv(payAmount), sv(bill.id), sv(groupId));
    }

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "credit_card_statement.pay", {
      statementId: id,
      amount: payAmount,
      transactionId: txId,
    });
    res.status(201).json({ id: txId, paid: payAmount });
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("[credit-card-statements] pay error:", e);
    res.status(500).json({ error: "Gagal memproses pembayaran statement" });
  }
});

export default router;
