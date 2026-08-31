import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";
import { assertWalletOwnership, assertCreditCardOwnership, assertCreditCardScope, assertCategoryOwnership, assertProfileOwnership, firstValidationError } from "../validation.js";
import { getUnifiedBills } from "../services/unified-bills.js";
import { getStatementCalc, payStatement, payoffInstallmentCc, DomainError, getInstallmentCurrentStatement } from "../services/statement-domain.js";

const router = Router();

const paySchema = z.object({
  amount: z.number().min(0),
  walletId: z.string(),
  method: z.string().nullable().optional(),
  full: z.boolean().optional(),
});

const createBillSchema = z.object({
  type: z.enum(["debt", "receivable", "regular", "recurring", "installment"]),
  title: z.string().min(1, "Nama wajib diisi").max(100),
  amount: z.number().int().min(1, "Nominal wajib lebih dari 0"),
  counterparty: z.string().max(80).optional().default(""),
  dueDate: z.string().nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  frequency: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  ownerProfileId: z.string().nullable().optional(),
  notes: z.string().max(500).optional().default(""),
  // Khusus installment
  tenor: z.number().int().min(1).nullable().optional(),
  installmentAmount: z.number().int().min(1).nullable().optional(),
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * GET /api/bills — Unified bills list & summary (Phase 3).
 */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const filter = {
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
    profileId: req.query.profileId as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    q: req.query.q as string | undefined,
  };

  const result = getUnifiedBills(db, groupId, filter);
  res.json(result);
});

/**
 * GET /api/bills/:id — Detail tagihan berserta riwayat pembayaran & metadata domain (Phase 3).
 */
router.get("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;

  const allUnified = getUnifiedBills(db, groupId);
  const item = allUnified.items.find((i) => i.id === id || i.sourceId === id);

  if (!item) {
    res.status(404).json({ error: "Tagihan tidak ditemukan" });
    return;
  }

  // Riwayat transaksi pembayaran terhubung
  const historyRows = db
    .prepare(
      `SELECT id, amount, occurred_at AS occurredAt, payment_method AS paymentMethod, wallet_id AS walletId, created_at AS createdAt
       FROM transactions
       WHERE group_id = ? AND (bill_id = ? OR statement_id = ?)
       ORDER BY occurred_at DESC, created_at DESC`,
    )
    .all(groupId, item.sourceId, item.statementId ?? item.sourceId) as Record<string, unknown>[];

  res.json({
    item,
    history: historyRows,
  });
});

/**
 * POST /api/bills — buat tagihan langsung (debt/receivable/regular/recurring/installment).
 * R07-A: menambah jalur pembuatan hutang/piutang (sebelumnya tidak ada).
 */
router.post("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const parsed = createBillSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const input = parsed.data;

  const ownerProfileId = input.ownerProfileId ?? req.profile!.id;
  const err = firstValidationError([
    () => assertCategoryOwnership(db, input.categoryId ?? null, groupId),
    () => assertProfileOwnership(db, ownerProfileId, groupId),
  ]);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  if (input.type === "installment") {
    if (!input.tenor || input.tenor <= 0 || !input.installmentAmount || input.installmentAmount <= 0) {
      res.status(400).json({ error: "Tenor dan nominal cicilan wajib diisi untuk cicilan" });
      return;
    }
  }

  const id = nid("b");
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes)
       VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)`,
    ).run(
      sv(id),
      sv(groupId),
      sv(input.title),
      sv(input.type),
      sv(input.amount),
      sv(input.categoryId ?? null),
      sv(input.counterparty ?? ""),
      sv(input.frequency ?? null),
      sv(input.dueDay ?? null),
      sv(input.dueDate ?? null),
      sv(ownerProfileId),
      sv(input.notes ?? ""),
    );

    if (input.type === "installment" && input.tenor && input.installmentAmount) {
      const instId = nid("i");
      db.prepare(
        `INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      ).run(
        sv(instId),
        sv(groupId),
        sv(id),
        sv(input.title),
        sv(input.amount),
        sv(input.installmentAmount),
        sv(input.tenor),
        sv(input.dueDate ?? new Date().toISOString().slice(0, 10)),
        sv(input.dueDay ?? 1),
      );
    }

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "bill.create", { billId: id, type: input.type });
    res.status(201).json({ id });
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("[bills] create error:", e);
    res.status(500).json({ error: "Gagal membuat tagihan" });
  }
});

