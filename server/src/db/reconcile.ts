import type { DatabaseSync } from "node:sqlite";

export interface ReconciliationReport {
  generatedAt: string;
  ccTransactions: { total: number; linked: number; unresolved: number };
  settlements: { total: number; linked: number; unresolved: number };
  statementBills: { total: number; linked: number; unresolved: number };
  statements: StatementCheck[];
  suspiciousStatements: StatementCheck[];
  cardsAffectedByOldUpdates: { creditCardId: string; statementId: string }[];
  orphans: OrphanSummary;
}

interface StatementCheck {
  id: string;
  creditCardId: string | null;
  periodStart: string;
  periodEnd: string;
  statementAmount: number;
  paidAmount: number;
  linkedSettlements: number;
  settlementTotal: number;
  suspicious: boolean;
  reason: string;
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

    let suspicious = false;
    let reason = "";
    if (s.paid_amount > s.statement_amount) {
      suspicious = true;
      reason = "paid_amount melebihi statement_amount";
    } else if (s.paid_amount > 0 && linked.total < s.paid_amount) {
      suspicious = true;
      reason = "paid_amount tidak tercakup transaksi settlement yang terhubung (kemungkinan efek update credit_card_id-only lama)";
    } else if (s.paid_amount > 0 && linked.n === 0) {
      suspicious = true;
      reason = "paid_amount > 0 tanpa settlement terhubung";
    }

    return {
      id: s.id,
      creditCardId: s.credit_card_id,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      statementAmount: s.statement_amount,
      paidAmount: s.paid_amount,
      linkedSettlements: linked.n,
      settlementTotal: linked.total,
      suspicious,
      reason,
    };
  });

  const suspiciousStatements = statements.filter((s) => s.suspicious);
  const cardsAffectedByOldUpdates = statements
    .filter((s) => s.paidAmount > 0 && s.linkedSettlements === 0)
    .map((s) => ({ creditCardId: s.creditCardId ?? "", statementId: s.id }));

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
    orphans,
  };
}
