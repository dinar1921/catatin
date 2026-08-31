import type { DatabaseSync } from "node:sqlite";
import { getStatementCalc } from "./statement-domain.js";

export interface UnifiedBillItem {
  id: string;
  domainType: "regular" | "recurring" | "installment" | "debt" | "receivable" | "credit_card_statement";
  sourceType: "bills" | "statements" | "installments";
  sourceId: string;
  title: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string | null;
  dueDay: number | null;
  status: string;
  ownerProfileId: string | null;
  categoryId: string | null;
  walletId: string | null;
  creditCardId: string | null;
  statementId: string | null;
  metadata: Record<string, unknown>;
}

export interface UnifiedBillSummary {
  totalUnpaid: number;
  dueTodayCount: number;
  overdueCount: number;
  upcomingCount: number;
}

export interface UnifiedBillsResponse {
  summary: UnifiedBillSummary;
  items: UnifiedBillItem[];
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Hitung tanggal jatuh tempo spesifik dalam bulan berjalan dari `dueDay` (misal dueDay=25 -> YYYY-MM-25).
 * Memperhitungkan jumlah hari dalam bulan (misal tgl 31 di bulan Februari -> 28/29).
 */
export function getDueDateForMonth(dueDay: number | null | undefined, yearMonth?: string): string | null {
  if (dueDay == null) return null;
  const d = yearMonth ? new Date(yearMonth + "-01T00:00:00") : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const actualDay = Math.min(Math.max(1, dueDay), dim);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
}

/**
 * Derivasi status deterministik untuk Regular Bill.
 */
function deriveRegularStatus(amount: number, paidAmount: number, dueDate: string | null, today: string): string {
  if (paidAmount >= amount && amount > 0) return "paid";
  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "overdue";
  return "upcoming";
}

/**
 * Derivasi status deterministik untuk Recurring Bill.
 */
function deriveRecurringStatus(
  amount: number,
  paidAmount: number,
  lastPaidPeriod: string | null,
  dueDay: number | null,
  today: string,
): { status: string; computedDueDate: string | null } {
  const currentMonth = monthKey(today);
  if (lastPaidPeriod === currentMonth) {
    return { status: "paid", computedDueDate: getDueDateForMonth(dueDay) };
  }
  const computedDueDate = getDueDateForMonth(dueDay);
  if (!computedDueDate) return { status: "upcoming", computedDueDate: null };

  if (computedDueDate === today) return { status: "due_today", computedDueDate };
  if (computedDueDate < today) return { status: "overdue", computedDueDate };
  return { status: "upcoming", computedDueDate };
}

/**
 * Derivasi status deterministik untuk Installment.
 */
function deriveInstallmentStatus(
  paidCount: number,
  tenor: number,
  paidAmount: number,
  installmentAmount: number,
  startDate: string,
  dueDay: number | null,
  today: string,
): { status: string; computedDueDate: string | null } {
  if (paidCount >= tenor) {
    return { status: "completed", computedDueDate: null };
  }
  const computedDueDate = getDueDateForMonth(dueDay);
  if (startDate > today) {
    return { status: "not_started", computedDueDate };
  }
  if (paidAmount > 0 && paidAmount < installmentAmount) {
    return { status: "partial", computedDueDate };
  }
  if (computedDueDate) {
    if (computedDueDate === today) return { status: "due_today", computedDueDate };
    if (computedDueDate < today) return { status: "overdue", computedDueDate };
  }
  return { status: "upcoming", computedDueDate };
}

/**
 * Derivasi status deterministik untuk Debt & Receivable.
 */
function deriveDebtStatus(amount: number, paidAmount: number, dueDate: string | null, today: string): string {
  const remaining = Math.max(0, amount - paidAmount);
  if (remaining === 0) return "paid_off";
  if (paidAmount > 0) return "partial";
  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "overdue";
  return "upcoming";
}

/**
 * Layanan Agregasi Utama Unified Tagihan (Phase 1 & 2).
 * Membaca dari tabel normalized (`bills`, `installments`, `statements`, `credit_cards`)
 * dan mengembalikan item `UnifiedBillItem[]` yang sudah di-normalkan.
 */
export function getUnifiedBills(
  db: DatabaseSync,
  groupId: string,
  filter?: {
    type?: string;
    status?: string;
    profileId?: string;
    from?: string;
    to?: string;
    q?: string;
  },
): UnifiedBillsResponse {
  const today = todayISO();
  // R09.1: GET read-only — slice periode berjalan dihitung DERIVED (bukan dimaterialisasi).

  const rawBills = db
    .prepare("SELECT * FROM bills WHERE group_id = ? AND is_active = 1 ORDER BY due_day ASC, id ASC")
    .all(groupId) as Record<string, unknown>[];

  const items: UnifiedBillItem[] = [];

  for (const b of rawBills) {
    const id = String(b.id);
    const type = String(b.type);
    const title = String(b.title ?? "Tagihan");
    const amount = Number(b.amount ?? 0);
    const paidAmount = Number(b.paid_amount ?? 0);
    const ownerProfileId = (b.owner_profile_id as string | null) ?? null;
    const categoryId = (b.category_id as string | null) ?? null;
    const walletId = (b.wallet_id as string | null) ?? null;
    const creditCardId = (b.credit_card_id as string | null) ?? null;
    const statementId = (b.statement_id as string | null) ?? null;
    const dueDay = b.due_day != null ? Number(b.due_day) : null;
    const dueDateRaw = (b.due_date as string | null) ?? null;
    const notes = String(b.notes ?? "");

    if (type === "regular") {
      const remainingAmount = Math.max(0, amount - paidAmount);
      const status = deriveRegularStatus(amount, paidAmount, dueDateRaw, today);
      items.push({
        id,
        domainType: "regular",
        sourceType: "bills",
        sourceId: id,
        title,
        amount,
        paidAmount,
        remainingAmount,
        dueDate: dueDateRaw,
        dueDay,
        status,
        ownerProfileId,
        categoryId,
        walletId,
        creditCardId,
        statementId,
        metadata: { notes },
      });
    } else if (type === "recurring") {
      const lastPaidPeriod = (b.last_paid_period as string | null) ?? null;
      const { status, computedDueDate } = deriveRecurringStatus(amount, paidAmount, lastPaidPeriod, dueDay, today);
      const remainingAmount = status === "paid" ? 0 : amount;
      items.push({
        id,
        domainType: "recurring",
        sourceType: "bills",
        sourceId: id,
        title,
        amount,
        paidAmount: status === "paid" ? amount : 0,
        remainingAmount,
        dueDate: computedDueDate,
        dueDay,
        status,
        ownerProfileId,
        categoryId,
        walletId,
        creditCardId,
        statementId,
        metadata: {
          frequency: (b.frequency as string | null) ?? "bulanan",
          lastPaidPeriod,
          notes,
        },
      });
    } else if (type === "installment") {
      const instRow = db
        .prepare("SELECT * FROM installments WHERE bill_id = ? AND group_id = ?")
        .get(id, groupId) as Record<string, unknown> | undefined;

      const tenor = instRow ? Number(instRow.tenor ?? 1) : 1;
      const paidCount = instRow ? Number(instRow.paid_count ?? 0) : 0;
      const instPaidAmount = instRow ? Number(instRow.paid_amount ?? 0) : 0;
      const installmentAmount = instRow ? Number(instRow.installment_amount ?? amount) : amount;
      const startDate = instRow ? String(instRow.start_date ?? today) : today;
      const instTitle = instRow ? String(instRow.title ?? title) : title;

      const { status, computedDueDate } = deriveInstallmentStatus(
        paidCount,
        tenor,
        instPaidAmount,
        installmentAmount,
        startDate,
        dueDay,
        today,
      );

      const remainingAmount = Math.max(0, amount - (paidCount * installmentAmount + instPaidAmount));

      // R09: cicilan kartu kredit — jadwal vs kewajiban terpisah.
      // Sisa periode berjalan diwakili oleh statement kartu kredit (payable),
      // sehingga remainingAmount di sini TIDAK dijumlahkan dua kali di summary.
      // Item cicilan tetap tampil sebagai progress/schedule (metadata + display).
      const fundedByCc = Boolean(creditCardId);

      items.push({
        id,
        domainType: "installment",
        sourceType: "bills",
        sourceId: id,
        title: instTitle,
        amount: status === "completed" ? 0 : installmentAmount,
        paidAmount: instPaidAmount,
        remainingAmount: fundedByCc ? 0 : status === "completed" ? 0 : Math.max(0, installmentAmount - instPaidAmount),
        dueDate: computedDueDate,
        dueDay,
        status,
        ownerProfileId,
        categoryId,
        walletId,
        creditCardId,
        statementId,
        metadata: {
          installmentId: instRow ? String(instRow.id) : null,
          totalAmount: amount,
          installmentAmount,
          tenor,
          paidCount,
          paidAmount: instPaidAmount,
          remainingTotalLiability: remainingAmount,
          progressText: `${paidCount}/${tenor} Bulan`,
          fundedByCc,
          notes,
        },
      });
    } else if (type === "debt" || type === "receivable") {
      const remainingAmount = Math.max(0, amount - paidAmount);
      const status = deriveDebtStatus(amount, paidAmount, dueDateRaw, today);
      items.push({
        id,
        domainType: type as "debt" | "receivable",
        sourceType: "bills",
        sourceId: id,
        title,
        amount,
        paidAmount,
        remainingAmount,
        dueDate: dueDateRaw,
        dueDay,
        status,
        ownerProfileId,
        categoryId,
        walletId,
        creditCardId,
        statementId,
        metadata: {
          counterparty: (b.counterparty as string | null) ?? "",
          notes,
        },
      });
    } else if (type === "credit_card_statement") {
      let calc = statementId ? getStatementCalc(db, statementId) : null;

      // Bila statement_id belum ada pada bill, cari statement ber-status open/issued untuk kartu
      if (!calc && creditCardId) {
        const cands = db
          .prepare(
            "SELECT id FROM statements WHERE group_id = ? AND credit_card_id = ? AND status IN ('open','issued') ORDER BY period_end DESC LIMIT 1",
          )
          .get(groupId, creditCardId) as { id: string } | undefined;
        if (cands) calc = getStatementCalc(db, cands.id);
      }

      const cardRow = creditCardId
        ? (db.prepare("SELECT name, last_four FROM credit_cards WHERE id = ?").get(creditCardId) as { name: string; last_four: string } | undefined)
        : undefined;

      const stmtAmount = calc ? calc.statementAmount : amount;
      const stmtPaid = calc ? calc.paidAmount : paidAmount;
      const remainingAmount = calc ? calc.remainingAmount : Math.max(0, stmtAmount - stmtPaid);
      const dueDate = calc ? calc.dueDate : (dueDateRaw ?? getDueDateForMonth(dueDay));

      let presentationStatus = "upcoming";
      if (calc) {
        if (calc.status === "paid") presentationStatus = "paid";
        else if (calc.status === "overdue") presentationStatus = "overdue";
        else if (dueDate === today) presentationStatus = "due_today";
        else if (calc.status === "issued") presentationStatus = "upcoming";
        else presentationStatus = "open";
      }

      items.push({
        id,
        domainType: "credit_card_statement",
        sourceType: "bills",
        sourceId: id,
        title,
        amount: stmtAmount,
        paidAmount: stmtPaid,
        remainingAmount,
        dueDate,
        dueDay,
        status: presentationStatus,
        ownerProfileId,
        categoryId,
        walletId,
        creditCardId,
        statementId: calc ? calc.id : statementId,
        metadata: {
          cardName: cardRow ? cardRow.name : "Kartu Kredit",
          lastFour: cardRow ? cardRow.last_four : "",
          statementStatus: calc ? calc.status : "open",
          notes,
        },
      });
    }
  }

  // Tambahkan Statement Kartu Kredit yang belum dibuatkan record `bills`-nya (bila ada).
  // Catatan: bill cicilan kartu kredit kini punya statement_id (traceability R09) —
  // relasi itu TIDAK boleh menekan kemunculan statement sebagai item payable.
  const ccStatements = db
    .prepare(
      `SELECT s.id FROM statements s
       JOIN credit_cards cc ON cc.id = s.credit_card_id
       WHERE s.group_id = ? AND s.status IN ('open','issued','overdue')
         AND s.id NOT IN (
           SELECT statement_id FROM bills
           WHERE group_id = ? AND statement_id IS NOT NULL AND type = 'credit_card_statement'
         )`,
    )
    .all(groupId, groupId) as { id: string }[];

  for (const s of ccStatements) {
    const calc = getStatementCalc(db, s.id);
    if (!calc) continue;

    const cardRow = db.prepare("SELECT name, last_four, owner_profile_id FROM credit_cards WHERE id = ?").get(calc.creditCardId) as { name: string; last_four: string; owner_profile_id: string | null } | undefined;

    let presentationStatus = "upcoming";
    if (calc.status === "paid") presentationStatus = "paid";
    else if (calc.status === "overdue") presentationStatus = "overdue";
    else if (calc.dueDate === today) presentationStatus = "due_today";
    else if (calc.status === "issued") presentationStatus = "upcoming";
    else presentationStatus = "open";

    items.push({
      id: `stmt-bill-${calc.id}`,
      domainType: "credit_card_statement",
      sourceType: "statements",
      sourceId: calc.id,
      title: `Tagihan ${cardRow ? cardRow.name : "Kartu Kredit"}`,
      amount: calc.statementAmount,
      paidAmount: calc.paidAmount,
      remainingAmount: calc.remainingAmount,
      dueDate: calc.dueDate,
      dueDay: null,
      status: presentationStatus,
      ownerProfileId: cardRow ? cardRow.owner_profile_id : null,
      categoryId: "c-lain",
      walletId: null,
      creditCardId: calc.creditCardId,
      statementId: calc.id,
      metadata: {
        cardName: cardRow ? cardRow.name : "Kartu Kredit",
        lastFour: cardRow ? cardRow.last_four : "",
        statementStatus: calc.status,
      },
    });
  }

  // Filter hasil agregasi berdasarkan query parameter (tanpa mengubah derivasi status!)
  let filtered = items;

  if (filter?.type) {
    const t = filter.type.toLowerCase();
    filtered = filtered.filter((i) => i.domainType.toLowerCase() === t || (t === "hutang" && (i.domainType === "debt" || i.domainType === "receivable")));
  }

  if (filter?.status) {
    const s = filter.status.toLowerCase();
    filtered = filtered.filter((i) => i.status.toLowerCase() === s);
  }

  if (filter?.profileId && filter.profileId !== "all") {
    filtered = filtered.filter((i) => i.ownerProfileId === filter.profileId);
  }

  if (filter?.from) {
    filtered = filtered.filter((i) => !i.dueDate || i.dueDate >= filter.from!);
  }

  if (filter?.to) {
    filtered = filtered.filter((i) => !i.dueDate || i.dueDate <= filter.to!);
  }

  if (filter?.q) {
    const query = filter.q.toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(query) ||
        (i.metadata.counterparty as string | undefined)?.toLowerCase().includes(query) ||
        (i.metadata.cardName as string | undefined)?.toLowerCase().includes(query),
    );
  }

  // Hitung summary dari SELURUH items dalam group (bukan hanya yang ter-filter oleh tanggal)
  let totalUnpaid = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let upcomingCount = 0;

  for (const i of items) {
    if (i.status !== "paid" && i.status !== "completed" && i.status !== "paid_off" && i.status !== "cancelled") {
      totalUnpaid += i.remainingAmount;
    }
    if (i.status === "due_today") dueTodayCount++;
    else if (i.status === "overdue") overdueCount++;
    else if (i.status === "upcoming") upcomingCount++;
  }

  return {
    summary: {
      totalUnpaid,
      dueTodayCount,
      overdueCount,
      upcomingCount,
    },
    items: filtered,
  };
}
