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
import { resolveOrCreateStatement, getStatementCalc, syncInstallmentSlices, recomputeInstallmentFromStatements } from "../services/statement-domain.js";

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
      // R09: bill cicilan kartu kredit mencatat statement_id pembelian agar terhubung
      // ke kewajiban statement yang sama (menghindari double liability di Tagihan).
      const billStmtId = input.creditCardId ? statementId : null;
      db.prepare(`INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, counterparty, frequency, due_day, due_date, is_active, owner_profile_id, notes)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, '', ?, ?, ?, 1, ?, '')`)
        .run(sv(billId), sv(groupId), sv(b.title || input.merchant || "Tagihan"), sv(b.kind), sv(billAmount),
          sv(input.categoryId), sv(input.walletId), sv(input.creditCardId ?? null), sv(billStmtId), sv(b.frequency ?? null), sv(b.dueDay ?? null), sv(b.dueDate ?? null), sv(input.ownerProfileId));

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

    // ---- R09.1: statement item untuk pembelian kartu kredit ----
    // Pembelian CC biasa: item_type='purchase', amount = nominal transaksi (full).
    // Pembelian CC dengan cicilan merchant: item_type='installment', amount = slice
    // periode berjalan (installment_amount) — BUKAN full principal.
    // HANYA dibuat bila siklus sudah mulai (period_start <= hari ini); bila belum,
    // slice akan muncul sebagai DERIVED pada read (GET read-only).
    if (statementId && input.type === "expense" && input.creditCardId) {
      const isInstallment = input.bill?.kind === "installment" && installmentId != null;
      const stmtStarted = (db.prepare("SELECT period_start FROM statements WHERE id = ?").get(statementId) as { period_start: string })?.period_start <= todayISO();

      if (isInstallment && !stmtStarted) {
        // Siklus belum mulai — slice tidak dimaterialisasi; akan muncul sebagai derived.
        // (statement_id pada transaksi tetap diisi untuk relasi/traceability.)
      } else {
        const itemAmount = isInstallment ? (input.bill?.installmentAmount ?? input.amount) : input.amount;
        const itemType = isInstallment ? "installment" : "purchase";
        const csiId = nid("csi");
        const itemDesc = input.merchant
          ? `${input.merchant}${input.description ? ` · ${input.description}` : ""}`
          : (input.description || "Belanja Kartu Kredit");

        db.prepare(
          `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(sv(csiId), sv(groupId), sv(statementId), sv(txId), sv(itemAmount), sv(itemType), sv(itemDesc), now);
      }
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
  const existing = db.prepare("SELECT * FROM transactions WHERE id = ? AND group_id = ?").get(id, groupId) as Record<string, unknown> | undefined;
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

  const isCcExpense = existing.type === "expense" && existing.credit_card_id != null;
  const isInstallmentPurchase = isCcExpense && existing.installment_id != null;

  // R09: metode pembayaran transaksi kartu kredit tidak boleh diubah sembarangan
  // (perlu detach/attach statement yang tidak didukung; disarankan hapus & buat ulang).
  if (patch.paymentMethod !== undefined && isCcExpense) {
    const current = String(existing.payment_method ?? "");
    if (patch.paymentMethod !== current) {
      res.status(409).json({
        error: "Mengubah metode pembayaran transaksi kartu kredit tidak didukung. Hapus dan buat ulang transaksi.",
      });
      return;
    }
  }
  // R09: nominal transaksi cicilan kartu kredit tidak boleh diubah (kontrak cicilan).
  if (patch.amount !== undefined && isInstallmentPurchase && Number(patch.amount) !== Number(existing.amount)) {
    res.status(409).json({
      error: "Mengubah nominal transaksi cicilan kartu kredit tidak didukung. Hapus dan buat ulang transaksi.",
    });
    return;
  }

  // ---- R09: pemindahan statement atomis saat tanggal berubah (CC expense) ----
  if (patch.occurredAt !== undefined && isCcExpense) {
    const newOccurredAt = patch.occurredAt as string;
    if (String(newOccurredAt).slice(0, 10) !== String(existing.occurred_at).slice(0, 10)) {
      const oldStmtId = (existing.statement_id as string | null) ?? null;

      // Resolve target statement dengan aturan cutoff (deterministik).
      let newStmtId: string;
      try {
        newStmtId = resolveOrCreateStatement(db, groupId, String(existing.credit_card_id), newOccurredAt);
      } catch {
        res.status(400).json({ error: "Statement kartu kredit tidak dapat ditentukan untuk tanggal baru" });
        return;
      }

      if (oldStmtId && oldStmtId !== newStmtId) {
        // R09.1: cicilan kartu kredit tidak boleh dipindahkan antar siklus statement —
        // item historis adalah immutabel; pindah antar siklus = ubah kontrak (hapus & buat ulang).
        if (isInstallmentPurchase) {
          res.status(409).json({
            error: "Mengubah tanggal cicilan kartu kredit antar siklus statement tidak didukung. Hapus dan buat ulang transaksi.",
          });
          return;
        }

        // Lifecycle: hanya boleh memindahkan antar statement yang masih OPEN.
        const oldCalc = oldStmtId ? getStatementCalc(db, oldStmtId) : null;
        const newCalc = getStatementCalc(db, newStmtId);
        if (oldCalc && oldCalc.status !== "open") {
          res.status(409).json({
            error: `Tanggal tidak dapat diubah: statement asal berstatus ${oldCalc.status}. Buat ulang transaksi pada statement yang benar.`,
          });
          return;
        }
        if (newCalc && newCalc.status !== "open") {
          res.status(409).json({
            error: `Tanggal tidak dapat diubah: statement tujuan berstatus ${newCalc.status}.`,
          });
          return;
        }

        db.exec("BEGIN");
        try {
          // Pindahkan item statement: hapus dari statement lama.
          db.prepare("DELETE FROM credit_card_statement_items WHERE transaction_id = ? AND group_id = ?")
            .run(sv(id), sv(groupId));

          // Update statement_id transaksi + tanggal.
          db.prepare("UPDATE transactions SET statement_id = ?, occurred_at = ? WHERE id = ? AND group_id = ?")
            .run(sv(newStmtId), sv(newOccurredAt), sv(id), sv(groupId));

          if (isInstallmentPurchase && existing.installment_id != null) {
            // Cicilan: tanggal pembelian = awal kontrak → geser start_date,
            // lalu materialisasi slice via sync (cycle-gated, idempotent).
            db.prepare("UPDATE installments SET start_date = ? WHERE id = ? AND group_id = ?")
              .run(sv(newOccurredAt), sv(String(existing.installment_id)), sv(groupId));
            syncInstallmentSlices(db, groupId, String(existing.installment_id));
          } else {
            // Pembelian CC biasa: item pindah ke statement baru (full nominal).
            const itemAmount = Number(patch.amount ?? existing.amount);
            db.prepare(
              `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
               VALUES (?, ?, ?, ?, ?, 'purchase', ?, ?)`,
            ).run(sv(nid("csi")), sv(groupId), sv(newStmtId), sv(id), sv(itemAmount),
              sv(String(existing.merchant ?? "Belanja Kartu Kredit")), new Date().toISOString());
          }

          // Sinkronkan bill bila terhubung ke kartu kredit.
          if (existing.bill_id) {
            db.prepare("UPDATE bills SET statement_id = ? WHERE id = ? AND group_id = ? AND credit_card_id IS NOT NULL")
              .run(sv(newStmtId), sv(existing.bill_id), sv(groupId));
          }

          db.exec("COMMIT");
          logActivity(groupId, req.profile!.id, "transaction.update", { transactionId: id, patch, statementMoved: true });
          res.json({ ok: true });
          return;
        } catch (err) {
          db.exec("ROLLBACK");
          console.error("[transactions] PATCH move error:", err);
          res.status(500).json({ error: "Gagal memindahkan transaksi ke statement baru" });
          return;
        }
      }

      // Statement sama (atau transaksi tanpa statement_id): update tanggal + sinkronisasi slice.
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE transactions SET occurred_at = ? WHERE id = ? AND group_id = ?")
          .run(sv(newOccurredAt), sv(id), sv(groupId));
        if (oldStmtId) {
          if (isInstallmentPurchase && existing.installment_id != null) {
            // Rebase start_date kontrak cicilan + materialisasi slice (gated).
            db.prepare("UPDATE installments SET start_date = ? WHERE id = ? AND group_id = ?")
              .run(sv(newOccurredAt), sv(String(existing.installment_id)), sv(groupId));
            syncInstallmentSlices(db, groupId, String(existing.installment_id));
          } else if (patch.amount !== undefined) {
            // Update item amount bila nominal ikut diubah (pembelian biasa).
            db.prepare("UPDATE credit_card_statement_items SET amount = ? WHERE transaction_id = ? AND group_id = ?")
              .run(sv(Number(patch.amount)), sv(id), sv(groupId));
          }
        }
        db.exec("COMMIT");
        logActivity(groupId, req.profile!.id, "transaction.update", { transactionId: id, patch });
        res.json({ ok: true });
        return;
      } catch (err) {
        db.exec("ROLLBACK");
        console.error("[transactions] PATCH date error:", err);
        res.status(500).json({ error: "Gagal memperbarui tanggal transaksi" });
        return;
      }
    }
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

  // R09: nominal pembelian kartu kredit biasa ikut disinkronkan ke item statement.
  if (isCcExpense && !isInstallmentPurchase && patch.amount !== undefined) {
    db.prepare("UPDATE credit_card_statement_items SET amount = ? WHERE transaction_id = ? AND group_id = ?")
      .run(sv(Number(patch.amount)), sv(id), sv(groupId));
  }

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

    // R09.2: bila transaksi yang dihapus adalah settlement payoff, lepaskan tanda
    // subsumed (paid_by) pada item cicilan yang diselesaikan olehnya — reversal bersih.
    db.prepare("UPDATE credit_card_statement_items SET paid_by_transaction_id = NULL WHERE paid_by_transaction_id = ? AND group_id = ?")
      .run(sv(id), sv(groupId));

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
        .prepare("SELECT id, installment_amount, tenor, paid_count FROM installments WHERE id = ? AND group_id = ?")
        .get(sv(t.installment_id), sv(groupId)) as { id: string; installment_amount: number; tenor: number; paid_count: number } | undefined;
      const billRow = t.bill_id
        ? (db.prepare("SELECT paid_amount, credit_card_id FROM bills WHERE id = ? AND group_id = ?").get(sv(t.bill_id), sv(groupId)) as { paid_amount: number; credit_card_id: string | null } | undefined)
        : undefined;

      if (inst && billRow && billRow.credit_card_id) {
        // R09: cicilan kartu kredit — progress direkonstruksi dari statement
        // (slice terbayar), bukan dari paid_amount bill (yang 0 untuk cicilan CC).
        recomputeInstallmentFromStatements(db, groupId, inst.id);
      } else if (inst && billRow) {
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