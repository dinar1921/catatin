import type { DatabaseSync } from "node:sqlite";
import { sv, nid } from "../db/sql.js";

/** Error domain dengan status HTTP agar route dapat meneruskan kode yang tepat. */
export class DomainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

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
  subsumedAmount: number;
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

  // On-demand creation bila belum ada statement untuk cycle ini.
  // R09.1: concurrency-safe — bila statement lain sudah membuat periode yang sama
  // (race), UNIQUE constraint akan menolak insert; lalu kita re-select.
  const stmtId = nid("st");
  try {
    db.prepare(
      `INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'open')`,
    ).run(sv(stmtId), sv(groupId), sv(creditCardId), sv(periodStart), sv(periodEnd), sv(dueDate));
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) {
      const again = db
        .prepare(
          `SELECT id FROM statements
           WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?`,
        )
        .get(groupId, creditCardId, periodStart, periodEnd) as { id: string } | undefined;
      if (again) return again.id;
    }
    throw e;
  }

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
  // R09.1: tambahkan slice derived periode berjalan (item yang belum dimaterialisasi
  // karena siklusnya mulai tanpa write event). GET mutlak read-only.
  const derivedSlices = getDerivedSlicesForStatement(db, String(stmt.group_id), statementId);
  const derivedContribution = derivedSlices.reduce((a, s) => a + s.amount, 0);
  const totalDerived = derivedAmount + derivedContribution;
  const officialAmount = stmt.official_amount != null ? Number(stmt.official_amount) : null;
  const statementAmount = officialAmount ?? totalDerived;
  const paidAmount = Number(paidRow.total ?? 0);

  // R09.2: item yang di-subsum payoff (paid_by_transaction_id terisi) tetap menjadi
  // bagian derived (historis), tetapi kewajibannya sudah diselesaikan oleh payoff —
  // sehingga effectivePaid = paidAmount + subsumed, dan remaining memakainya.
  const subsumedRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM credit_card_statement_items
       WHERE statement_id = ? AND paid_by_transaction_id IS NOT NULL`,
    )
    .get(statementId) as { total: number };
  const subsumedAmount = Number(subsumedRow.total ?? 0);
  const effectivePaidAmount = paidAmount + subsumedAmount;
  const remainingAmount = Math.max(0, statementAmount - effectivePaidAmount);

  const today = todayISO();
  const dueDate = String(stmt.due_date);
  const periodEnd = String(stmt.period_end);

  let status: "open" | "issued" | "overdue" | "paid" = "open";
  if (statementAmount > 0 && effectivePaidAmount >= statementAmount) {
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
    derivedAmount: totalDerived,
    paidAmount,
    subsumedAmount,
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

  // R09.1: GET read-only — TIDAK ada materialisasi di sini. Slice periode berjalan
  // dihitung DERIVED (lewat getStatementCalc / perhitungan commitment di bawah).

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
  // Mencegah double-counting transaksi yang sudah terasosiasi ke statement (Rule 1 & 2).
  // Transaksi cicilan yang tercatat sebagai expense (legacy / salah model) TIDAK dihitung
  // sebagai kewajiban CC mandiri — kewajiban tersebut sudah diwakili statement item
  // (R09: pembayaran cicilan tidak boleh menaikkan outstanding).
  const orphanCcTx = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE group_id = ? AND credit_card_id = ? AND statement_id IS NULL
         AND type = 'expense' AND installment_id IS NULL`,
    )
    .get(groupId, cardId) as { total: number };

  unbilledAmount += Number(orphanCcTx.total ?? 0);

  const currentOutstanding = billedAmount + unbilledAmount;
  const creditLimit = Number(card.credit_limit ?? 0);
  const availableCredit = Math.max(0, creditLimit - currentOutstanding);

  // Future installment commitment: sisa kewajiban cicilan yang BELUM ditagihkan.
  // R09.1 — agregasi PER INSTALLMENT (tidak boleh menghitung satu cicilan berulang
  // hanya karena ia memiliki beberapa item statement historis):
  //   commitment = total - paid_count*slice - paid_amount - stored_unpaid - derived_unpaid
  // Invariant: currentOutstanding(instalment) + commitment = total - sudah dibayar.
  const instRows = database
    .prepare(
      `SELECT i.id, i.total_amount, i.installment_amount, i.paid_count, i.paid_amount, i.start_date, i.tenor,
              COALESCE(SUM(CASE WHEN csi.amount IS NOT NULL AND csi.item_type = 'installment'
                                THEN csi.amount - MIN(COALESCE(s.paid_amount, 0), csi.amount)
                                ELSE 0 END), 0) AS stored_unpaid,
              COALESCE(SUM(CASE WHEN csi.amount IS NOT NULL AND csi.item_type = 'purchase'
                                THEN MIN(COALESCE(s.paid_amount, 0), csi.amount)
                                ELSE 0 END), 0) AS legacy_settled
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       LEFT JOIN transactions t
         ON t.installment_id = i.id AND t.type = 'expense' AND t.group_id = b.group_id
       LEFT JOIN credit_card_statement_items csi
         ON csi.transaction_id = t.id
       LEFT JOIN statements s ON s.id = csi.statement_id
       WHERE b.group_id = ? AND b.credit_card_id = ? AND i.paid_count < i.tenor
       GROUP BY i.id`,
    )
    .all(groupId, cardId) as unknown as {
    id: string;
    total_amount: number;
    installment_amount: number;
    paid_count: number;
    paid_amount: number;
    start_date: string;
    tenor: number;
    stored_unpaid: number;
    legacy_settled: number;
  }[];

  const today = todayISO();
  let futureInstallmentCommitment = 0;
  for (const r of instRows) {
    const slice = Number(r.installment_amount ?? 0);
    const storedUnpaid = Number(r.stored_unpaid ?? 0);
    const legacySettled = Number(r.legacy_settled ?? 0);
    const total = Number(r.total_amount ?? 0);
    const pc = Number(r.paid_count ?? 0);

    // Derived unpaid: slice periode berjalan bila siklusnya sudah mulai DAN belum ada
    // item tersimpan untuk periode tersebut (dihitung, tidak ditulis).
    let derivedUnpaid = 0;
    const expected = expectedCycleForInstallment(database, groupId, {
      id: r.id,
      start_date: r.start_date,
      credit_card_id: String(card.id),
      paid_count: pc,
      tenor: Number(r.tenor ?? 0),
    });
    if (expected && expected.periodStart <= today) {
      const stmt = database
        .prepare(
          `SELECT id, paid_amount FROM statements
           WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?`,
        )
        .get(groupId, cardId, expected.periodStart, expected.periodEnd) as
        | { id: string; paid_amount: number }
        | undefined;

      const hasStored = database
        .prepare(
          `SELECT 1 FROM credit_card_statement_items csi
           JOIN transactions t ON t.id = csi.transaction_id
           WHERE t.installment_id = ? AND csi.statement_id = ?
           LIMIT 1`,
        )
        .get(r.id, stmt?.id ?? "");
      if (!hasStored) {
        const currentSlice = Math.max(0, Math.min(slice, total - pc * slice - Number(r.paid_amount ?? 0)));
        const stmtPaid = stmt ? Number(stmt.paid_amount) : 0;
        derivedUnpaid = Math.max(0, currentSlice - Math.min(stmtPaid, currentSlice));
      }
    }

    futureInstallmentCommitment += Math.max(
      0,
      total - pc * slice - Number(r.paid_amount ?? 0) - storedUnpaid - derivedUnpaid - legacySettled,
    );
  }
  futureInstallmentCommitment = Math.max(0, futureInstallmentCommitment);

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