/** Helper penanganan pembayaran tagihan/cicilan/statement. */
function handlePayExecution(
  req: Request,
  res: Response,
  id: string,
  opts: { amount: number; walletId: string; method?: string | null; full?: boolean },
) {
  const groupId = req.groupId!;
  const bill = db.prepare("SELECT * FROM bills WHERE id = ? AND group_id = ? AND is_active = 1").get(id, groupId) as Record<string, unknown> | undefined;
  if (!bill) {
    res.status(404).json({ error: "Tagihan tidak ditemukan" });
    return;
  }

  // ---- Ownership validation (Phase 1): wallet & kartu milik group aktif ----
  const ownershipErr = firstValidationError([
    () => assertWalletOwnership(db, opts.walletId, groupId),
    () => assertCreditCardOwnership(db, bill.credit_card_id as string | null | undefined, groupId),
    // R07-B: scope personal → hanya pemilik kartu yang boleh membayar statement-nya.
    () => assertCreditCardScope(db, bill.credit_card_id as string | null | undefined, groupId, req.profile!.id),
  ]);
  if (ownershipErr) {
    res.status(400).json({ error: ownershipErr });
    return;
  }

  const billType = bill.type as string;
  const isStatement = billType === "credit_card_statement";
  const isCcInstallment = billType === "installment" && bill.credit_card_id != null;

  // ---- R09: cicilan kartu kredit dibayar melalui statement kartu kredit ----
  // Bayar periode = settlement statement (wallet ↓, liability ↓, TANPA expense kedua).
  // Lunasi sisa = payoff installment yang memposting sisa ke statement lalu settle.
  if (isCcInstallment) {
    const instRow = db
      .prepare("SELECT id FROM installments WHERE bill_id = ? AND group_id = ?")
      .get(id, groupId) as { id: string } | undefined;
    if (!instRow) {
      res.status(409).json({ error: "Cicilan tidak ditemukan" });
      return;
    }

    try {
      if (opts.full) {
        const result = payoffInstallmentCc(db, groupId, instRow.id, opts.walletId, req.profile!.id);
        logActivity(groupId, req.profile!.id, "installment.pay_full", { installmentId: instRow.id, amount: result.paid });
        res.status(201).json({ id: result.id, paid: result.paid });
        return;
      }

      // Statement yang menampung slice periode berjalan cicilan ini (deterministik
      // dari schedule — R09.1: slice berjalan bisa berupa item derived).
      const stmtId = getInstallmentCurrentStatement(db, groupId, instRow.id);

      if (!stmtId) {
        res.status(409).json({
          error: "Belum ada periode cicilan yang ditagihkan pada statement. Pastikan transaksi cicilan sudah masuk statement.",
        });
        return;
      }

      const result = payStatement(db, groupId, stmtId, opts.amount, opts.walletId, req.profile!.id, {
        billId: id,
        installmentId: instRow.id,
        method: opts.method ?? null,
      });
      logActivity(groupId, req.profile!.id, "installment.pay_period", {
        installmentId: instRow.id,
        statementId: stmtId,
        amount: result.paid,
        completedInstallments: result.completedInstallments,
      });
      res.status(201).json({ id: result.id, paid: result.paid });
      return;
    } catch (e) {
      if (e instanceof DomainError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      console.error("[bills] CC installment pay error:", e);
      res.status(500).json({ error: "Gagal memproses pembayaran cicilan kartu kredit" });
      return;
    }
  }

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

  let statementId: string | null = null;
  if (isStatement) {
    const explicitStmt = (bill.statement_id as string | null) ?? null;
    if (explicitStmt) {
      const stmt = db
        .prepare("SELECT id, credit_card_id FROM statements WHERE id = ? AND group_id = ?")
        .get(explicitStmt, groupId) as { id: string; credit_card_id: string | null } | undefined;
      if (!stmt) {
        res.status(409).json({ error: "Statement tagihan tidak ditemukan" });
        return;
      }
      if (bill.credit_card_id && stmt.credit_card_id !== bill.credit_card_id) {
        res.status(409).json({ error: "Statement tidak cocok dengan kartu tagihan" });
        return;
      }
      statementId = stmt.id;
    } else {
      const cands = db
        .prepare(
          "SELECT id FROM statements WHERE group_id = ? AND credit_card_id = ? AND status IN ('open','issued')",
        )
        .all(groupId, sv(bill.credit_card_id)) as { id: string }[];
      if (cands.length === 0) {
        res.status(409).json({ error: "Statement kartu kredit belum ada; buat statement terlebih dahulu" });
        return;
      }
      if (cands.length > 1) {
        res.status(409).json({ error: "Statement kartu kredit ambigu; tentukan statement yang dituju" });
        return;
      }
      statementId = cands[0].id;
    }
  }

  const isReceivable = billType === "receivable";
  const pay = opts.full ? remaining : Math.min(opts.amount, remaining);
  if (pay <= 0) {
    res.status(400).json({ error: "Nominal pembayaran tidak valid atau tagihan sudah lunas" });
    return;
  }

  const txId = nid("t");
  const now = new Date().toISOString();
  const instRow = billType === "installment"
    ? (db.prepare("SELECT id, installment_amount, paid_count, paid_amount FROM installments WHERE bill_id = ? AND group_id = ?").get(id, groupId) as { id: string; installment_amount: number; paid_count: number; paid_amount: number } | undefined)
    : undefined;

  db.exec("BEGIN");
  try {
    const categoryId = (bill.category_id as string | null) ?? "c-lain";
    const isSettlement = isStatement;
    // Debt/Receivable: receivable = income (wallet +), debt = expense (wallet -).
    const payType = isSettlement ? "transfer" : isReceivable ? "income" : "expense";
    const payMerchant = isReceivable ? "Penerimaan piutang" : (isStatement ? "Bayar tagihan kartu kredit" : "Pembayaran tagihan");
    db.prepare(`INSERT INTO transactions (id, group_id, type, transfer_type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, statement_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?)`)
      .run(sv(txId), sv(groupId), sv(payType), sv(isSettlement ? "credit_card_payment" : null), sv(pay), sv(categoryId),
        sv(opts.walletId), sv(opts.method ?? null), sv(bill.credit_card_id ?? null), sv(todayISO()), sv(String(bill.title ?? "Tagihan")),
        sv(payMerchant), sv(bill.owner_profile_id ?? req.profile!.id),
        sv(req.profile!.id), sv(id), sv(instRow?.id ?? null), sv(statementId), sv(now));

    if (opts.full) {
      db.prepare("UPDATE bills SET paid_amount = amount, last_paid_period = CASE WHEN type = 'recurring' THEN ? ELSE last_paid_period END WHERE id = ? AND group_id = ?")
        .run(sv(monthKey(todayISO())), sv(id), sv(groupId));
    } else {
      db.prepare("UPDATE bills SET paid_amount = MIN(amount, paid_amount + ?), last_paid_period = CASE WHEN type = 'recurring' THEN ? ELSE last_paid_period END WHERE id = ? AND group_id = ?")
        .run(sv(pay), sv(monthKey(todayISO())), sv(id), sv(groupId));
    }

    if (billType === "installment" && instRow) {
      const installmentAmount = Number(instRow.installment_amount ?? 0);
      if (opts.full) {
        db.prepare("UPDATE installments SET paid_count = tenor, paid_amount = 0 WHERE id = ? AND group_id = ?").run(sv(instRow.id), sv(groupId));
      } else {
        const curPaid = Number(instRow.paid_amount ?? 0);
        const newPaid = curPaid + pay;
        const periodsCompleted = installmentAmount > 0 ? Math.floor(newPaid / installmentAmount) : 0;
        const remainder = installmentAmount > 0 ? newPaid % installmentAmount : newPaid;
        if (periodsCompleted > 0) {
          db.prepare("UPDATE installments SET paid_count = MIN(tenor, paid_count + ?), paid_amount = ? WHERE id = ? AND group_id = ?")
            .run(sv(periodsCompleted), sv(remainder), sv(instRow.id), sv(groupId));
        } else {
          db.prepare("UPDATE installments SET paid_amount = ? WHERE id = ? AND group_id = ?").run(sv(newPaid), sv(instRow.id), sv(groupId));
        }
      }
    }

    if (isStatement && statementId) {
      // Gunakan statement amount EFEKTIF sebagai cap (official ?? derived),
      // bukan kolom statement_amount yang bisa 0 untuk statement hasil derivasi.
      const stmtCalc = getStatementCalc(db, statementId);
      const effectiveAmount = stmtCalc ? stmtCalc.statementAmount : 0;
      db.prepare("UPDATE statements SET paid_amount = MIN(?, paid_amount + ?) WHERE id = ? AND group_id = ?")
        .run(sv(effectiveAmount), sv(pay), sv(statementId), sv(groupId));
    }

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "bill.pay", { billId: id, amount: pay, full: Boolean(opts.full) });
    res.status(201).json({ id: txId, paid: pay });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[bills] pay error:", err);
    res.status(500).json({ error: "Gagal memproses pembayaran" });
  }
}

/**
 * POST /api/bills/:id/pay
 */
router.post("/:id/pay", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = paySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  handlePayExecution(req, res, id, parsed.data);
});

/**
 * POST /api/installments/:id/pay-full & POST /api/bills/installments/:id/pay-full
 * Pelunasan awal cicilan (Phase 4): delegasi langsung ke handler pembayaran.
 */
function handlePayFull(req: Request, res: Response) {
  const { id } = req.params;
  const groupId = req.groupId!;

  const inst = db
    .prepare("SELECT bill_id FROM installments WHERE (id = ? OR bill_id = ?) AND group_id = ?")
    .get(id, id, groupId) as { bill_id: string } | undefined;

  if (!inst) {
    res.status(404).json({ error: "Cicilan tidak ditemukan" });
    return;
  }

  const walletId = req.body?.walletId as string | undefined;
  if (!walletId) {
    res.status(400).json({ error: "Wallet wajib diisi" });
    return;
  }

  handlePayExecution(req, res, inst.bill_id, { amount: 0, walletId, full: true });
}

router.post("/installments/:id/pay-full", requireAuth, handlePayFull);
router.post("/:id/pay-full", requireAuth, handlePayFull);

export default router;