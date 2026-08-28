import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";
import {
  assertCategoryOwnership,
  assertCreditCardOwnership,
  assertCreditCardScope,
  assertProfileOwnership,
  assertWalletOwnership,
  firstValidationError,
} from "../validation.js";
import { resolveOrCreateStatement } from "../services/statement-domain.js";

const router = Router();

const itemSchema = z.object({ itemName: z.string(), quantity: z.number(), unitPrice: z.number(), totalPrice: z.number() });
const billSchema = z.object({
  kind: z.enum(["regular", "recurring", "installment"]),
  amount: z.number().optional(),
  dueDay: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  tenor: z.number().nullable().optional(),
  installmentAmount: z.number().nullable().optional(),
  title: z.string().optional(),
});

const createTxSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().min(1),
  categoryId: z.string(),
  // walletId bersifat opsional: wajib untuk transaksi biasa, TIDAK boleh ada
  // untuk pembelian kartu kredit (Phase 2 — wallet isolation).
  walletId: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  occurredAt: z.string(),
  merchant: z.string(),
  description: z.string().optional().default(""),
  ownerProfileId: z.string(),
  source: z.string().optional().default("manual"),
  attachment: z.any().nullable().optional(),
  items: z.array(itemSchema).optional().default([]),
  bill: billSchema.nullable().optional(),
});

/**
 * Validasi kepemilikan + aturan wallet/kartu kredit.
 * Mengembalikan null bila valid, atau pesan error untuk response 400.
 */
function validateCreateTx(
  input: z.infer<typeof createTxSchema>,
  groupId: string,
): string | null {
  const isCreditCard = input.paymentMethod === "Credit Card";

  // Kartu kredit: creditCardId wajib, wallet TIDAK boleh diisi.
  if (isCreditCard) {
    if (!input.creditCardId) return "Kartu kredit wajib diisi untuk metode Credit Card";
    if (input.walletId) return "Wallet tidak diperlukan untuk transaksi kartu kredit.";
  } else if (!input.walletId) {
    return "Wallet wajib diisi untuk transaksi biasa";
  }

  return firstValidationError([
    () => assertCategoryOwnership(db, input.categoryId, groupId),
    () => assertProfileOwnership(db, input.ownerProfileId, groupId),
    () => assertWalletOwnership(db, input.walletId, groupId),
    () => assertCreditCardOwnership(db, input.creditCardId, groupId),
    // R07-B: scope personal → hanya pemilik kartu yang boleh memakai.
    () => assertCreditCardScope(db, input.creditCardId, groupId, input.ownerProfileId),
  ]);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** GET /api/transactions — daftar transaksi group dengan filter opsional */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const { q, type, walletId, categoryId, from, to, profileId, limit } = req.query as Record<string, string | undefined>;
  const clauses = ["group_id = ?"];
  const params: unknown[] = [groupId];
  if (type && type !== "all") {
    clauses.push("type = ?");
    params.push(type);
  }
  if (walletId) { clauses.push("wallet_id = ?"); params.push(walletId); }
  if (categoryId) { clauses.push("category_id = ?"); params.push(categoryId); }
  if (from) { clauses.push("occurred_at >= ?"); params.push(from); }
  if (to) { clauses.push("occurred_at <= ?"); params.push(to); }
  if (profileId && profileId !== "all") { clauses.push("owner_profile_id = ?"); params.push(profileId); }
  let sql = `SELECT * FROM transactions WHERE ${clauses.join(" AND ")} ORDER BY occurred_at DESC`;
  if (limit) {
    const lim = parseInt(limit, 10);
    if (!Number.isNaN(lim) && lim > 0) { sql += ` LIMIT ${Math.min(lim, 1000)}`; }
  }
    const rows = db.prepare(sql).all(...svs(params)) as Record<string, unknown>[];
  res.json({ transactions: rows });
});