/* ------------------------------------------------------------------ */
/* R09 — Installment + Credit Card domain                              */
/* ------------------------------------------------------------------ */

/** Tambah bulan pada ISO date (hari di-clamp ke jumlah hari bulan tujuan). */
function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, dim));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tambah hari pada ISO date. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Geser siklus billing sebanyak `shift` siklus dengan SEMANTIK CANONICAL.
 * periodStart siklus N = hari setelah periodEnd siklus N−1 (bukan sekadar
 * +bulan dari periodStart lama) — ini menjamin kesesuaian dengan aturan cutoff
 * calculateBillingCycle (mis. siklus berakhir 8/30 dimulai 7/31, bukan 8/1).
 */
function shiftCycle(
  base: { periodStart: string; periodEnd: string; dueDate: string },
  shift: number,
): { periodStart: string; periodEnd: string; dueDate: string } {
  const periodEnd = addMonthsISO(base.periodEnd, shift);
  const periodStart = shift === 0 ? base.periodStart : addDaysISO(addMonthsISO(base.periodEnd, shift - 1), 1);
  const dueDate = addMonthsISO(base.dueDate, shift);
  return { periodStart, periodEnd, dueDate };
}

/** Selisih bulan kalender antar dua ISO date (berbasis bulan, hari diabaikan). */
function monthsBetweenISO(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + "T00:00:00");
  const dbb = new Date(b.slice(0, 10) + "T00:00:00");
  return (dbb.getFullYear() - da.getFullYear()) * 12 + (dbb.getMonth() - da.getMonth());
}

