import type { DatabaseSync } from "node:sqlite";
import { reconcile, type ReconciliationReport } from "./reconcile.js";
import { getStatementCalc, calculateCreditCardMetrics } from "../services/statement-domain.js";

// ─── Types ────────────────────────────────────────────────────────────

export type V4Classification = "deterministicRepairable" | "ambiguous" | "informational";

export interface FullPrincipalV4 {
  statementId: string;
  transactionId: string;
  installmentId: string;
  amount: number;
  statementPaidAmount: number;
  classification: V4Classification;
  reason: string;
}

export interface LegacyPaymentV4 {
  transactionId: string;
  installmentId: string | null;
  creditCardId: string | null;
  amount: number;
  occurredAt: string;
  reason: string;
  classification: V4Classification;
  targetStatementId: string | null;
}

export interface MissingSettledSliceV4 {
  installmentId: string;
  paidCount: number;
  settledCount: number;
  classification: V4Classification;
  reason: string;
}

export interface SuspiciousPaidStatementV4 {
  statementId: string;
  derivedAmount: number;
  paidAmount: number;
  effectiveAmount: number;
  kind: "actual_anomaly" | "false_positive" | "historical_deletion_artifact" | "overpayment" | "informational";
  classification: V4Classification;
  reason: string;
}

export interface DuplicateSliceV4 {
  statementId: string;
  installmentId: string;
  count: number;
  kind: "same_statement" | "cross_statement";
  classification: V4Classification;
  reason: string;
}

export interface SliceAmountMismatchV4 {
  itemId: string;
  installmentId: string;
  amount: number;
  expectedAmount: number;
  classification: V4Classification;
  reason: string;
}

export interface FutureCommitmentMismatchV4 {
  installmentId: string;
  totalAmount: number;
  postedRegular: number;
  classification: V4Classification;
  reason: string;
}