/** POST /api/transactions — buat transaksi + opsional bill/installment */
router.post("/", requireAuth, (req: Request, res: Response) => {
  const parsed = createTxSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const input = parsed.data;
  const groupId = req.groupId!;

  // ---- Ownership + wallet-isolation validation (Phase 1/2) ----
  const validationError = validateCreateTx(input, groupId);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const isCreditCard = input.paymentMethod === "Credit Card";
  // walletId TIDAK disimpan untuk pembelian kartu kredit (wallet isolation).
  const effectiveWalletId = isCreditCard ? null : (input.walletId ?? null);

  const txId = nid("t");
  const now = new Date().toISOString();

  // ---- Phase 5 / 10: Resolution & Cutoff Statement Kartu Kredit ----
  let statementId: string | null = null;
  if (input.creditCardId) {
    try {
      statementId = resolveOrCreateStatement(db, groupId, input.creditCardId, input.occurredAt);
    } catch {
      statementId = null;
    }
  }

  db.exec("BEGIN");
  try {
    let billId: string | null = null;
    let installmentId: string | null = null;
    let bills = [];
    let installments = [];

    if (input.bill) {
      const b = input.bill;
      billId = nid("b");
      const billAmount = b.kind === "installment" ? (b.amount ?? input.amount) : input.amount;
      db.prepare(`INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, counterparty, frequency, due_day, due_date, is_active, owner_profile_id, notes)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, '', ?, ?, ?, 1, ?, '')`)
        .run(sv(billId), sv(groupId), sv(b.title || input.merchant || "Tagihan"), sv(b.kind), sv(billAmount),
          sv(input.categoryId), sv(input.walletId), sv(input.creditCardId ?? null), sv(b.frequency ?? null), sv(b.dueDay ?? null), sv(b.dueDate ?? null), sv(input.ownerProfileId));

      if (b.kind === "installment" && b.tenor && b.installmentAmount) {
        installmentId = nid("i");
        db.prepare(`INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
          .run(sv(installmentId), sv(groupId), sv(billId), sv(b.title || input.merchant || "Tagihan"), sv(billAmount), sv(b.installmentAmount), sv(b.tenor), sv(input.occurredAt), sv(b.dueDay ?? 1));
      }
    }

    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, statement_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sv(txId), sv(groupId), sv(input.type), sv(input.source), sv(input.amount), sv(input.categoryId), sv(effectiveWalletId),
        sv(input.paymentMethod ?? null), sv(input.creditCardId ?? null), sv(statementId), sv(input.occurredAt), sv(input.merchant), sv(input.description ?? ""),
        sv(input.ownerProfileId), sv(req.profile!.id), sv(billId), sv(installmentId),
        input.attachment ? JSON.stringify(input.attachment) : null, JSON.stringify(input.items ?? []), now);

    // ---- Phase 1 & 2: Buat statement item secara atomis bila transaksi memiliki statement_id ----
    if (statementId && input.type === "expense" && input.creditCardId) {
      const csiId = nid("csi");
      const itemDesc = input.merchant
        ? `${input.merchant}${input.description ? ` · ${input.description}` : ""}`
        : (input.description || "Belanja Kartu Kredit");

      db.prepare(
        `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
         VALUES (?, ?, ?, ?, ?, 'purchase', ?, ?)`,
      ).run(sv(csiId), sv(groupId), sv(statementId), sv(txId), sv(input.amount), sv(itemDesc), now);
    }

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "transaction.create", { transactionId: txId, type: input.type, amount: input.amount });
    res.status(201).json({ id: txId });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[transactions] POST error:", err);
    res.status(500).json({ error: "Gagal membuat transaksi" });
  }
});

/** PATCH /api/transactions/:id */
router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const existing = db.prepare("SELECT id FROM transactions WHERE id = ? AND group_id = ?").get(id, groupId);
  if (!existing) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }
  const patch = req.body ?? {};

  // ---- Ownership validation untuk field yang diubah (Phase 1) ----
  const patchErr = firstValidationError([
    () => assertCategoryOwnership(db, patch.categoryId, groupId),
    () => assertProfileOwnership(db, patch.ownerProfileId, groupId),
    () => assertWalletOwnership(db, patch.walletId, groupId),
    () => assertCreditCardOwnership(db, patch.creditCardId, groupId),
  ]);
  if (patchErr) {
    res.status(400).json({ error: patchErr });
    return;
  }
  // Wallet isolation berlaku juga saat update: transaksi kartu kredit tanpa wallet.
  if (patch.paymentMethod === "Credit Card" && patch.walletId) {
    res.status(400).json({ error: "Wallet tidak diperlukan untuk transaksi kartu kredit." });
    return;
  }

  const fields = ["type", "amount", "categoryId", "walletId", "paymentMethod", "occurredAt", "merchant", "description", "ownerProfileId"];
  const setClauses: string[] = [];
  const params: unknown[] = [];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      const col = f === "categoryId" ? "category_id" : f === "walletId" ? "wallet_id" : f === "paymentMethod" ? "payment_method" : f === "occurredAt" ? "occurred_at" : f === "ownerProfileId" ? "owner_profile_id" : f;
      setClauses.push(`${col} = ?`);
      params.push(patch[f]);
    }
  }
  if (patch.attachment !== undefined) {
    setClauses.push("attachment_json = ?");
    params.push(patch.attachment ? JSON.stringify(patch.attachment) : null);
  }
  if (patch.items !== undefined) {
    setClauses.push("items_json = ?");
    params.push(JSON.stringify(patch.items));
  }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, groupId);
  db.prepare(`UPDATE transactions SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  logActivity(groupId, req.profile!.id, "transaction.update", { transactionId: id, patch });
  res.json({ ok: true });
});

/** True bila transaksi adalah settlement kartu kredit (old credit_card_settlement
 *  maupun transfer + transfer_type=credit_card_payment). */
function isSettlementTransaction(t: Record<string, unknown>): boolean {
  return (
    t.type === "credit_card_settlement" ||
    (t.type === "transfer" && t.transfer_type === "credit_card_payment")
  );
}

/** DELETE /api/transactions/:id — hapus + restore bill/installment/statement */
router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const t = db.prepare("SELECT * FROM transactions WHERE id = ? AND group_id = ?").get(id, groupId) as Record<string, unknown> | undefined;
  if (!t) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }

  db.exec("BEGIN");
  try {
    // Phase 15: Hapus statement item yang terhubung dengan transaksi ini
    db.prepare("DELETE FROM credit_card_statement_items WHERE transaction_id = ? AND group_id = ?").run(sv(id), sv(groupId));

    if (t.bill_id) {
      const billAmt = (t.type === "expense" || isSettlementTransaction(t)) ? Number(t.amount ?? 0) : 0;
      db.prepare("UPDATE bills SET paid_amount = MAX(0, paid_amount - ?) WHERE id = ? AND group_id = ?").run(sv(billAmt), sv(t.bill_id), sv(groupId));
    }
    if (t.credit_card_id && isSettlementTransaction(t)) {
      // Revision 01 (P0.1): reversal harus menarget statement EKSAK (statement_id).
      // Settlement lama yang tidak dapat diasosiasikan ke statement tertentu
      // TIDAK ditebak — skip aman dan dilaporkan ke audit log.
      const stmtId = (t.statement_id as string | null) ?? null;
      if (stmtId) {
        const stmt = db
          .prepare("SELECT id, credit_card_id FROM statements WHERE id = ? AND group_id = ?")
          .get(stmtId, groupId) as { id: string; credit_card_id: string | null } | undefined;
        if (stmt && (!t.credit_card_id || stmt.credit_card_id === t.credit_card_id)) {
          db.prepare("UPDATE statements SET paid_amount = MAX(0, paid_amount - ?) WHERE id = ? AND group_id = ?")
            .run(sv(t.amount ?? 0), sv(stmtId), sv(groupId));
        } else {
          logActivity(groupId, req.profile!.id, "transaction.delete.skip_statement", {
            transactionId: id,
            reason: "statement_mismatch",
          });
        }
      } else {
        logActivity(groupId, req.profile!.id, "transaction.delete.skip_statement", {
          transactionId: id,
          reason: "no_statement_id",
        });
      }
    }
    if (t.installment_id) {
      // Phase 4: hitung ulang status cicilan secara deterministik dari
      // paid_amount bill (tidak menebak histori). paid_count = jumlah periode
      // penuh, paid_amount = sisa pembayaran parsial.
      const inst = db
        .prepare("SELECT id, installment_amount, tenor FROM installments WHERE id = ? AND group_id = ?")
        .get(sv(t.installment_id), sv(groupId)) as { id: string; installment_amount: number; tenor: number } | undefined;
      const billRow = t.bill_id
        ? (db.prepare("SELECT paid_amount FROM bills WHERE id = ? AND group_id = ?").get(sv(t.bill_id), sv(groupId)) as { paid_amount: number } | undefined)
        : undefined;
      if (inst && billRow) {
        const installmentAmount = Number(inst.installment_amount ?? 0);
        const totalPaid = Number(billRow.paid_amount ?? 0);
        const periods = installmentAmount > 0 ? Math.floor(totalPaid / installmentAmount) : 0;
        const remainder = installmentAmount > 0 ? totalPaid % installmentAmount : totalPaid;
        db.prepare("UPDATE installments SET paid_count = MIN(?, tenor), paid_amount = ? WHERE id = ? AND group_id = ?")
          .run(sv(Math.min(periods, Number(inst.tenor ?? 0))), sv(remainder), sv(t.installment_id), sv(groupId));
      }
    }
    db.prepare("DELETE FROM transactions WHERE id = ? AND group_id = ?").run(id, groupId);
    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "transaction.delete", { transactionId: id });
    res.json({ ok: true });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[transactions] DELETE error:", err);
    res.status(500).json({ error: "Gagal menghapus transaksi" });
  }
});

export default router;