/** Cari atau buat statement dengan periode EKSAK (deterministik, tanpa cutoff guessing).
 * R09.1: concurrency-safe — INSERT ditolak bila periode sudah ada (UNIQUE), lalu re-select.
 */
function resolveStatementByPeriod(
  db: DatabaseSync,
  groupId: string,
  creditCardId: string,
  periodStart: string,
  periodEnd: string,
  dueDate: string,
): string {
  const existing = db
    .prepare(
      `SELECT id FROM statements
       WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?`,
    )
    .get(groupId, creditCardId, periodStart, periodEnd) as { id: string } | undefined;
  if (existing) return existing.id;

  const stmtId = nid("st");
  try {
    db.prepare(
      `INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'open')`,
    ).run(sv(stmtId), sv(groupId), sv(creditCardId), sv(periodStart), sv(periodEnd), sv(dueDate));
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) {
      const again = db
        .prepare(
          `SELECT id FROM statements
           WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?`,
        )
        .get(groupId, creditCardId, periodStart, periodEnd) as { id: string } | undefined;
      if (again) return again.id;
    }
    throw e;
  }
  return stmtId;
}

interface InstRow {
  id: string;
  bill_id: string | null;
  total_amount: number;
  installment_amount: number;
  tenor: number;
  paid_count: number;
  paid_amount: number;
  start_date: string;
  credit_card_id: string;
  bill_statement_id: string | null;
}

/**
 * Materialisasi slice cicilan kartu kredit — ADDITIVE ONLY (R09.1).
 *
 * Prinsip: statement item adalah catatan historis yang IMMUTABLE setelah diposting.
 * Fungsi ini TIDAK pernah menghapus/mengubah item yang sudah ada; hanya INSERT
 * slice periode berjalan bila belum ada di statement siklusnya (cycle-gated).
 *
 * Dipanggil HANYA dari jalur WRITE (pembayaran statement, edit tanggal,
 * payoff, delete/recompute). GET tidak boleh memanggil fungsi ini.
 */
