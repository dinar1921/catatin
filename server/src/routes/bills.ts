import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const paySchema = z.object({
  amount: z.number().min(0),
  walletId: z.string(),
  method: z.string().nullable().optional(),
  full: z.boolean().optional(),
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * POST /api/bills/:id/pay
 * Satu jalur pembayaran (Decision 9): handle regular/recurring/installment/
 * credit_card_statement. Membuat transaksi + update bill, installment,
 * statement, dan last_paid_period (guard double-payment recurring).
 */
router.post("/:id/pay", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const parsed = paySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const opts = parsed.data;

  const bill = db.prepare("SELECT * FROM bills WHERE id = ? AND group_id = ? AND is_active = 1").get(id, groupId) as Record<string, unknown> | undefined;
  if (!bill) {
    res.status(404).json({ error: "Tagihan tidak ditemukan" });
    return;
  }

  const billType = bill.type as string;
  const isStatement = billType === "credit_card_statement";
  const amount = Number(bill.amount ?? 0);
  const paidAmount = Number(bill.paid_amount ?? 0);
  const remaining = Math.max(0, amount - paidAmount);

  // Double-payment guard untuk recurring: tolak bila sudah LUNAS bulan ini.
  if (
    billType === "recurring" &&
    bill.last_paid_period === monthKey(todayISO()) &&
    paidAmount >= amount
  ) {
    res.status(409).json({ error: "Tagihan berulang periode ini sudah dibayar" });
    return;
  }

  const pay = opts.full ? remaining : Math.min(opts.amount, remaining);
  if (pay <= 0) {
    res.status(400).json({ error: "Nominal pembayaran tidak valid atau tagihan sudah lunas" });
    return;
  }

  const txId = nid("t");
  const now = new Date().toISOString();
  // Cicilan ditemukan via bill_id (bills tidak punya kolom installment_id).
  const instRow = billType === "installment"
    ? (db.prepare("SELECT id FROM installments WHERE bill_id = ? AND group_id = ?").get(id, groupId) as { id: string } | undefined)
    : undefined;

  db.exec("BEGIN");
  try {
    const categoryId = (bill.category_id as string | null) ?? "c-lain";
    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?)`)
      .run(sv(txId), sv(groupId), sv(isStatement ? "credit_card_settlement" : "expense"), sv(pay), sv(categoryId),
        sv(opts.walletId), sv(opts.method ?? null), sv(bill.credit_card_id ?? null), sv(todayISO()), sv(String(bill.title ?? "Tagihan")),
        sv(isStatement ? "Bayar tagihan kartu kredit" : "Pembayaran tagihan"), sv(bill.owner_profile_id ?? req.profile!.id),
        sv(req.profile!.id), sv(id), sv(instRow?.id ?? null), sv(now));

    if (opts.full) {
      db.prepare("UPDATE bills SET paid_amount = amount, last_paid_period = CASE WHEN type = 'recurring' THEN ? ELSE last_paid_period END WHERE id = ? AND group_id = ?")
        .run(sv(monthKey(todayISO())), sv(id), sv(groupId));
    } else {
      db.prepare("UPDATE bills SET paid_amount = MIN(amount, paid_amount + ?), last_paid_period = CASE WHEN type = 'recurring' THEN ? ELSE last_paid_period END WHERE id = ? AND group_id = ?")
        .run(sv(pay), sv(monthKey(todayISO())), sv(id), sv(groupId));
    }

    if (billType === "installment" && instRow) {
      if (opts.full) {
        db.prepare("UPDATE installments SET paid_count = tenor WHERE id = ? AND group_id = ?").run(sv(instRow.id), sv(groupId));
      } else {
        db.prepare("UPDATE installments SET paid_count = MIN(tenor, paid_count + 1) WHERE id = ? AND group_id = ?").run(sv(instRow.id), sv(groupId));
      }
    }

    if (isStatement && bill.credit_card_id) {
      db.prepare("UPDATE statements SET paid_amount = MIN(statement_amount, paid_amount + ?) WHERE credit_card_id = ? AND group_id = ?")
        .run(sv(pay), sv(bill.credit_card_id), sv(groupId));
    }

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "bill.pay", { billId: id, amount: pay, full: Boolean(opts.full) });
    res.status(201).json({ id: txId, paid: pay });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[bills] pay error:", err);
    res.status(500).json({ error: "Gagal memproses pembayaran" });
  }
});

export default router;