export interface ProductionGateV4 {
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

export interface ReconcileV4Report {
  generatedAt: string;
  canonicalPeriods: { statementId: string; creditCardId: string | null; periodStart: string; periodEnd: string; canonical: boolean; expectedStart: string; expectedEnd: string; classification: V4Classification }[];
  overlappingStatements: { a: string; b: string; creditCardId: string | null; aCanonical: boolean; bCanonical: boolean; aEmpty: boolean; bEmpty: boolean; deterministicMerge: boolean; classification: V4Classification }[];
  fullPrincipalInstallments: FullPrincipalV4[];
  legacyPayments: LegacyPaymentV4[];
  missingSettledSlices: MissingSettledSliceV4[];
  suspiciousPaidStatements: SuspiciousPaidStatementV4[];
  duplicateSlices: DuplicateSliceV4[];
  sliceAmountMismatch: SliceAmountMismatchV4[];
  futureCommitmentMismatch: FutureCommitmentMismatchV4[];
  payoffSubsumedSlices: { itemId: string; installmentId: string; statementId: string; amount: number; paidByTransactionId: string | null; classification: V4Classification }[];
  productionGate: ProductionGateV4;
  repairableCount: number;
  ambiguousCount: number;
  informationalCount: number;
}

// Legacy registry: transaksi CC-installment historis (pre-R09) — jangan
// dianggap polusi (R09.3 — ZERO deterministik).
const LEGACY_CC_EXPENSE_INSTALLMENT_IDS = new Set([
  "t-1787971912929-ltoou",
  "t-1787971637766-nn5p8",
  "t-1787971751366-iledd",
  "t-1787736217628-wdxbf",
  "t-1787823372768-y3r51",
  "t-1787972974648-jpudl",
  "t-1787973017385-s43pp",
  "t-1787973029963-7e1tb",
  "t-1787973468456-09y3x",
  "t-1787974053720-epwyi",
  "t-1787974077976-zsvfm",
]);

// Statement non-kanonikal yang merupakan artefak legacy (tidak perlu dimigrasi).
const LEGACY_NON_CANONICAL_STATEMENT_IDS = new Set(["st-bca"]);

// ─── Reconcile V4 ─────────────────────────────────────────────────────

export function reconcileV4(db: DatabaseSync): ReconcileV4Report {
  const v3 = reconcile(db);
  const now = v3.generatedAt;

  // ── 1. Canonical periods ───────────────────────────────────────
  const canonicalPeriods = v3.canonicalPeriods.map((c) => ({
    statementId: c.statementId,
    creditCardId: c.creditCardId,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    canonical: c.canonical,
    expectedStart: c.expectedStart,
    expectedEnd: c.expectedEnd,
    classification: c.canonical ? "informational" as const : "ambiguous" as const,
  }));

  // ── 2. Overlapping statements ──────────────────────────────────
  const overlappingStatements = v3.overlappingStatements.map((o) => ({
    a: o.a,
    b: o.b,
    creditCardId: o.creditCardId,
    aCanonical: o.aCanonical,
    bCanonical: o.bCanonical,
    aEmpty: o.aEmpty,
    bEmpty: o.bEmpty,
    deterministicMerge: o.deterministicMerge,
    classification: o.classification as V4Classification,
  }));

  // ── 3. Full-principal installments ─────────────────────────────
  const fullPrincipalInstallments: FullPrincipalV4[] = v3.ccInstallments.fullPrincipalItems.map((f) => ({
    statementId: f.statementId,
    transactionId: f.transactionId,
    installmentId: f.installmentId,
    amount: f.amount,
    statementPaidAmount: f.statementPaidAmount,
    classification: (f.statementPaidAmount > 0 ? "ambiguous" : "deterministicRepairable") as V4Classification,
    reason: f.statementPaidAmount > 0
      ? "full-principal pada statement sudah dibayar — konversi akan menciptakan overpayment (R09.3)"
      : "full-principal pada statement belum dibayar — konversi deterministik dimungkinkan",
  }));

  // ── 4. Legacy payments ─────────────────────────────────────────
  // Helper: cek apakah transaksi adalah item statement pada target.
  const isTxItemOnStatement = (txId: string, stmtId: string | null): boolean => {
    if (!stmtId) return false;
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE transaction_id = ? AND statement_id = ?")
      .get(txId, stmtId) as { n: number };
    return row.n > 0;
  };

  const legacyPayments: LegacyPaymentV4[] = v3.ccInstallments.legacyPayments.map((l) => {
    // Purchase (tanpa wallet) — informational.
    if (l.walletId == null) {
      return {
        transactionId: l.transactionId,
        installmentId: l.installmentId,
        creditCardId: l.creditCardId,
        amount: l.amount,
        occurredAt: l.occurredAt,
        reason: "purchase tanpa wallet — tidak ada reklasifikasi (R09.3)",
        classification: "informational" as const,
        targetStatementId: null,
      };
    }
    // Ber-wallet → ambiguous (R09.3: tidak ada repair deterministik).
    const isSelf = l.targetStatementId ? isTxItemOnStatement(l.transactionId, l.targetStatementId) : false;
    const reason = isSelf
      ? "transaksi ini adalah item pada statement target — reklasifikasi akan menghilangkan konten billing (R09.3: statement_item_self)"
      : "target statement deterministik tidak dapat ditentukan tanpa menciptakan overpayment / mengubah riwayat (R09.3: statement_target_mismatch)";
    return {
      transactionId: l.transactionId,
      installmentId: l.installmentId,
      creditCardId: l.creditCardId,
      amount: l.amount,
      occurredAt: l.occurredAt,
      reason,
      classification: "ambiguous" as const,
      targetStatementId: l.targetStatementId,
    };
  });

  // ── 5. Missing settled slices ──────────────────────────────────
  const missingSettledSlices: MissingSettledSliceV4[] = v3.ccInstallments.settledSlicesMissing.map((m) => ({
    installmentId: m.installmentId,
    paidCount: m.paidCount,
    settledCount: m.settledCount,
    classification: "ambiguous" as const,
    reason: "slice settle tidak mencukupi paid_count — artefak representasi full-principal (R09.3: report-only)",
  }));

  // ── 6. Suspicious paid statements ──────────────────────────────
  const suspiciousPaidStatements: SuspiciousPaidStatementV4[] = v3.statements
    .filter((s) => s.cause !== "ok")
    .map((s) => {
      const base = { statementId: s.id, derivedAmount: s.derivedAmount, paidAmount: s.paidAmount, effectiveAmount: s.statementAmount };
      switch (s.cause) {
        case "full_principal":
          return { ...base, kind: "false_positive" as const, classification: "informational" as const, reason: "derived koheren; item full-principal historis" };
        case "deleted_item_or_overpayment":
          return { ...base, kind: "historical_deletion_artifact" as const, classification: "ambiguous" as const, reason: "paid_amount > 0 tanpa item (derived 0) — artefak penghapusan/overpayment, butuh review" };
        case "overpayment":
          return { ...base, kind: "overpayment" as const, classification: "ambiguous" as const, reason: "paid_amount melebihi statement_amount efektif" };
        case "ambiguous":
          return { ...base, kind: "actual_anomaly" as const, classification: "ambiguous" as const, reason: "paid_amount > 0 tanpa settlement terhubung" };
        default:
          return { ...base, kind: "informational" as const, classification: "informational" as const, reason: "ok" };
      }
    });

  // ── 7. Duplicate slices ────────────────────────────────────────
  const duplicateSlices: DuplicateSliceV4[] = [
    ...v3.ccInstallments.duplicateSlicePerPeriod.map((d) => ({
      statementId: d.statementId,
      installmentId: d.installmentId,
      count: d.count,
      kind: "cross_statement" as const,
      classification: "informational" as const,
      reason: "banyak item per cicilan lintas statement (historis immutabel) — normal",
    })),
    ...v3.ccInstallments.statementAmountInconsistency.map((d) => ({
      statementId: d.statementId,
      installmentId: d.installmentId,
      count: d.count,
      kind: "same_statement" as const,
      classification: "ambiguous" as const,
      reason: ">1 slice cicilan pada statement yang sama (selain payoff) — perlu review manual",
    })),
  ];

  // ── 8. Slice amount mismatch ───────────────────────────────────
  const sliceAmountMismatch: SliceAmountMismatchV4[] = v3.ccInstallments.sliceAmountMismatch.map((m) => ({
    itemId: m.itemId,
    installmentId: m.installmentId,
    amount: m.amount,
    expectedAmount: m.expectedAmount,
    classification: "ambiguous" as const,
    reason: "nominal slice tidak sama dengan installment_amount (perlu review manual)",
  }));

  // ── 9. Future commitment mismatch ──────────────────────────────
  const futureCommitmentMismatch: FutureCommitmentMismatchV4[] = v3.ccInstallments.futureCommitmentMismatch.map((m) => ({
    installmentId: m.installmentId,
    totalAmount: m.totalAmount,
    postedRegular: m.postedRegular,
    classification: "ambiguous" as const,
    reason: "total slice reguler terposting melebihi total kontrak cicilan",
  }));

  // ── 10. Payoff subsumed slices ──────────────────────────────────
  const payoffSubsumedSlices = v3.payoffSubsumedSlices.map((p) => ({
    itemId: p.itemId,
    installmentId: p.installmentId,
    statementId: p.statementId,
    amount: p.amount,
    paidByTransactionId: p.paidByTransactionId,
    classification: "informational" as const,
  }));

  // ── Classification counts ──────────────────────────────────────
  const allSections = [
    ...fullPrincipalInstallments,
    ...legacyPayments,
    ...missingSettledSlices,
    ...suspiciousPaidStatements,
    ...duplicateSlices,
    ...sliceAmountMismatch,
    ...futureCommitmentMismatch,
    ...canonicalPeriods.filter((c) => !c.canonical),
    ...overlappingStatements,
    ...payoffSubsumedSlices,
  ];

  const repairableCount = allSections.filter((s) => s.classification === "deterministicRepairable").length;
  const ambiguousCount = allSections.filter((s) => s.classification === "ambiguous").length;
  const informationalCount = allSections.filter((s) => s.classification === "informational").length;

  // ── Production gate ────────────────────────────────────────────
  const productionGate = buildProductionGate(db, v3, repairableCount, ambiguousCount, informationalCount);

  return {
    generatedAt: now,
    canonicalPeriods,
    overlappingStatements,
    fullPrincipalInstallments,
    legacyPayments,
    missingSettledSlices,
    suspiciousPaidStatements,
    duplicateSlices,
    sliceAmountMismatch,
    futureCommitmentMismatch,
    payoffSubsumedSlices,
    productionGate,
    repairableCount,
    ambiguousCount,
    informationalCount,
  };
}

// ─── Production gate ──────────────────────────────────────────────────

function buildProductionGate(
  db: DatabaseSync,
  v3: ReconciliationReport,
  repairableCount: number,
  ambiguousCount: number,
  informationalCount: number,
): ProductionGateV4 {
  const checks: { name: string; pass: boolean; note: string }[] = [];

  // 1. deterministicRepairable === 0
  checks.push({
    name: "deterministic_repairable_zero",
    pass: repairableCount === 0,
    note: repairableCount === 0 ? "ok" : `${repairableCount} item deterministik belum diperbaiki`,
  });

  // 2. No current invariant violation: statement donde paid > effective AND derived > 0 → overpayment real.
  const overpaymentOrViolation = v3.statements.filter((s) => s.paidAmount > s.statementAmount && s.derivedAmount > 0);
  checks.push({
    name: "no_current_invariant_violation",
    pass: overpaymentOrViolation.length === 0,
    note: overpaymentOrViolation.length === 0 ? "ok" : `${overpaymentOrViolation.length} statement dengan overpayment actual`,
  });

  // 3. No duplicate current liability: open/issued statement dengan duplicate slice pada statement yang sama.
  const currentDup = v3.ccInstallments.statementAmountInconsistency.filter((d) => {
    const stmt = db.prepare("SELECT status FROM statements WHERE id = ?").get(d.statementId) as { status: string } | undefined;
    return stmt && (stmt.status === "open" || stmt.status === "issued");
  });
  checks.push({
    name: "no_duplicate_current_liability",
    pass: currentDup.length === 0,
    note: currentDup.length === 0 ? "ok" : `${currentDup.length} duplicate slice pada statement aktif`,
  });

  // 4. currentOutstanding ok: for each card, metrics non-negative.
  const cards = db.prepare("SELECT id, group_id FROM credit_cards").all() as { id: string; group_id: string }[];
  let outstandingOk = true;
  let outstandingNote = "";
  for (const c of cards) {
    const metrics = calculateCreditCardMetrics(db, c.group_id, c.id);
    if (!metrics || metrics.currentOutstanding < 0 || metrics.availableCredit < 0) {
      outstandingOk = false;
      outstandingNote = `kartu ${c.id}: outstanding=${metrics?.currentOutstanding}, available=${metrics?.availableCredit}`;
      break;
    }
  }
  checks.push({
    name: "current_outstanding_ok",
    pass: outstandingOk,
    note: outstandingOk ? "ok" : outstandingNote,
  });

  // 5. futureCommitmentMismatch empty.
  const fcmLen = v3.ccInstallments.futureCommitmentMismatch.length;
  checks.push({
    name: "future_commitment_ok",
    pass: fcmLen === 0,
    note: fcmLen === 0 ? "ok" : `${fcmLen} future commitment mismatch ditemukan`,
  });

  // 6. Paid statements coherent: no statement dengan paid > effective (overpayment).
  const overpaid = v3.statements.filter((s) => s.paidAmount > s.statementAmount);
  checks.push({
    name: "paid_statements_coherent",
    pass: overpaid.length === 0,
    note: overpaid.length === 0 ? "ok" : `${overpaid.length} statement dengan paid > effective`,
  });

  // 7. Statement assignment deterministic: non-canonical statements with content must be whitelisted legacy.
  const nonCanonContent = v3.canonicalPeriods.filter((c) => {
    if (c.canonical) return false;
    if (LEGACY_NON_CANONICAL_STATEMENT_IDS.has(c.statementId)) return false;
    // Cek apakah statement memiliki konten (items/transactions/bills)
    const itemCount = (db.prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE statement_id = ?").get(c.statementId) as { n: number }).n;
    const txCount = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE statement_id = ?").get(c.statementId) as { n: number }).n;
    const billCount = (db.prepare("SELECT COUNT(*) AS n FROM bills WHERE statement_id = ?").get(c.statementId) as { n: number }).n;
    return itemCount > 0 || txCount > 0 || billCount > 0;
  });
  checks.push({
    name: "statement_assignment_deterministic",
    pass: nonCanonContent.length === 0,
    note: nonCanonContent.length === 0 ? "ok" : `${nonCanonContent.length} non-canonical statement dengan konten aktif (${nonCanonContent.map((c) => c.statementId).join(", ")})`,
  });

  // 8. CC payment remains transfer: no NEW expense+CC+installment+wallet records beyond legacy.
  const newPollution = (db
    .prepare(
      `SELECT id AS transactionId FROM transactions
       WHERE type = 'expense' AND credit_card_id IS NOT NULL AND installment_id IS NOT NULL AND wallet_id IS NOT NULL`,
    )
    .all() as { transactionId: string }[]).filter((r) => !LEGACY_CC_EXPENSE_INSTALLMENT_IDS.has(r.transactionId));
  checks.push({
    name: "cc_payment_remains_transfer",
    pass: newPollution.length === 0,
    note: newPollution.length === 0 ? "ok" : `${newPollution.length} transaksi expense+CC baru (bukan legacy) ditemukan`,
  });

  // 9. CC installment payment creates no expense (same as 8 — for the record).
  checks.push({
    name: "cc_installment_payment_no_expense",
    pass: newPollution.length === 0,
    note: newPollution.length === 0 ? "ok" : `${newPollution.length} transaksi expense+CC+installment baru`,
  });

  // 10. Debt/receivable directions correct.
  const wrongReceivable = db
    .prepare(
      `SELECT t.id AS txId FROM transactions t
       JOIN bills b ON b.id = t.bill_id
       WHERE b.type = 'receivable' AND t.type = 'expense'`,
    )
    .all() as { txId: string }[];
  const wrongDebt = db
    .prepare(
      `SELECT t.id AS txId FROM transactions t
       JOIN bills b ON b.id = t.bill_id
       WHERE b.type = 'debt' AND t.type = 'income'`,
    )
    .all() as { txId: string }[];
  checks.push({
    name: "debt_receivable_directions",
    pass: wrongReceivable.length === 0 && wrongDebt.length === 0,
    note: wrongReceivable.length === 0 && wrongDebt.length === 0
      ? "ok"
      : `receivable dengan expense: ${wrongReceivable.length}, debt dengan income: ${wrongDebt.length}`,
  });

  const allPass = checks.every((c) => c.pass);
  return {
    status: allPass ? "READY" : "BLOCKED",
    currentIntegrity: { passed: allPass, checks },
    historical: { repairableCount, ambiguousCount, informationalCount },
  };
}