export function syncInstallmentSlices(db: DatabaseSync, groupId: string, installmentId?: string): void {
  const today = todayISO();
  const base = `
    SELECT i.id, i.bill_id, i.total_amount, i.installment_amount, i.tenor, i.paid_count, i.paid_amount,
           i.start_date, b.credit_card_id
    FROM installments i
    JOIN bills b ON b.id = i.bill_id
    WHERE b.credit_card_id IS NOT NULL AND b.group_id = ?`;
  const rows = (installmentId
    ? (db.prepare(base + ` AND i.id = ?`).all(groupId, installmentId) as unknown as InstRow[])
    : (db.prepare(base).all(groupId) as unknown as InstRow[]));

  for (const inst of rows) {
    const period = Number(inst.paid_count) + 1; // 1-based
    if (period > Number(inst.tenor)) continue; // selesai — biarkan item yang sudah settle

    const card = db
      .prepare("SELECT statement_day, due_day FROM credit_cards WHERE id = ? AND group_id = ?")
      .get(inst.credit_card_id, groupId) as { statement_day: number; due_day: number } | undefined;
    if (!card) continue;

    const baseCycle = calculateBillingCycle(inst.start_date, card.statement_day, card.due_day);
    const shift = period - 1;
    const shifted = shiftCycle(baseCycle, shift);
    const periodStart = shifted.periodStart;
    const periodEnd = shifted.periodEnd;
    const dueDate = shifted.dueDate;

    // Siklus belum mulai → jangan materialisasi lebih awal (slice akan muncul sebagai derived).
    if (periodStart > today) continue;

    const purchaseTx = db
      .prepare(
        `SELECT id FROM transactions
         WHERE installment_id = ? AND group_id = ? AND type = 'expense'
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get(inst.id, groupId) as { id: string } | undefined;
    if (!purchaseTx) continue;

    const stmtId = resolveStatementByPeriod(db, groupId, inst.credit_card_id, periodStart, periodEnd, dueDate);

    const remainingAfterPaid = Number(inst.total_amount) - Number(inst.paid_count) * Number(inst.installment_amount) - Number(inst.paid_amount);
    const slice = Math.max(0, Math.min(Number(inst.installment_amount), remainingAfterPaid));
    if (slice <= 0) continue;

    // IMMUTABLE: item yang sudah ada TIDAK diubah. Hanya INSERT bila belum ada.
    const existing = db
      .prepare(
        `SELECT 1 FROM credit_card_statement_items WHERE statement_id = ? AND transaction_id = ?`,
      )
      .get(stmtId, purchaseTx.id);
    if (existing) continue;

    db.prepare(
      `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
       VALUES (?, ?, ?, ?, ?, 'installment', 'Cicilan', datetime('now'))`,
    ).run(sv(nid("csi")), sv(groupId), sv(stmtId), sv(purchaseTx.id), sv(slice));
  }
}

/** Deskripsi satu slice cicilan (historis tersimpan atau derived periode berjalan). */
export interface InstallmentSliceInfo {
  installmentId: string;
  period: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
}

/**
 * Hitung siklus ekspektasi periode berjalan (paid_count + 1) dari sebuah cicilan.
 * Murni komputasi — tidak membaca/menulis statement.
 */
function expectedCycleForInstallment(
  db: DatabaseSync,
  groupId: string,
  inst: { id: string; start_date: string; credit_card_id: string; paid_count: number; tenor: number },
): { period: number; periodStart: string; periodEnd: string; dueDate: string } | null {
  const period = Number(inst.paid_count) + 1;
  if (period > Number(inst.tenor)) return null;

  const card = db
    .prepare("SELECT statement_day, due_day FROM credit_cards WHERE id = ? AND group_id = ?")
    .get(inst.credit_card_id, groupId) as { statement_day: number; due_day: number } | undefined;
  if (!card) return null;

  const baseCycle = calculateBillingCycle(inst.start_date, card.statement_day, card.due_day);
  const shift = period - 1;
  const shifted = shiftCycle(baseCycle, shift);
  return {
    period,
    periodStart: shifted.periodStart,
    periodEnd: shifted.periodEnd,
    dueDate: shifted.dueDate,
  };
}

/**
 * Slice DERIVED periode berjalan untuk sebuah statement.
 *
 * R09.1: GET read-only — item periode berjalan yang belum dimaterialisasi (belum ada
 * write event saat siklusnya mulai) dihitung DERIVED, tidak ditulis ke DB.
 * Sebuah instalment hanya di-derive bila:
 * - siklus periode berjalannya == periode statement ini
 * - siklus sudah mulai (period_start <= hari ini)
 * - belum ada item tersimpan untuk instalment ini pada statement ini (hindari double count)
 */
export function getDerivedSlicesForStatement(db: DatabaseSync, groupId: string, statementId: string): InstallmentSliceInfo[] {
  const stmt = db
    .prepare("SELECT period_start, period_end, credit_card_id FROM statements WHERE id = ? AND group_id = ?")
    .get(statementId, groupId) as { period_start: string; period_end: string; credit_card_id: string } | undefined;
  if (!stmt) return [];

  const rows = db
    .prepare(
      `SELECT i.id, i.total_amount, i.installment_amount, i.paid_count, i.paid_amount, i.start_date,
              b.credit_card_id
       FROM installments i
       JOIN bills b ON b.id = i.bill_id
       WHERE b.credit_card_id IS NOT NULL AND b.group_id = ? AND b.credit_card_id = ?
         AND i.paid_count < i.tenor`,
    )
    .all(groupId, stmt.credit_card_id) as unknown as InstRow[];

  const out: InstallmentSliceInfo[] = [];
  const today = todayISO();

  for (const inst of rows) {
    const expected = expectedCycleForInstallment(db, groupId, inst);
    if (!expected) continue;
    if (expected.periodStart !== String(stmt.period_start) || expected.periodEnd !== String(stmt.period_end)) continue;
    if (expected.periodStart > today) continue;

    // Sudah ada item tersimpan untuk instalment ini di statement ini (item_type apapun —
    // termasuk item full-principal legacy) → bukan derived (hindari double count).
    const hasStored = db
      .prepare(
        `SELECT 1 FROM credit_card_statement_items csi
         JOIN transactions t ON t.id = csi.transaction_id
         WHERE t.installment_id = ? AND csi.statement_id = ?
         LIMIT 1`,
      )
      .get(inst.id, statementId);
    if (hasStored) continue;

    const remaining = Number(inst.total_amount) - Number(inst.paid_count) * Number(inst.installment_amount) - Number(inst.paid_amount);
    const slice = Math.max(0, Math.min(Number(inst.installment_amount), remaining));
    if (slice <= 0) continue;

    out.push({
      installmentId: inst.id,
      period: expected.period,
      periodStart: expected.periodStart,
      periodEnd: expected.periodEnd,
      dueDate: expected.dueDate,
      amount: slice,
    });
  }
  return out;
}

/**
 * Statement yang menampung slice periode berjalan sebuah cicilan kartu kredit.
 * (Resolve bila belum ada — dipanggil dari jalur WRITE payment.) Return null bila
 * periode berjalan belum mulai (tidak ada kewajiban yang bisa dibayar).
 */
export function getInstallmentCurrentStatement(db: DatabaseSync, groupId: string, installmentId: string): string | null {
  const inst = db
    .prepare("SELECT * FROM installments WHERE id = ? AND group_id = ?")
    .get(installmentId, groupId) as
    | { id: string; start_date: string; credit_card_id?: never; paid_count: number; tenor: number }
    | undefined;
  if (!inst) return null;

  const bill = db
    .prepare("SELECT credit_card_id FROM bills WHERE id = ? AND group_id = ? AND credit_card_id IS NOT NULL")
    .get((db.prepare("SELECT bill_id FROM installments WHERE id = ? AND group_id = ?").get(installmentId, groupId) as { bill_id: string }).bill_id, groupId) as
    | { credit_card_id: string }
    | undefined;
  if (!bill) return null;

  const expected = expectedCycleForInstallment(db, groupId, {
    id: inst.id,
    start_date: inst.start_date,
    credit_card_id: bill.credit_card_id,
    paid_count: inst.paid_count,
    tenor: inst.tenor,
  });
  if (!expected) return null;
  if (expected.periodStart > todayISO()) return null;

  return resolveStatementByPeriod(db, groupId, bill.credit_card_id, expected.periodStart, expected.periodEnd, expected.dueDate);
}

/** Ambil item statement untuk cicilan tertentu beserta paid statement. */
interface InstSliceItem {
  id: string;
  amount: number;
  statement_id: string;
  stmt_paid: number;
}

function getInstallmentSliceItems(db: DatabaseSync, groupId: string, installmentId: string): InstSliceItem[] {
  return db
    .prepare(
      `SELECT csi.id, csi.amount, csi.statement_id, s.paid_amount AS stmt_paid
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE csi.group_id = ? AND t.installment_id = ? AND csi.item_type = 'installment'`,
    )
    .all(groupId, installmentId) as unknown as InstSliceItem[];
}

/**
 * Proses penyelesaian periode cicilan setelah pembayaran statement.
 *
 * R09.1 atribusi pembayaran (MVP + refinement):
 * 1. Pembayaran yang DITANDAI installment_id (via "Bayar Cicilan") di-attribusi EKSAK
 *    ke slice cicilan tersebut.
 * 2. Sisa pembayaran statement (tidak bertanda) dialokasikan FIFO ke item-item cicilan
 *    yang belum lunas pada statement yang sama.
 * 3. Periode selesai bila porsi yang ter-attribusi ke slice >= amount slice.
 * Ledger statement (paid_amount/remaining) selalu eksak; atribusi hanya mempengaruhi
 * waktu kemajuan paid_count dan display parsial.
 */
function completeInstallmentPeriods(db: DatabaseSync, groupId: string, statementId: string): string[] {
  const calc = getStatementCalc(db, statementId);
  if (!calc) return [];
  const stmtPaid = calc.paidAmount;

  const items = db
    .prepare(
      `SELECT csi.id, csi.amount AS item_amount, t.installment_id AS installment_id
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       WHERE csi.statement_id = ? AND csi.group_id = ? AND csi.item_type = 'installment'
         AND t.installment_id IS NOT NULL
         AND csi.paid_by_transaction_id IS NULL
       ORDER BY csi.created_at ASC`,
    )
    .all(statementId, groupId) as { id: string; item_amount: number; installment_id: string }[];

  if (items.length === 0) return [];

  // (1) pembayaran bertanda per installment
  const tagged: Record<string, number> = {};
  let totalTagged = 0;
  for (const it of items) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE statement_id = ? AND group_id = ? AND type = 'transfer'
           AND transfer_type = 'credit_card_payment' AND installment_id = ?`,
      )
      .get(statementId, groupId, it.installment_id) as { total: number };
    const t = Number(row.total ?? 0);
    tagged[it.id] = t;
    totalTagged += t;
  }

  // (2) pool pembayaran tak bertanda → FIFO
  let untaggedPool = Math.max(0, stmtPaid - totalTagged);
  const allocated: Record<string, number> = {};
  for (const it of items) {
    let toward = tagged[it.id] ?? 0;
    const need = Number(it.item_amount) - toward;
    const fromPool = Math.min(Math.max(0, need), untaggedPool);
    toward += fromPool;
    untaggedPool -= fromPool;
    allocated[it.id] = toward;
  }

  const completed: string[] = [];
  for (const it of items) {
    const inst = db
      .prepare(
        `SELECT id, installment_amount, paid_count, tenor, paid_amount, total_amount, start_date
         FROM installments WHERE id = ? AND group_id = ?`,
      )
      .get(it.installment_id, groupId) as
      | { id: string; installment_amount: number; paid_count: number; tenor: number; paid_amount: number; total_amount: number; start_date: string }
      | undefined;
    if (!inst || Number(inst.paid_count) >= Number(inst.tenor)) continue;

    const slice = Number(inst.installment_amount ?? 0);
    // Item payoff (amount > slice) bukan slice reguler — tidak diselesaikan via periode.
    if (Number(it.item_amount) > slice) continue;

    // HANYA periode berjalan (paid_count + 1) yang boleh diselesaikan dari statement ini.
    // Item slice periode lampau yang settle TIDAK boleh memicu paid_count naik lagi.
    const card = db
      .prepare("SELECT statement_day, due_day FROM credit_cards WHERE id = ? AND group_id = ?")
      .get(calc.creditCardId, groupId) as { statement_day: number; due_day: number } | undefined;
    if (!card) continue;
    const baseCycle = calculateBillingCycle(inst.start_date, card.statement_day, card.due_day);
    const itemPeriod = monthsBetweenISO(baseCycle.periodEnd, calc.periodEnd) + 1;
    if (itemPeriod !== Number(inst.paid_count) + 1) continue;

    const paidToward = Math.min(Number(it.item_amount), allocated[it.id] ?? 0);
    if (paidToward >= Number(it.item_amount)) {
      const newCount = Math.min(Number(inst.tenor), Number(inst.paid_count) + 1);
      db.prepare("UPDATE installments SET paid_count = ?, paid_amount = 0 WHERE id = ? AND group_id = ?")
        .run(sv(newCount), sv(inst.id), sv(groupId));
      completed.push(inst.id);
      syncInstallmentSlices(db, groupId, inst.id);
    } else {
      // Parsial dalam periode — refleksikan porsi yang ter-attribusi.
      db.prepare("UPDATE installments SET paid_amount = ? WHERE id = ? AND group_id = ?")
        .run(sv(paidToward), sv(inst.id), sv(groupId));
    }
  }
  return completed;
}

