import type { AppData, Bill, BillStatus, Category, FilterState, Profile, Transaction, Wallet } from "./types";
import { monthKey, periodRange, todayISO, inRange } from "./dates";

/** Deteksi transaksi settlement kartu kredit (presentation layer; tidak mengubah semantik finansial). */
export function isCreditCardSettlement(t: { type: string; transferType?: string | null }): boolean {
  return t.type === "credit_card_settlement" || (t.type === "transfer" && t.transferType === "credit_card_payment");
}

export function walletBalance(data: AppData, walletId: string): number {
  let b = 0;
  for (const t of data.transactions) {
    if (t.walletId !== walletId) continue;
    if (t.type === "income") b += t.amount;
    else b -= t.amount; // expense & credit_card_settlement
  }
  return b;
}

export function totalBalance(data: AppData, profileId: string): number {
  return data.wallets
    .filter((w) => w.scope === "shared" || w.ownerProfileId === profileId || profileId === "all")
    .reduce((s, w) => s + walletBalance(data, w.id), 0);
}

export function walletVisible(data: AppData, profileId: string): Wallet[] {
  return data.wallets.filter(
    (w) => w.scope === "shared" || w.ownerProfileId === profileId || profileId === "all",
  );
}

export function filterTransactions(data: AppData, f: FilterState, profileId: string): Transaction[] {
  const { start, end } = periodRange(f.period);
  return data.transactions.filter((t) => {
    if (!inRange(t.occurredAt, start, end)) return false;
    if (profileId !== "all" && t.ownerProfileId !== profileId) return false;
    if (f.profileId !== "all" && t.ownerProfileId !== f.profileId) return false;
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.walletId && t.walletId !== f.walletId) return false;
    return true;
  });
}

export function sumIncome(ts: Transaction[]): number {
  return ts
    .filter((t) => t.type === "income" && t.source !== "opening_balance" && t.source !== "transfer_in")
    .reduce((s, t) => s + t.amount, 0);
}

export function sumExpense(ts: Transaction[]): number {
  return ts.filter((t) => t.type === "expense" && t.source !== "transfer_out").reduce((s, t) => s + t.amount, 0);
}

export function netCashflow(ts: Transaction[]): number {
  return sumIncome(ts) - sumExpense(ts);
}

export interface SpendingSlice {
  categoryId: string;
  name: string;
  total: number;
  count: number;
}

