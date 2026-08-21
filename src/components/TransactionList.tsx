import { useMemo, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react";
import type { AppData, Transaction } from "../lib/types";
import { categoryById, sumExpense, sumIncome, walletById } from "../lib/derive";
import { formatIDRSigned } from "../lib/format";
import { fmtDayMonth } from "../lib/dates";
import { cn } from "./ui";
import { CaretRight as CaretRightIcon } from "@phosphor-icons/react";

/**
 * TransactionList — date-grouped transaction feed (referensi "Menu Transaksi").
 *
 * Semua transaksi pada tanggal yang sama berada dalam SATU container putih.
 * Setiap tanggal: header (tanggal kiri + daily net kanan), lalu baris transaksi.
 *
 * TransactionList
 * ├── DateTransactionGroup
 * │   ├── DateHeader
 * │   └── TransactionRow
 * │       ├── DirectionIcon
 * │       ├── TransactionInfo
 * │       ├── TransactionAmount
 * │       └── TransactionChevron
 */
export function TransactionList({
  data,
  transactions,
  onSelect,
}: {
  data: AppData;
  /** Sudah terurut descending by occurredAt. */
  transactions: Transaction[];
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = t.occurredAt.slice(0, 10);
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return [...map.entries()];
  }, [transactions]);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([date, ts]) => (
        <DateTransactionGroup key={date} date={date} net={sumIncome(ts) - sumExpense(ts)}>
          {ts.map((t, i) => (
            <TransactionRow
              key={t.id}
              data={data}
              transaction={t}
              onSelect={onSelect}
              showDivider={i < ts.length - 1}
            />
          ))}
        </DateTransactionGroup>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DateTransactionGroup — satu card per tanggal                        */
/* ------------------------------------------------------------------ */
function DateTransactionGroup({
  date,
  net,
  children,
}: {
  date: string;
  net: number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <DateHeader date={date} net={net} />
      <div>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* DateHeader — tanggal kiri, daily net kanan                          */
/* ------------------------------------------------------------------ */
function DateHeader({ date, net }: { date: string; net: number }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
      <h2 className="text-sm font-semibold text-ink-secondary">{fmtDayMonth(date)}</h2>
      <p
        className={cn(
          "tnum text-xs font-semibold",
          net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-ink-muted dark:text-ink-faint",
        )}
      >
        {formatIDRSigned(net)}
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* TransactionRow                                                      */
/* ------------------------------------------------------------------ */
function TransactionRow({
  data,
  transaction: t,
  onSelect,
  showDivider,
}: {
  data: AppData;
  transaction: Transaction;
  onSelect: (id: string) => void;
  showDivider: boolean;
}) {
  const isExpense = t.type !== "income";
  const cat = categoryById(data, t.categoryId);
  const wallet = walletById(data, t.walletId);
  const metadata = [cat?.name, wallet?.name].filter(Boolean).join(" · ");

  return (
    <button
      onClick={() => onSelect(t.id)}
      aria-label={`${t.merchant}, ${metadata || "transaksi"}`}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
        showDivider && "border-t border-slate-100 dark:border-slate-800",
      )}
    >
      <DirectionIcon income={!isExpense} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {t.merchant}
        </span>
        {metadata && (
          <span className="mt-0.5 block truncate text-xs text-ink-muted">{metadata}</span>
        )}
      </span>
      <span className="ml-1 flex shrink-0 flex-col items-end gap-1">
        <span className={cn("tnum text-sm font-semibold", isExpense ? "text-ink" : "text-emerald-600 dark:text-emerald-400")}>
          {formatIDRSigned(isExpense ? -t.amount : t.amount)}
        </span>
        <span className="flex items-center gap-0.5 text-xs text-ink-faint">
          {fmtDayMonth(t.occurredAt)}
          <TransactionChevron />
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* DirectionIcon — arah uang: keluar (abu) / masuk (hijau)             */
/* ------------------------------------------------------------------ */
function DirectionIcon({ income }: { income: boolean }) {
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        income ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      )}
      aria-hidden="true"
    >
      {income ? <ArrowUpRight size={18} weight="bold" /> : <ArrowDownRight size={18} weight="bold" />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* TransactionChevron — penanda navigasi ke detail                     */
/* ------------------------------------------------------------------ */
function TransactionChevron() {
  return <CaretRightIcon size={14} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />;
}