/**
 * SATU-SATUNYA mesin pembayaran statement kartu kredit (dipakai oleh
 * /api/credit-card-statements/:id/pay dan /api/bills/:id/pay untuk bill statement).
 * - wallet menurun (type=transfer, transfer_type=credit_card_payment)
 * - liabilities kartu menurun (statements.paid_amount naik, cap pada amount efektif)
 * - TIDAK membuat expense kedua
 * - menyelesaikan periode cicilan bila slice pada statement terbayar penuh
 */
export interface PayStatementOptions {
  billId?: string | null;
  installmentId?: string | null;
  method?: string | null;
}

export interface PayStatementResult {
  id: string;
  paid: number;
  completedInstallments: string[];
}

export function payStatement(
  db: DatabaseSync,
  groupId: string,
  statementId: string,
  amount: number,
  walletId: string,
  profileId: string,
  opts?: PayStatementOptions,
): PayStatementResult {
  const calc = getStatementCalc(db, statementId);
  if (!calc || calc.groupId !== groupId) {
    throw new DomainError("Statement kartu kredit tidak ditemukan", 404);
  }

  const payAmount = Math.min(amount, calc.remainingAmount);
  if (payAmount <= 0) {
    throw new DomainError("Nominal pembayaran tidak valid atau statement sudah lunas", 400);
  }

  // Bill tipe credit_card_statement yang terhubung statement ini (untuk sinkronisasi paid_amount).
  const bill =
    opts?.billId && opts.billId !== null
      ? (db
          .prepare("SELECT id, type, amount FROM bills WHERE id = ? AND group_id = ? AND is_active = 1")
          .get(opts.billId, groupId) as { id: string; type: string; amount: number } | undefined)
      : (db
          .prepare(
            "SELECT id, type, amount FROM bills WHERE statement_id = ? AND group_id = ? AND is_active = 1 LIMIT 1",
          )
          .get(statementId, groupId) as { id: string; type: string; amount: number } | undefined);

  const txId = nid("t");
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO transactions (id, group_id, type, transfer_type, source, amount, category_id, wallet_id, payment_method, credit_card_id, statement_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
       VALUES (?, ?, 'transfer', 'credit_card_payment', 'manual', ?, 'c-lain', ?, ?, ?, ?, ?, 'Kartu Kredit', 'Bayar tagihan kartu kredit', ?, ?, ?, ?, NULL, '[]', ?)`,
    ).run(
      sv(txId),
      sv(groupId),
      sv(payAmount),
      sv(walletId),
      sv(opts?.method ?? "Debit Card"),
      sv(calc.creditCardId),
      sv(statementId),
      sv(todayISO()),
      sv(profileId),
      sv(profileId),
      sv(opts?.billId && opts.billId !== null ? opts.billId : (bill?.id ?? null)),
      sv(opts?.installmentId ?? null),
      now,
    );

    db.prepare(
      "UPDATE statements SET paid_amount = MIN(?, paid_amount + ?) WHERE id = ? AND group_id = ?",
    ).run(sv(calc.statementAmount), sv(payAmount), sv(statementId), sv(groupId));

    if (bill && bill.type === "credit_card_statement") {
      db.prepare("UPDATE bills SET paid_amount = MIN(amount, paid_amount + ?) WHERE id = ? AND group_id = ?")
        .run(sv(payAmount), sv(bill.id), sv(groupId));
    }

    // R09.1: pembayaran adalah write event — materialisasi slice derived (additive,
    // cycle-gated) agar periode berjalan yang belum tersimpan tetap bisa diselesaikan.
    syncInstallmentSlices(db, groupId);

    const completed = completeInstallmentPeriods(db, groupId, statementId);

    db.exec("COMMIT");
    return { id: txId, paid: payAmount, completedInstallments: completed };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Pelunasan awal cicilan kartu kredit ("Lunasi Sisa Cicilan").
 * Model R09:
 * - Sisa kewajiban (total - sudah dibayar) diposting SEKALI ke statement siklus hari ini
 *   (item type installment, amount = sisa) — menggantikan slice berjalan yang lama.
 * - Settlement dibuat sebagai transfer/credit_card_payment: wallet menurun,
 *   liabilities CC menurun, TANPA expense kedua.
 * - Schedule selesai: paid_count = tenor.
 * Tidak ada penggandaan: item slice lama dihapus, item payoff adalah satu-satunya wakil kewajiban.
 */
export function payoffInstallmentCc(
  db: DatabaseSync,
  groupId: string,
  installmentId: string,
  walletId: string,
  profileId: string,
): { id: string; paid: number } {
  const inst = db
    .prepare("SELECT * FROM installments WHERE id = ? AND group_id = ?")
    .get(installmentId, groupId) as
    | { id: string; bill_id: string | null; total_amount: number; installment_amount: number; tenor: number; paid_count: number; paid_amount: number }
    | undefined;
  if (!inst) throw new DomainError("Cicilan tidak ditemukan", 404);

  const bill = db
    .prepare("SELECT * FROM bills WHERE id = ? AND group_id = ? AND credit_card_id IS NOT NULL")
    .get(inst.bill_id, groupId) as Record<string, unknown> | undefined;
  if (!bill) throw new DomainError("Cicilan tidak terhubung ke kartu kredit", 400);

  if (Number(inst.paid_count) >= Number(inst.tenor)) {
    throw new DomainError("Cicilan sudah lunas", 400);
  }

  const remaining = Math.max(
    0,
    Number(inst.total_amount) - Number(inst.paid_count) * Number(inst.installment_amount) - Number(inst.paid_amount),
  );
  if (remaining <= 0) throw new DomainError("Sisa cicilan sudah 0", 400);

  const creditCardId = String(bill.credit_card_id);

  const txId = nid("t");
  const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
      // R09.2: item statement yang belum settle (in-arrears dan periode berjalan) TIDAK
      // dihapus — ditandai subsumed (paid_by_transaction_id = settlement payoff).
      // Item SETTLE (statement.paid_amount >= item.amount) tidak pernah disentuh.
      db.prepare(
        `UPDATE credit_card_statement_items
         SET paid_by_transaction_id = ?
         WHERE transaction_id IN (SELECT id FROM transactions WHERE installment_id = ? AND group_id = ?)
           AND paid_by_transaction_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM statements s
             WHERE s.id = credit_card_statement_items.statement_id
               AND s.paid_amount >= credit_card_statement_items.amount
           )`,
      ).run(sv(txId), sv(installmentId), sv(groupId));

      // Item payoff di-anchorkan ke transaksi SETTLEMENT (bukan pembelian) agar tidak
      // konflik UNIQUE(statement_id, transaction_id) dengan slice historis yang sudah
      // settle pada statement target yang sama.
      const target = resolveOrCreateStatement(db, groupId, creditCardId, todayISO());

      // Settlement terlebih dahulu (item payoff mereferensikan transaksi ini via FK).
      db.prepare(
        `INSERT INTO transactions (id, group_id, type, transfer_type, source, amount, category_id, wallet_id, payment_method, credit_card_id, statement_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
         VALUES (?, ?, 'transfer', 'credit_card_payment', 'manual', ?, 'c-lain', ?, 'Debit Card', ?, ?, ?, 'Kartu Kredit', 'Lunasi sisa cicilan', ?, ?, ?, ?, NULL, '[]', ?)`,
      ).run(
        sv(txId),
        sv(groupId),
        sv(remaining),
        sv(walletId),
        sv(creditCardId),
        sv(target),
        sv(todayISO()),
        sv(bill.owner_profile_id as string | null ?? profileId),
        sv(profileId),
        sv(bill.id),
        sv(installmentId),
        now,
      );

      db.prepare(
        `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
         VALUES (?, ?, ?, ?, ?, 'installment', ?, ?)`,
      ).run(sv(nid("csi")), sv(groupId), sv(target), sv(txId), sv(remaining), sv(String(bill.title ?? "Cicilan")), now);

    // Paid_amount target: efektif setelah item payoff ditambahkan.
    const eff = getStatementCalc(db, target);
    db.prepare(
      "UPDATE statements SET paid_amount = MIN(?, paid_amount + ?) WHERE id = ? AND group_id = ?",
    ).run(sv(eff ? eff.statementAmount : remaining), sv(remaining), sv(target), sv(groupId));

    db.prepare("UPDATE bills SET paid_amount = amount WHERE id = ? AND group_id = ?").run(sv(bill.id), sv(groupId));
    db.prepare("UPDATE installments SET paid_count = tenor, paid_amount = 0 WHERE id = ? AND group_id = ?")
      .run(sv(inst.id), sv(groupId));

    db.exec("COMMIT");
    return { id: txId, paid: remaining };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Hitung ulang progress cicilan kartu kredit dari data statement (dipakai saat reversal
 * penghapusan pembayaran). Deterministik:
 * - paid_count = jumlah slice reguler (amount <= installment_amount) yang statement-nya
 *   sudah dibayar >= amount slice.
 * - Item payoff (amount > installment_amount) yang belum terbayar dihapus; yang terbayar
 *   menandakan cicilan selesai.
 */
export function recomputeInstallmentFromStatements(db: DatabaseSync, groupId: string, installmentId: string): void {
  const inst = db
    .prepare("SELECT id, installment_amount, tenor FROM installments WHERE id = ? AND group_id = ?")
    .get(installmentId, groupId) as { id: string; installment_amount: number; tenor: number } | undefined;
  if (!inst) return;

  const items = getInstallmentSliceItems(db, groupId, installmentId);
  const slice = Number(inst.installment_amount ?? 0);

  let completed = 0;
  let payoffCovered = false;
  let latestUncovered: InstSliceItem | null = null;

  for (const it of items) {
    const covered = Number(it.stmt_paid) >= Number(it.amount);
    if (it.amount > slice) {
      // item payoff
      if (covered) {
        payoffCovered = true;
      } else {
        db.prepare("DELETE FROM credit_card_statement_items WHERE id = ?").run(sv(it.id));
      }
    } else if (covered) {
      completed += 1;
    } else if (!latestUncovered || it.amount > latestUncovered.amount) {
      latestUncovered = it;
    }
  }

  const paidCount = payoffCovered ? Number(inst.tenor) : Math.min(Number(inst.tenor), completed);
  const partial = !payoffCovered && latestUncovered
    ? Math.min(Number(latestUncovered.stmt_paid), Number(latestUncovered.amount))
    : 0;

  db.prepare("UPDATE installments SET paid_count = ?, paid_amount = ? WHERE id = ? AND group_id = ?")
    .run(sv(paidCount), sv(partial), sv(installmentId), sv(groupId));

  syncInstallmentSlices(db, groupId, installmentId);
}
