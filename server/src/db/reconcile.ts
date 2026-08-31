import type { DatabaseSync } from "node:sqlite";
import { calculateBillingCycle, getStatementCalc, calculateCreditCardMetrics } from "../services/statement-domain.js";

export interface ReconciliationReport {
  generatedAt: string;
  ccTransactions: { total: number; linked: number; unresolved: number };
  settlements: { total: number; linked: number; unresolved: number };
  statementBills: { total: number; linked: number; unresolved: number };
  statements: StatementCheck[];
  suspiciousStatements: StatementCheck[];
  cardsAffectedByOldUpdates: { creditCardId: string; statementId: string }[];
  canonicalPeriods: CanonicalPeriodCheck[];
  overlappingStatements: OverlapCheck[];
  ccInstallments: InstallmentCheck;
  payoffSubsumedSlices: PayoffSubsumedCheck[];
  summary?: { repairableCount: number; ambiguousCount: number; informationalCount: number };
  productionGate?: ProductionGate;
  orphans: OrphanSummary;
}

interface StatementCheck {
  id: string;
  creditCardId: string | null;
  periodStart: string;
  periodEnd: string;
  statementAmount: number;
  paidAmount: number;
  derivedAmount: number;
  subsumedAmount: number;
  linkedSettlements: number;
  settlementTotal: number;
  suspicious: boolean;
  cause: "ok" | "full_principal" | "deleted_item_or_overpayment" | "overpayment" | "ambiguous";
  status?: "canonical" | "noncanonical" | "overlap" | "false_positive" | "actual_anomaly";
  classification: "deterministicRepairable" | "ambiguous" | "informational";
  reason: string;
}

interface ProductionGate {
  status: "READY" | "BLOCKED";
  currentIntegrity: {
    passed: boolean;
    checks: { name: string; pass: boolean; note: string }[];
  };
  historical: {
    repairableCount: number;
    ambiguousCount: number;
    informationalCount: number;
  };
}

interface CanonicalPeriodCheck {
  statementId: string;
  creditCardId: string | null;
  periodStart: string;
  periodEnd: string;
  canonical: boolean;
  expectedStart: string;
  expectedEnd: string;
  classification: "deterministicRepairable" | "ambiguous" | "informational";
}

interface OverlapCheck {
  a: string;
  b: string;
  creditCardId: string | null;
  aCanonical: boolean;
  bCanonical: boolean;
  aEmpty: boolean;
  bEmpty: boolean;
  deterministicMerge: boolean;
  classification: "deterministicRepairable" | "ambiguous" | "informational";
}

interface PayoffSubsumedCheck {
  itemId: string;
  installmentId: string;
  statementId: string;
  amount: number;
  paidByTransactionId: string | null;
  classification: "deterministicRepairable" | "ambiguous" | "informational";
}

interface InstallmentCheck {
  total: number;
  fullPrincipalItems: { installmentId: string; transactionId: string; statementId: string; amount: number; statementPaidAmount: number; repairable: boolean; classification: "deterministicRepairable" | "ambiguous" | "informational" }[];
  billsWithoutStatement: { billId: string; title: string }[];
  expenseCcPayments: { transactionId: string; amount: number; merchant: string }[];
  legacyPayments: LegacyPaymentCheck[];
  ccPaymentsNullStatement: { transactionId: string; amount: number }[];
  duplicateSlicePerPeriod: { installmentId: string; statementId: string; count: number }[];
  statementAmountInconsistency: { statementId: string; installmentId: string; count: number }[];
  paidStatementsWithoutItems: { statementId: string; paidAmount: number }[];
  settledSlicesMissing: { installmentId: string; paidCount: number; settledCount: number }[];
  sliceAmountMismatch: { itemId: string; installmentId: string; amount: number; expectedAmount: number }[];
  payoffRemovedHistory: { installmentId: string; paidCount: number; settledRegular: number; coveredPayoff: number }[];
  futureCommitmentMismatch: { installmentId: string; totalAmount: number; postedRegular: number }[];
}

interface LegacyPaymentCheck {
  transactionId: string;
  amount: number;
  merchant: string;
  walletId: string | null;
  installmentId: string | null;
  creditCardId: string | null;
  occurredAt: string;
  classification: "A" | "B" | "C";
  label: "deterministic_repairable" | "purchase_informational" | "ambiguous_manual_review";
  targetStatementId: string | null;
}

