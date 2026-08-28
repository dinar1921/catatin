import type { DatabaseSync } from "node:sqlite";
import { sv, nid } from "../db/sql.js";

export interface StatementCalc {
  id: string;
  groupId: string;
  creditCardId: string;
  periodStart: string;
  periodEnd: string;
  statementAmount: number;
  officialAmount: number | null;
  derivedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string;
  status: "open" | "issued" | "overdue" | "paid";
}

export interface CreditCardMetrics {
  id: string;
  name: string;
  issuer: string;
  lastFour: string;
  statementDay: number;
  dueDay: number;
  creditLimit: number;
  currentOutstanding: number;
  availableCredit: number;
  unbilledAmount: number;
  billedAmount: number;
  futureInstallmentCommitment: number;
  ownerProfileId: string | null;
  scope: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Hitung `period_start`, `period_end`, dan `due_date` berdasarkan `statementDay` & `dueDay`.
 * Aturan Cutoff:
 * - statementDay = 25 -> Periode: 26 Juli s.d. 25 Agustus (pStart: 2026-07-26, pEnd: 2026-08-25).
 * - Tanggal <= 25 -> menutup di 25 bulan berjalan.
 * - Tanggal > 25 -> menutup di 25 bulan berikutnya.
 * - Due date -> tanggal dueDay di bulan setelah periodEnd.
 */
export function calculateBillingCycle(
  occurredAt: string,
  statementDay: number,
  dueDay: number,
): { periodStart: string; periodEnd: string; dueDate: string } {
  const d = new Date(occurredAt.slice(0, 10) + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const day = d.getDate();

  let endYear = year;
  let endMonth = month;

  if (day > statementDay) {
    // Melewati tanggal cutoff -> masuk ke billing cycle yang menutup bulan depan
    endMonth += 1;
    if (endMonth > 11) {
      endMonth = 0;
      endYear += 1;
    }
  }

  // period_end: tanggal statementDay pada endYear & endMonth
  const maxEndDays = new Date(endYear, endMonth + 1, 0).getDate();
  const actualEndDay = Math.min(statementDay, maxEndDays);
  const periodEnd = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-${String(actualEndDay).padStart(2, "0")}`;

  // period_start: 1 hari setelah period_end bulan sebelumnya
  let startMonth = endMonth - 1;
  let startYear = endYear;
  if (startMonth < 0) {
    startMonth = 11;
    startYear -= 1;
  }
  const maxStartDays = new Date(startYear, startMonth + 1, 0).getDate();
  const prevEndDay = Math.min(statementDay, maxStartDays);

  const startDateObj = new Date(startYear, startMonth, prevEndDay + 1);
  const periodStart = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, "0")}-${String(startDateObj.getDate()).padStart(2, "0")}`;

  // due_date: tanggal dueDay di bulan setelah periodEnd
  let dueMonth = endMonth + 1;
  let dueYear = endYear;
  if (dueMonth > 11) {
    dueMonth = 0;
    dueYear += 1;
  }
  const maxDueDays = new Date(dueYear, dueMonth + 1, 0).getDate();
  const actualDueDay = Math.min(dueDay, maxDueDays);
  const dueDate = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(actualDueDay).padStart(2, "0")}`;

  return { periodStart, periodEnd, dueDate };
}

/**
 * Cari atau buat statement secara deterministik berdasarkan tanggal transaksi (`occurredAt`).
 */
export function resolveOrCreateStatement(
  db: DatabaseSync,
  groupId: string,
  creditCardId: string,
  occurredAt: string,
): string {
  const card = db
    .prepare("SELECT statement_day, due_day FROM credit_cards WHERE id = ? AND group_id = ?")
    .get(creditCardId, groupId) as { statement_day: number; due_day: number } | undefined;

  if (!card) throw new Error("Kartu kredit tidak ditemukan");

  const { periodStart, periodEnd, dueDate } = calculateBillingCycle(
    occurredAt,
    card.statement_day,
    card.due_day,
  );

  // Cari statement yang persis cocok dengan periode
  const existing = db
    .prepare(
      `SELECT id FROM statements
       WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?`,
    )
    .get(groupId, creditCardId, periodStart, periodEnd) as { id: string } | undefined;

  if (existing) return existing.id;

  // On-demand creation bila belum ada statement untuk cycle ini
  const stmtId = nid("st");
  db.prepare(
    `INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'open')`,
  ).run(sv(stmtId), sv(groupId), sv(creditCardId), sv(periodStart), sv(periodEnd), sv(dueDate));

  return stmtId;
}

/**
 * Hitung kalkulasi lengkap satu statement (derived, official, remaining, status).
 */
export function getStatementCalc(db: DatabaseSync, statementId: string): StatementCalc | null {
  const stmt = db
    .prepare("SELECT * FROM statements WHERE id = ?")
    .get(statementId) as Record<string, unknown> | undefined;

  if (!stmt) return null;

  const derivedRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM credit_card_statement_items
       WHERE statement_id = ?`,
    )
    .get(statementId) as { total: number };

  const paidRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE statement_id = ? AND type = 'transfer' AND transfer_type = 'credit_card_payment'`,
    )
    .get(statementId) as { total: number };

  const derivedAmount = Number(derivedRow.total ?? 0);
  const officialAmount = stmt.official_amount != null ? Number(stmt.official_amount) : null;
  const statementAmount = officialAmount ?? derivedAmount;
  const paidAmount = Number(paidRow.total ?? 0);
  const remainingAmount = Math.max(0, statementAmount - paidAmount);

  const today = todayISO();
  const dueDate = String(stmt.due_date);
  const periodEnd = String(stmt.period_end);

  let status: "open" | "issued" | "overdue" | "paid" = "open";
  if (statementAmount > 0 && paidAmount >= statementAmount) {
    status = "paid";
  } else if (today > dueDate && remainingAmount > 0) {
    status = "overdue";
  } else if (today > periodEnd) {
    status = "issued";
  } else {
    status = "open";
  }

  return {
    id: String(stmt.id),
    groupId: String(stmt.group_id),
    creditCardId: String(stmt.credit_card_id),
    periodStart: String(stmt.period_start),
    periodEnd,
    statementAmount,
    officialAmount,
    derivedAmount,
    paidAmount,
    remainingAmount,
    dueDate,
    status,
  };
}

/**
 * Hitung metrik dinamis kartu kredit (outstanding, available credit, unbilled, billed, future commitment).
 * SATU-SATUNYA helper backend yang digunakan oleh API kartu kredit (Rule 1-10).
 */
export function calculateCreditCardMetrics(
  database: DatabaseSync,
  groupId: string,
  cardId: string,
): CreditCardMetrics | null {
  const card = database
    .prepare("SELECT * FROM credit_cards WHERE id = ? AND group_id = ?")
    .get(cardId, groupId) as Record<string, unknown> | undefined;

  if (!card) return null;

  const stmts = database
    .prepare("SELECT id FROM statements WHERE credit_card_id = ? AND group_id = ?")
    .all(cardId, groupId) as { id: string }[];

  let billedAmount = 0;
  let unbilledAmount = 0;

  for (const s of stmts) {
    const calc = getStatementCalc(database, s.id);
    if (!calc) continue;
    if (calc.status === "issued" || calc.status === "overdue") {
      billedAmount += calc.remainingAmount;
    } else if (calc.status === "open") {
      unbilledAmount += calc.remainingAmount;
    }
  }

  // Tambahkan transaksi CC yang BELUM terasosiasi ke statement mana pun (statement_id IS NULL)
  // Mencegah double-counting transaksi yang sudah terasosiasi ke statement (Rule 1 & 2)
  const orphanCcTx = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE group_id = ? AND credit_card_id = ? AND statement_id IS NULL AND type = 'expense'`,
    )
    .get(groupId, cardId) as { total: number };

  unbilledAmount += Number(orphanCcTx.total ?? 0);

  const currentOutstanding = billedAmount + unbilledAmount;
  const creditLimit = Number(card.credit_limit ?? 0);
  const availableCredit = Math.max(0, creditLimit - currentOutstanding);

  // Future installment commitment: sisa kewajiban cicilan yang belum ditagihkan.
  // TIDAK mengurangi availableCredit sampai cicilan di-post ke statement (Rule 7 & 8).
  const instRow = database
    .prepare(
      `SELECT COALESCE(SUM(i.total_amount - (i.paid_count * i.installment_amount)), 0) AS total
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       WHERE b.group_id = ? AND b.credit_card_id = ? AND i.paid_count < i.tenor`,
    )
    .get(groupId, cardId) as { total: number };

  const futureInstallmentCommitment = Math.max(0, Number(instRow.total ?? 0));

  return {
    id: String(card.id),
    name: String(card.name),
    issuer: String(card.issuer ?? ""),
    lastFour: String(card.last_four ?? ""),
    statementDay: Number(card.statement_day),
    dueDay: Number(card.due_day),
    creditLimit,
    currentOutstanding,
    availableCredit,
    unbilledAmount,
    billedAmount,
    futureInstallmentCommitment,
    ownerProfileId: (card.owner_profile_id as string | null) ?? null,
    scope: (card.scope as string) ?? "shared",
  };
}

export function getCreditCardMetrics(database: DatabaseSync, groupId: string, cardId: string): CreditCardMetrics | null {
  return calculateCreditCardMetrics(database, groupId, cardId);
}