export function spendingByCategory(data: AppData, ts: Transaction[], limit = 5): SpendingSlice[] {
  const map = new Map<string, SpendingSlice>();
  for (const t of ts) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    const cat = categoryById(data, t.categoryId);
    const cur = map.get(t.categoryId) ?? {
      categoryId: t.categoryId,
      name: cat?.name ?? "Lainnya",
      total: 0,
      count: 0,
    };
    cur.total += t.amount;
    cur.count += 1;
    map.set(t.categoryId, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export function spendingByWallet(data: AppData, ts: Transaction[]): SpendingSlice[] {
  const map = new Map<string, SpendingSlice>();
  for (const t of ts) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    const w = data.wallets.find((x) => x.id === t.walletId);
    const cur = map.get(t.walletId) ?? {
      categoryId: t.walletId,
      name: w?.name ?? "Lainnya",
      total: 0,
      count: 0,
    };
    cur.total += t.amount;
    cur.count += 1;
    map.set(t.walletId, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function categoryById(data: AppData, id: string): Category | undefined {
  return data.categories.find((c) => c.id === id);
}

export function walletById(data: AppData, id: string): Wallet | undefined {
  return data.wallets.find((w) => w.id === id);
}

export function memberById(data: AppData, id: string): Profile | undefined {
  return data.members.find((m) => m.id === id);
}

export function incomeCats(data: AppData): Category[] {
  return data.categories.filter((c) => c.direction === "income" || c.direction === "both");
}

export function expenseCats(data: AppData): Category[] {
  return data.categories.filter((c) => c.direction === "expense" || c.direction === "both");
}

/** Status tagihan = derived (PRD §6.17): dihitung dari tanggal jatuh tempo + paidAmount. */
export function billStatus(bill: Bill): BillStatus {
  const today = todayISO();
  const paid = bill.paidAmount >= bill.amount - 1;
  if (paid) return "paid_off";

  const due = billDueISO(bill);
  if (due < today) return "overdue";
  if (due === today) return "due_today";
  return "unpaid";
}

export function billDueISO(bill: Bill): string {
  if (bill.dueDate) return bill.dueDate.slice(0, 10);
  if (bill.dueDay != null) {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    // jatuh tempo terdekat: bulan ini jika dueDay >= hari ini, else bulan depan
    let mm = m;
    if (bill.dueDay < now.getDate()) mm += 1;
    const yy = y + Math.floor(mm / 12);
    return `${yy}-${String((mm % 12) + 1).padStart(2, "0")}-${String(bill.dueDay).padStart(2, "0")}`;
  }
  return todayISO();
}

export function upcomingBills(data: AppData, profileId: string, limit = 4): Bill[] {
  return data.bills
    .filter((b) => b.isActive && (profileId === "all" || b.ownerProfileId === profileId))
    .filter((b) => billStatus(b) !== "paid_off") // hanya kewajiban yang masih berjalan
    .map((b) => ({ b, due: billDueISO(b) }))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, limit)
    .map((x) => x.b);
}

export function overdueBills(data: AppData, profileId: string): Bill[] {
  return data.bills.filter(
    (b) =>
      b.isActive &&
      (profileId === "all" || b.ownerProfileId === profileId) &&
      billStatus(b) === "overdue",
  );
}

export interface BudgetRow {
  budget: { id: string; categoryId: string; amount: number; ownerProfileId: string | null };
  name: string;
  spent: number;
  pct: number;
}

export function budgetRows(data: AppData, ts: Transaction[], profileId: string): BudgetRow[] {
  return data.budgets
    .filter((b) => profileId === "all" || b.ownerProfileId === null || b.ownerProfileId === profileId)
    .map((b) => {
      const spent = ts
        .filter((t) => t.type === "expense" && t.source !== "transfer_out" && t.categoryId === b.categoryId)
        .reduce((s, t) => s + t.amount, 0);
      const name = categoryById(data, b.categoryId)?.name ?? "Kategori";
      return { budget: b, name, spent, pct: b.amount > 0 ? (spent / b.amount) * 100 : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Runway heuristic — "uang cukup sampai kapan" (PRD §12.1). */
export function runway(data: AppData, profileId: string): { days: number; dailyAvg: number; monthlyAvg: number } {
  const end = todayISO();
  const start30 = periodRange({ preset: "7d", start: null, end: null }).start;
  void start30;
  // rata-rata pengeluaran harian 30 hari terakhir
  const t30 = data.transactions.filter((t) => {
    if (t.type !== "expense") return false;
    if (profileId !== "all" && t.ownerProfileId !== profileId) return false;
    const d = t.occurredAt.slice(0, 10);
    return d > addDays(end, -30) && d <= end;
  });
  const total = t30.reduce((s, t) => s + t.amount, 0);
  const dailyAvg = total / 30;
  const balance = totalBalance(data, profileId);
  const days = dailyAvg > 0 ? Math.floor(balance / dailyAvg) : 999;
  return { days, dailyAvg, monthlyAvg: dailyAvg * 30 };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

/** Selisih bulan antara dua kunci YYYY-MM (positif jika a > b). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (ay - by) * 12 + (am - bm);
}

export function monthSpendLastN(data: AppData, profileId: string, n: number): number {
  const thisKey = monthKey(todayISO());
  let total = 0;
  let count = 0;
  for (const t of data.transactions) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    if (profileId !== "all" && t.ownerProfileId !== profileId) continue;
    const diff = monthDiff(thisKey, monthKey(t.occurredAt));
    if (diff >= 1 && diff <= n) {
      total += t.amount;
      count += 1;
    }
  }
  return count > 0 ? total : 0;
}

export function monthSpendThis(data: AppData, profileId: string): number {
  const key = monthKey(todayISO());
  return data.transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.source !== "transfer_out" &&
        (profileId === "all" || t.ownerProfileId === profileId) &&
        monthKey(t.occurredAt) === key,
    )
    .reduce((s, t) => s + t.amount, 0);
}

export function monthIncomeThis(data: AppData, profileId: string): number {
  const key = monthKey(todayISO());
  return data.transactions
    .filter(
      (t) =>
        t.type === "income" &&
        t.source !== "opening_balance" &&
        t.source !== "transfer_in" &&
        (profileId === "all" || t.ownerProfileId === profileId) &&
        monthKey(t.occurredAt) === key,
    )
    .reduce((s, t) => s + t.amount, 0);
}