interface OrphanSummary {
  transactionCategoryIds: string[];
  transactionWalletIds: string[];
  transactionCreditCardIds: string[];
  transactionOwnerProfileIds: string[];
  transactionBillIds: string[];
  transactionInstallmentIds: string[];
  billCreditCardIds: string[];
  billWalletIds: string[];
  billOwnerProfileIds: string[];
  billCategoryIds: string[];
  statementCreditCardIds: string[];
  draftCategoryIds: string[];
  draftWalletIds: string[];
}

function orphanIds(
  db: DatabaseSync,
  childTable: string,
  childCol: string,
  parentTable: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT t.${childCol} AS id
       FROM ${childTable} t
       LEFT JOIN ${parentTable} p ON p.id = t.${childCol}
       WHERE t.${childCol} IS NOT NULL AND p.id IS NULL`,
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Laporan rekonsiliasi data finansial — tidak mengandung secret/credential.
 * Hanya berisi id, jumlah, dan nominal untuk keperluan audit Revision 01.
 */
export function reconcile(db: DatabaseSync): ReconciliationReport {
  const ccTotals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN statement_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
              SUM(CASE WHEN statement_id IS NULL THEN 1 ELSE 0 END) AS unresolved
       FROM transactions
       WHERE type = 'expense' AND credit_card_id IS NOT NULL`,
    )
    .get() as { total: number; linked: number; unresolved: number };

  const stmtTotals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN statement_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
              SUM(CASE WHEN statement_id IS NULL THEN 1 ELSE 0 END) AS unresolved
       FROM transactions
       WHERE (type = 'credit_card_settlement' OR (type = 'transfer' AND transfer_type = 'credit_card_payment'))
         AND credit_card_id IS NOT NULL`,
    )
    .get() as { total: number; linked: number; unresolved: number };

  const billTotals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN statement_id IS NOT NULL THEN 1 ELSE 0 END) AS linked,
              SUM(CASE WHEN statement_id IS NULL THEN 1 ELSE 0 END) AS unresolved
       FROM bills
       WHERE type = 'credit_card_statement' AND credit_card_id IS NOT NULL`,
    )
    .get() as { total: number; linked: number; unresolved: number };

  const stmtRows = db
    .prepare(
      `SELECT id, credit_card_id, period_start, period_end, statement_amount, paid_amount
       FROM statements ORDER BY credit_card_id, period_start`,
    )
    .all() as {
    id: string;
    credit_card_id: string | null;
    period_start: string;
    period_end: string;
    statement_amount: number;
    paid_amount: number;
  }[];

  const statements: StatementCheck[] = stmtRows.map((s) => {
    const linked = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
         FROM transactions WHERE statement_id = ? AND (type = 'credit_card_settlement' OR (type = 'transfer' AND transfer_type = 'credit_card_payment'))`,
      )
      .get(s.id) as { total: number; n: number };

    // R09.2: gunakan nilai DERIVED (bukan kolom statement_amount mentah).
    const calc = getStatementCalc(db, s.id);
    const derived = calc ? calc.derivedAmount : 0;
    const effectiveAmount = calc ? calc.statementAmount : 0;
    const paid = calc ? calc.paidAmount : Number(s.paid_amount ?? 0);
    const subsumed = calc ? calc.subsumedAmount ?? 0 : 0;

    let suspicious = false;
    let cause: StatementCheck["cause"] = "ok";
    let classification: StatementCheck["classification"] = "informational";
    let reason = "";

    // Items full-principal pada statement ini?
    const fullPrincipalOnStmt = db
      .prepare(
        `SELECT COUNT(*) AS n FROM credit_card_statement_items csi
         JOIN transactions t ON t.id = csi.transaction_id
         JOIN installments i ON i.id = t.installment_id
         WHERE csi.statement_id = ? AND csi.item_type = 'purchase'
           AND i.total_amount = csi.amount AND i.total_amount > i.installment_amount`,
      )
      .get(s.id) as { n: number };

    if (paid === 0 && derived === 0) {
      cause = "ok";
    } else if (derived > 0 && paid <= effectiveAmount && derived === paid && fullPrincipalOnStmt.n > 0) {
      // Statement koheren secara derived; item full-principal yang sudah dibayar penuh.
      suspicious = false;
      cause = "full_principal";
      classification = "informational";
      reason = "derived koheren; item full-principal (historis R09)";
    } else if (derived === 0 && paid > 0) {
      // Tidak ada item sama sekali tetapi ada pembayaran — artefak penghapusan atau overpayment.
      suspicious = true;
      cause = "deleted_item_or_overpayment";
      classification = "ambiguous";
      reason = "paid_amount > 0 tanpa item (derived 0) — artefak penghapusan/overpayment, butuh review";
    } else if (paid > effectiveAmount) {
      suspicious = true;
      cause = "overpayment";
      classification = "ambiguous";
      reason = "paid_amount melebihi statement_amount efektif";
    } else if (paid > 0 && linked.n === 0) {
      suspicious = true;
      cause = "ambiguous";
      classification = "ambiguous";
      reason = "paid_amount > 0 tanpa settlement terhubung";
    } else {
      cause = "ok";
    }

    return {
      id: s.id,
      creditCardId: s.credit_card_id,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      statementAmount: effectiveAmount,
      paidAmount: paid,
      derivedAmount: derived,
      subsumedAmount: subsumed,
      linkedSettlements: linked.n,
      settlementTotal: linked.total,
      suspicious,
      cause,
      classification,
      reason,
    };
  });

  const suspiciousStatements = statements.filter((s) => s.suspicious);
  const cardsAffectedByOldUpdates = statements
    .filter((s) => s.paidAmount > 0 && s.linkedSettlements === 0)
    .map((s) => ({ creditCardId: s.creditCardId ?? "", statementId: s.id }));

  // ---- R09.2: canonical period check (deterministik via aturan cutoff) ----
  const cards = db.prepare("SELECT id, statement_day, due_day FROM credit_cards").all() as {
    id: string;
    statement_day: number;
    due_day: number;
  }[];
  const cardCycle = new Map(cards.map((c) => [c.id, { statement_day: Number(c.statement_day), due_day: Number(c.due_day) }]));

  const canonicalPeriods: CanonicalPeriodCheck[] = stmtRows.map((s) => {
    const cc = s.credit_card_id ? cardCycle.get(s.credit_card_id) : undefined;
    let canonical = false;
    let expectedStart = "";
    let expectedEnd = "";
    if (cc) {
      const cyc = calculateBillingCycle(String(s.period_start), cc.statement_day, cc.due_day);
      expectedStart = cyc.periodStart;
      expectedEnd = cyc.periodEnd;
      canonical = expectedStart === String(s.period_start) && expectedEnd === String(s.period_end);
    }
    return {
      statementId: s.id,
      creditCardId: s.credit_card_id,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      canonical,
      expectedStart,
      expectedEnd,
      classification: canonical ? ("informational" as const) : ("ambiguous" as const),
    };
  });

  // ---- R09.2: overlapping statements ----
  const overlapRows = db
    .prepare(
      `SELECT a.id AS a, b.id AS b, a.credit_card_id AS creditCardId
       FROM statements a
       JOIN statements b ON a.group_id = b.group_id
         AND a.credit_card_id IS NOT NULL AND a.credit_card_id = b.credit_card_id
         AND a.id < b.id
         AND a.period_start < b.period_end AND a.period_end > b.period_start`,
    )
    .all() as { a: string; b: string; creditCardId: string | null }[];

  const stmtEmptyCache = new Map<string, boolean>();
  const isStatementEmpty = (id: string): boolean => {
    if (stmtEmptyCache.has(id)) return stmtEmptyCache.get(id)!;
    const items = (db.prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE statement_id = ?").get(id) as { n: number }).n;
    const s = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE statement_id = ?").get(id) as { n: number }).n;
    const b = (db.prepare("SELECT COUNT(*) AS n FROM bills WHERE statement_id = ?").get(id) as { n: number }).n;
    const empty = items === 0 && s === 0 && b === 0;
    stmtEmptyCache.set(id, empty);
    return empty;
  };

  const overlappingStatements: OverlapCheck[] = overlapRows.map((o) => {
    const aCanonical = canonicalPeriods.find((c) => c.statementId === o.a)?.canonical ?? false;
    const bCanonical = canonicalPeriods.find((c) => c.statementId === o.b)?.canonical ?? false;
    const aEmpty = isStatementEmpty(o.a);
    const bEmpty = isStatementEmpty(o.b);
    // Hanya deterministik bila satu statement kanonikal, statement lain kosong,
    // dan periode statement non-kanonikal TERKANDUNG penuh di kanonikal.
    let deterministicMerge = false;
    if (aCanonical !== bCanonical) {
      const nc = aCanonical ? o.b : o.a;
      const cn = aCanonical ? o.a : o.b;
      const ncEmpty = aCanonical ? bEmpty : aEmpty;
      if (ncEmpty) {
        const ncRow = stmtRows.find((s) => s.id === nc);
        const cnRow = stmtRows.find((s) => s.id === cn);
        if (ncRow && cnRow) {
          deterministicMerge =
            String(ncRow.period_start) >= String(cnRow.period_start) && String(ncRow.period_end) <= String(cnRow.period_end);
        }
      }
    }
    return {
      a: o.a,
      b: o.b,
      creditCardId: o.creditCardId,
      aCanonical,
      bCanonical,
      aEmpty,
      bEmpty,
      deterministicMerge,
      classification: deterministicMerge ? ("deterministicRepairable" as const) : ("ambiguous" as const),
    };
  });

  // ---- R09.2: payoff subsumed slices (item dipertahankan, settlement terpisah) ----
  const payoffSubsumedSlices: PayoffSubsumedCheck[] = (db
    .prepare(
      `SELECT csi.id AS itemId, t.installment_id AS installmentId, csi.statement_id AS statementId,
              csi.amount AS amount, csi.paid_by_transaction_id AS paidByTransactionId
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       WHERE csi.paid_by_transaction_id IS NOT NULL`,
    )
    .all() as { itemId: string; installmentId: string; statementId: string; amount: number; paidByTransactionId: string | null }[]).map(
    (p) => ({ ...p, classification: "informational" as const }),
  );

  // ---- R09: rekonsiliasi cicilan kartu kredit (deteksi, tanpa mutasi) ----
  // R09.2: full-principal items + repairable flag (statement belum dibayar → deterministik).
  const fullPrincipalItems = (db
    .prepare(
      `SELECT i.id AS installmentId, t.id AS transactionId, csi.statement_id AS statementId,
              csi.amount AS amount, s.paid_amount AS statementPaidAmount
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN installments i ON i.id = t.installment_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE csi.item_type = 'purchase'
         AND i.total_amount = csi.amount AND i.total_amount > i.installment_amount`,
    )
    .all() as { installmentId: string; transactionId: string; statementId: string; amount: number; statementPaidAmount: number }[]).map(
    (f) => ({
      ...f,
      repairable: Number(f.statementPaidAmount) === 0,
      classification: (Number(f.statementPaidAmount) === 0 ? "deterministicRepairable" : "ambiguous") as "deterministicRepairable" | "ambiguous",
    }),
  );

  const billsWithoutStatement = db
    .prepare(
      `SELECT id AS billId, title
       FROM bills
       WHERE type = 'installment' AND credit_card_id IS NOT NULL AND statement_id IS NULL`,
    )
    .all() as { billId: string; title: string }[];

  const expenseCcPayments = db
    .prepare(
      `SELECT id AS transactionId, amount, merchant
       FROM transactions
       WHERE type = 'expense' AND credit_card_id IS NOT NULL AND installment_id IS NOT NULL`,
    )
    .all() as { transactionId: string; amount: number; merchant: string }[];

  // ---- R09.2: klasifikasi legacy records (purchase vs payment; target deterministik) ----
  const legacyRows = db
    .prepare(
      `SELECT t.id AS transactionId, t.amount AS amount, t.merchant AS merchant, t.wallet_id AS walletId,
              t.installment_id AS installmentId, t.credit_card_id AS creditCardId, t.occurred_at AS occurredAt
       FROM transactions t
       WHERE t.type = 'expense' AND t.credit_card_id IS NOT NULL AND t.installment_id IS NOT NULL`,
    )
    .all() as {
    transactionId: string;
    amount: number;
    merchant: string;
    walletId: string | null;
    installmentId: string | null;
    creditCardId: string | null;
    occurredAt: string;
  }[];

  const legacyPayments: LegacyPaymentCheck[] = legacyRows.map((r) => {
    // B: tanpa wallet → PURCHASE (jangan reklasifikasi).
    if (r.walletId == null) {
      return {
        ...r,
        classification: "B" as const,
        label: "purchase_informational" as const,
        targetStatementId: null,
      };
    }
    // A/C: cari statement target kanonikal untuk tanggal pembayaran.
    const cc = r.creditCardId ? cardCycle.get(r.creditCardId) : undefined;
    let target: string | null = null;
    if (cc && r.occurredAt) {
      const cyc = calculateBillingCycle(String(r.occurredAt), cc.statement_day, cc.due_day);
      const found = db
        .prepare(
          `SELECT id FROM statements WHERE credit_card_id = ? AND period_start = ? AND period_end = ?`,
        )
        .get(r.creditCardId, cyc.periodStart, cyc.periodEnd) as { id: string } | undefined;
      if (found) target = found.id;
    }
    if (target) {
      return {
        ...r,
        classification: "A" as const,
        label: "deterministic_repairable" as const,
        targetStatementId: target,
      };
    }
    return {
      ...r,
      classification: "C" as const,
      label: "ambiguous_manual_review" as const,
      targetStatementId: null,
    };
  });

  const ccPaymentsNullStatement = db
    .prepare(
      `SELECT id AS transactionId, amount
       FROM transactions
       WHERE (type = 'credit_card_settlement' OR (type = 'transfer' AND transfer_type = 'credit_card_payment'))
         AND credit_card_id IS NOT NULL AND statement_id IS NULL`,
    )
    .all() as { transactionId: string; amount: number }[];

  // R09.1: duplikat slice per PERIODE (statement yang sama) — kondisi normal kini
  // boleh memiliki banyak item per cicilan lintas statement (historis immutabel).
  const duplicateSlicePerPeriod = db
    .prepare(
      `SELECT t.installment_id AS installmentId, csi.statement_id AS statementId, COUNT(*) AS count
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       WHERE t.installment_id IS NOT NULL AND csi.item_type = 'installment'
       GROUP BY t.installment_id, csi.statement_id HAVING COUNT(*) > 1`,
    )
    .all() as { installmentId: string; statementId: string; count: number }[];

  // R09.1: statement yang menampung >1 item cicilan untuk cicilan yang sama
  // (selain item payoff — seharusnya maksimal 1 slice per periode).
  const statementAmountInconsistency = db
    .prepare(
      `SELECT csi.statement_id AS statementId, t.installment_id AS installmentId, COUNT(*) AS count
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       WHERE csi.item_type = 'installment'
       GROUP BY csi.statement_id, t.installment_id HAVING COUNT(*) > 1`,
    )
    .all() as { statementId: string; installmentId: string; count: number }[];

  // R09.1: statement PAID tanpa item — indikasi item historis terhapus (anomali serius).
  const paidStatementsWithoutItems = db
    .prepare(
      `SELECT s.id AS statementId, s.paid_amount AS paidAmount
       FROM statements s
       WHERE s.paid_amount > 0
         AND NOT EXISTS (SELECT 1 FROM credit_card_statement_items csi WHERE csi.statement_id = s.id)`,
    )
    .all() as { statementId: string; paidAmount: number }[];

  // R09.1: cicilan CC dengan periode terbayar (paid_count) yang tidak punya slice settle
  // yang cukup — indikasi riwayat slice hilang (tidak dihitung untuk cicilan selesai via payoff).
  const settledSlicesMissing = db
    .prepare(
      `SELECT i.id AS installmentId, i.paid_count AS paidCount,
              COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount <= i.installment_amount THEN 1 END) AS settledCount
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       LEFT JOIN transactions t ON t.installment_id = i.id
       LEFT JOIN credit_card_statement_items csi ON csi.transaction_id = t.id
       LEFT JOIN statements s ON s.id = csi.statement_id
       WHERE b.credit_card_id IS NOT NULL AND i.paid_count > 0 AND i.paid_count < i.tenor
       GROUP BY i.id
       HAVING COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount <= i.installment_amount THEN 1 END) < i.paid_count`,
    )
    .all() as { installmentId: string; paidCount: number; settledCount: number }[];

  // R09.1: amount slice tidak wajar (bukan installment_amount, bukan payoff, > 0).
  // Periode terakhir yang tidak habis dibagi dapat ter-flag — perlu review manual.
  const sliceAmountMismatch = db
    .prepare(
      `SELECT csi.id AS itemId, t.installment_id AS installmentId, csi.amount AS amount,
              i.installment_amount AS expectedAmount
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN installments i ON i.id = t.installment_id
       WHERE csi.item_type = 'installment' AND csi.amount > 0 AND csi.amount != i.installment_amount
         AND csi.amount < i.installment_amount`,
    )
    .all() as { itemId: string; installmentId: string; amount: number; expectedAmount: number }[];

  // R09.1: cicilan selesai (paid_count >= tenor) tanpa item payoff yang settle DAN
  // riwayat slice settle tidak lengkap — anomali payoff/history.
  const payoffRemovedHistory = db
    .prepare(
      `SELECT i.id AS installmentId, i.paid_count AS paidCount,
              COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount <= i.installment_amount THEN 1 END) AS settledRegular,
              COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount > i.installment_amount THEN 1 END) AS coveredPayoff
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       LEFT JOIN transactions t ON t.installment_id = i.id
       LEFT JOIN credit_card_statement_items csi ON csi.transaction_id = t.id
       LEFT JOIN statements s ON s.id = csi.statement_id
       WHERE b.credit_card_id IS NOT NULL AND i.paid_count >= i.tenor
       GROUP BY i.id
       HAVING COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount > i.installment_amount THEN 1 END) = 0
          AND COUNT(CASE WHEN s.paid_amount >= csi.amount AND csi.amount <= i.installment_amount THEN 1 END) < i.tenor`,
    )
    .all() as { installmentId: string; paidCount: number; settledRegular: number; coveredPayoff: number }[];

  // R09.1: total slice reguler yang pernah diposting melebihi total kontrak — pasti anomali.
  const futureCommitmentMismatch = db
    .prepare(
      `SELECT i.id AS installmentId, i.total_amount AS totalAmount,
              COALESCE(SUM(CASE WHEN csi.item_type = 'installment' AND csi.amount <= i.installment_amount THEN csi.amount ELSE 0 END), 0) AS postedRegular
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       LEFT JOIN transactions t ON t.installment_id = i.id
       LEFT JOIN credit_card_statement_items csi ON csi.transaction_id = t.id
       WHERE b.credit_card_id IS NOT NULL
       GROUP BY i.id
       HAVING COALESCE(SUM(CASE WHEN csi.item_type = 'installment' AND csi.amount <= i.installment_amount THEN csi.amount ELSE 0 END), 0) > i.total_amount`,
    )
    .all() as { installmentId: string; totalAmount: number; postedRegular: number }[];

  const ccInstallments: InstallmentCheck = {
    total: Number(
      (db
        .prepare(
          `SELECT COUNT(*) AS n FROM installments i
           JOIN bills b ON b.id = i.bill_id
           WHERE b.credit_card_id IS NOT NULL`,
        )
        .get() as { n: number }).n ?? 0,
    ),
    fullPrincipalItems,
    billsWithoutStatement,
    expenseCcPayments,
    legacyPayments,
    ccPaymentsNullStatement,
    duplicateSlicePerPeriod,
    statementAmountInconsistency,
    paidStatementsWithoutItems,
    settledSlicesMissing,
    sliceAmountMismatch,
    payoffRemovedHistory,
    futureCommitmentMismatch,
  };

  const orphans: OrphanSummary = {
    transactionCategoryIds: orphanIds(db, "transactions", "category_id", "categories"),
    transactionWalletIds: orphanIds(db, "transactions", "wallet_id", "wallets"),
    transactionCreditCardIds: orphanIds(db, "transactions", "credit_card_id", "credit_cards"),
    transactionOwnerProfileIds: orphanIds(db, "transactions", "owner_profile_id", "profiles"),
    transactionBillIds: orphanIds(db, "transactions", "bill_id", "bills"),
    transactionInstallmentIds: orphanIds(db, "transactions", "installment_id", "installments"),
    billCreditCardIds: orphanIds(db, "bills", "credit_card_id", "credit_cards"),
    billWalletIds: orphanIds(db, "bills", "wallet_id", "wallets"),
    billOwnerProfileIds: orphanIds(db, "bills", "owner_profile_id", "profiles"),
    billCategoryIds: orphanIds(db, "bills", "category_id", "categories"),
    statementCreditCardIds: orphanIds(db, "statements", "credit_card_id", "credit_cards"),
    draftCategoryIds: orphanIds(db, "drafts", "category_id", "categories"),
    draftWalletIds: orphanIds(db, "drafts", "wallet_id", "wallets"),
  };

  return {
    generatedAt: new Date().toISOString(),
    ccTransactions: {
      total: Number(ccTotals.total ?? 0),
      linked: Number(ccTotals.linked ?? 0),
      unresolved: Number(ccTotals.unresolved ?? 0),
    },
    settlements: {
      total: Number(stmtTotals.total ?? 0),
      linked: Number(stmtTotals.linked ?? 0),
      unresolved: Number(stmtTotals.unresolved ?? 0),
    },
    statementBills: {
      total: Number(billTotals.total ?? 0),
      linked: Number(billTotals.linked ?? 0),
      unresolved: Number(billTotals.unresolved ?? 0),
    },
    statements,
    suspiciousStatements,
    cardsAffectedByOldUpdates,
    canonicalPeriods,
    overlappingStatements,
    ccInstallments,
    payoffSubsumedSlices,
    orphans,
  };
}
