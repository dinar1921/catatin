import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDots,
  CaretDown,
  CaretRight,
  ChartBar,
  FilePdf,
  FileXls,
  HandCoins,
  Lightbulb,
  ListChecks,
  Receipt,
  Repeat,
  Sparkle,
  Storefront,
  TrendDown,
  TrendUp,
  Wallet as WalletIcon,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import {
  budgetRows,
  billStatus,
  categoryById,
  filterTransactions,
  netCashflow,
  spendingByCategory,
  spendingByWallet,
  sumExpense,
  sumIncome,
  walletById,
} from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { fmtPeriodLabel, periodRange } from "../../lib/dates";
import { exportReport } from "../../lib/api";
import { Badge, Button, Card, CardHeader, ProgressBar, useToast } from "../../components/ui";
import { FilterChip, PageHeader, useFilter as useFilterCtx } from "../../components/layout";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";
import { billIcon, billMetaLine, billRowStatus } from "../bills/BillsPage";
import type { AppData, Bill, Transaction } from "../../lib/types";

export function ReportsPage() {
  const { data, activeProfileId } = useApp();
  const { filter, openFilter } = useFilterCtx();
  const toast = useToast();
  const [detailId, setDetailId] = useState<string | null>(null);

  const ts = useMemo(() => filterTransactions(data, filter, activeProfileId), [data, filter, activeProfileId]);

  const income = sumIncome(ts);
  const expense = sumExpense(ts);
  const net = netCashflow(ts);
  const expenseCount = ts.filter((t) => t.type === "expense").length;
  const avgExpense = expenseCount > 0 ? Math.round(expense / expenseCount) : 0;

  const byCat = spendingByCategory(data, ts, 6);
  const byWallet = spendingByWallet(data, ts);
  const maxCat = byCat[0]?.total ?? 1;
  const maxWallet = byWallet[0]?.total ?? 1;

  const merchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of ts) {
      if (t.type !== "expense") continue;
      const cur = map.get(t.merchant) ?? { total: 0, count: 0 };
      cur.total += t.amount;
      cur.count += 1;
      map.set(t.merchant, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  }, [ts]);

  const maxMerchant = merchants[0]?.[1].total ?? 1;

  const budgets = budgetRows(data, ts, activeProfileId).slice(0, 4);

  const activeBills = useMemo(
    () => data.bills.filter((b) => b.isActive && (activeProfileId === "all" || b.ownerProfileId === activeProfileId)),
    [data, activeProfileId],
  );

  const debts = activeBills.filter((b) => b.type === "debt");
  const receivables = activeBills.filter((b) => b.type === "receivable");
  const debtTotal = debts.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0);
  const receivableTotal = receivables.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0);

  const recent = useMemo(
    () => [...ts].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
    [ts],
  );

  const doExport = async (format: "pdf" | "xlsx") => {
    try {
      const { start, end } = periodRange(filter.period);
      const blob = await exportReport(format, { from: start, to: end, profileId: activeProfileId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catatin-laporan-${format === "pdf" ? "pdf" : "excel"}-${new Date().toISOString().slice(0, 10)}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.push("success", `Laporan ${format.toUpperCase()} diunduh`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal mengekspor laporan");
    }
  };

  const periodLabel = fmtPeriodLabel(filter.period);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageHeader
          title="Laporan"
          subtitle="Analisis detail cashflow keluarga"
          actions={
            <>
              <Button variant="secondary" onClick={() => void doExport("pdf")}>
                <FilePdf size={16} /> PDF
              </Button>
              <Button variant="secondary" onClick={() => void doExport("xlsx")}>
                <FileXls size={16} /> Excel
              </Button>
            </>
          }
        />
        <FilterChip filter={filter} onClick={openFilter} />
      </div>

      {/* KPI strip — hairline 2×2 → 4-across */}
      <Card padded={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="Pemasukan"
            value={formatIDR(income)}
            valueClass="text-emerald-600 dark:text-emerald-400"
            icon={<ArrowUpRight size={14} weight="duotone" />}
            chipClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            context={periodLabel}
          />
          <StatCell
            label="Pengeluaran"
            value={formatIDR(expense)}
            valueClass="text-rose-600 dark:text-rose-400"
            icon={<ArrowDownRight size={14} weight="duotone" />}
            chipClass="bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            context={`${expenseCount} transaksi`}
            divider="border-l"
          />
          <StatCell
            label="Arus kas bersih"
            value={formatIDR(net)}
            valueClass={net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            icon={net >= 0 ? <TrendUp size={14} weight="duotone" /> : <TrendDown size={14} weight="duotone" />}
            chipClass={
              net >= 0
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            }
            context={net >= 0 ? "Surplus" : "Defisit"}
            divider="border-t lg:border-l lg:border-t-0"
          />
          <StatCell
            label="Rata-rata pengeluaran"
            value={formatIDR(avgExpense)}
            valueClass="text-ink"
            icon={<Receipt size={14} weight="duotone" />}
            chipClass="bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
            context="per transaksi pengeluaran"
            divider="border-l border-t lg:border-t-0"
          />
        </div>
      </Card>

      {/* Insight AI */}
      <InsightCard expense={expense} topCat={byCat[0]} topBudget={budgets[0]} count={ts.length} />

      {/* Kategori + Dompet */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<ChartBar size={16} weight="duotone" />} title="Pengeluaran per Kategori" subtitle="Pengeluaran terbesar berdasarkan kategori." />
          {byCat.length === 0 ? (
            <EmptyNote text="Belum ada pengeluaran pada periode ini." />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {byCat.map((c) => (
                <li key={c.categoryId}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink-secondary">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum text-sm font-semibold text-ink">{formatIDR(c.total)}</span>
                      <span className="tnum w-9 text-right text-xs text-ink-faint">{Math.round((c.total / maxCat) * 100)}%</span>
                    </span>
                  </div>
                  <ProgressBar pct={(c.total / maxCat) * 100} tone="brand" className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={<WalletIcon size={16} weight="duotone" />} title="Pengeluaran per Dompet" subtitle="Pemakaian uang berdasarkan sumber wallet." />
          {byWallet.length === 0 ? (
            <EmptyNote text="Belum ada pengeluaran pada periode ini." />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {byWallet.map((w) => (
                <li key={w.categoryId}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink-secondary">{w.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum text-sm font-semibold text-ink">{formatIDR(w.total)}</span>
                      <span className="tnum w-9 text-right text-xs text-ink-faint">{Math.round((w.total / maxWallet) * 100)}%</span>
                    </span>
                  </div>
                  <ProgressBar pct={(w.total / maxWallet) * 100} tone="brand" className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Budget + Merchant */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<ChartBar size={16} weight="duotone" />} title="Perbandingan Budget" subtitle="Pemakaian budget per kategori pada periode ini." />
          {budgets.length === 0 ? (
            <EmptyNote text="Belum ada budget. Atur budget di halaman Budget." />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {budgets.map((b) => {
                const over = b.pct >= 100;
                const warn = b.pct >= 80 && !over;
                const tone = over ? "danger" : warn ? "warning" : "income";
                const barTone = over ? "expense" : warn ? "warn" : "income";
                const diff = Math.max(0, b.spent - b.budget.amount);
                return (
                  <li key={b.budget.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink-secondary">{b.name}</span>
                      <Badge variant={tone}>{Math.round(b.pct)}%</Badge>
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-ink-muted">
                      <span className="tnum">
                        {formatIDR(b.spent)} dari {formatIDR(b.budget.amount)}
                      </span>
                      <span>{over ? `lebih ${formatIDR(diff)}` : warn ? "mendekati batas" : "aman"}</span>
                    </div>
                    <ProgressBar pct={b.pct} tone={barTone} className="mt-1" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={<Storefront size={16} weight="duotone" />} title="Merchant Teratas" subtitle="Tempat pengeluaran terbanyak pada periode ini." />
          {merchants.length === 0 ? (
            <EmptyNote text="Belum ada merchant yang tercatat." />
          ) : (
            <ul className="flex flex-col gap-3">
              {merchants.map(([name, m]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-secondary">{name}</span>
                    <span className="text-xs text-ink-faint">{m.count} transaksi</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tnum text-sm font-semibold text-ink">{formatIDR(m.total)}</span>
                    <span className="tnum w-9 text-right text-xs text-ink-faint">{Math.round((m.total / maxMerchant) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Tagihan + Hutang */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BillsCard bills={activeBills} data={data} />
        <DebtsCard debts={debts} receivables={receivables} debtTotal={debtTotal} receivableTotal={receivableTotal} />
      </div>

      {/* Daftar transaksi */}
      <RecentTransactions transactions={recent} data={data} onSelect={setDetailId} />

      {/* Footer note */}
      <p className="flex items-center justify-center gap-1.5 py-2 text-xs text-ink-faint">
        <CalendarDots size={14} weight="duotone" /> Periode laporan: {periodLabel}
      </p>

      <TransactionDetailSheet transactionId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI cell                                                             */
/* ------------------------------------------------------------------ */
function StatCell({
  label,
  value,
  valueClass,
  icon,
  chipClass,
  context,
  divider,
}: {
  label: string;
  value: string;
  valueClass: string;
  icon: React.ReactNode;
  chipClass: string;
  context: string;
  divider?: string;
}) {
  return (
    <div className={`min-w-0 p-4 sm:p-5 ${divider ? `${divider} border-slate-100 dark:border-slate-800` : ""}`}>
      <div className="flex items-center gap-1.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${chipClass}`} aria-hidden="true">
          {icon}
        </span>
        <span className="truncate text-xs font-medium text-ink-muted">{label}</span>
      </div>
      <p className={`tnum mt-2 truncate text-xl font-bold tracking-tight sm:text-2xl ${valueClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-faint sm:text-xs">{context}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insight AI                                                           */
/* ------------------------------------------------------------------ */
function InsightCard({
  expense,
  topCat,
  topBudget,
  count,
}: {
  expense: number;
  topCat: { name: string; total: number } | undefined;
  topBudget: { name: string; pct: number } | undefined;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false} className="overflow-hidden border-brand-200/70 bg-gradient-to-b from-brand-50 to-white dark:border-brand-900 dark:from-brand-950 dark:to-slate-900">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden="true">
            <Sparkle size={15} weight="fill" />
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Insight AI</span>
        </div>
        <h2 className="mt-3 text-base font-bold text-ink">Rekap keuangan periode ini</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
          Pengeluaran periode ini <span className="tnum font-bold">{formatIDR(expense)}</span>
          {topCat ? (
            <>
              , dengan kategori terbesar <span className="font-bold">{topCat.name}</span> sebesar{" "}
              <span className="tnum font-bold">{formatIDR(topCat.total)}</span>
            </>
          ) : null}
          .
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-400"
        >
          <Lightbulb size={15} weight="duotone" /> Lihat penjelasan
          <CaretDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <dl className="mt-3 space-y-2.5 rounded-xl border border-brand-100 bg-white p-4 text-sm dark:border-brand-900 dark:bg-slate-900">
            <InsightItem dt="Jumlah transaksi" dd={`${count} transaksi tercatat pada periode ini.`} />
            <InsightItem dt="Total pengeluaran" dd={`${formatIDR(expense)} keluar pada periode ini.`} />
            {topCat && <InsightItem dt="Kategori terbesar" dd={`${topCat.name} menyumbang ${formatIDR(topCat.total)}.`} />}
            {topBudget && <InsightItem dt="Budget teratas" dd={`${topBudget.name} sudah terpakai ${Math.round(topBudget.pct)}%.`} />}
          </dl>
        )}
      </div>
      <div className="border-t border-brand-100 bg-white/70 px-5 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/70">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
          <ListChecks size={15} weight="duotone" className="text-brand-600" /> Rekomendasi
        </p>
        <p className="mt-1.5 text-sm font-semibold text-ink">
          Tinjau budget{topBudget ? ` "${topBudget.name}"` : " kategori"} bila pengeluaran terus berlanjut.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">Atur ulang alokasi budget agar cashflow tetap sehat.</p>
      </div>
    </Card>
  );
}

function InsightItem({ dt, dd }: { dt: string; dd: string }) {
  return (
    <div>
      <dt className="font-semibold text-ink-secondary">{dt}</dt>
      <dd className="mt-0.5 text-ink-muted">{dd}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bills / Debts                                                        */
/* ------------------------------------------------------------------ */
function BillsCard({ bills, data }: { bills: Bill[]; data: AppData }) {
  const list = bills.filter((b) => b.type === "recurring" || b.type === "installment").slice(0, 4);
  return (
    <Card>
      <CardHeader icon={<Repeat size={16} weight="duotone" />} title="Tagihan Berjalan" subtitle="Tagihan rutin dan cicilan aktif bulan ini." />
      {list.length === 0 ? (
        <EmptyNote text="Tagihan rutin dan cicilan aktif akan muncul di sini." />
      ) : (
        <ul className="-mx-4 -mb-4 divide-y divide-slate-100 sm:-mx-5 sm:-mb-5 dark:divide-slate-800">
          {list.map((b) => {
            const st = billStatus(b);
            const inst = data.installments.find((i) => i.billId === b.id);
            const remaining = Math.max(0, b.amount - b.paidAmount);
            const row = billRowStatus(st);
            return (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  {billIcon(b, 20)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{b.title}</span>
                    <Badge variant={row.variant}>{row.label}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">{billMetaLine(b, inst)}</span>
                </span>
                <span className={`tnum shrink-0 text-right text-sm font-semibold ${remaining === 0 ? "text-ink-faint" : "text-ink"}`}>
                  {formatIDR(remaining)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function DebtsCard({
  debts,
  receivables,
  debtTotal,
  receivableTotal,
}: {
  debts: Bill[];
  receivables: Bill[];
  debtTotal: number;
  receivableTotal: number;
}) {
  const count = debts.length + receivables.length;
  return (
    <Card>
      <CardHeader
        icon={<HandCoins size={16} weight="duotone" />}
        title="Hutang & Piutang"
        subtitle="Ringkasan posisi hutang dan piutang saat ini."
      />
      <div className="grid grid-cols-2">
        <div className="min-w-0 pr-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400" aria-hidden="true">
              <TrendDown size={14} weight="duotone" />
            </span>
            <span className="truncate text-xs font-medium text-ink-muted">Hutang</span>
          </div>
          <p className="tnum mt-2 truncate text-xl font-bold tracking-tight text-rose-600 sm:text-2xl dark:text-rose-400">{formatIDR(debtTotal)}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-faint sm:text-xs">dari {debts.length} catatan</p>
        </div>
        <div className="min-w-0 border-l border-slate-100 pl-3 dark:border-slate-800 sm:pl-4">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden="true">
              <TrendUp size={14} weight="duotone" />
            </span>
            <span className="truncate text-xs font-medium text-ink-muted">Piutang</span>
          </div>
          <p className="tnum mt-2 truncate text-xl font-bold tracking-tight text-emerald-600 sm:text-2xl dark:text-emerald-400">{formatIDR(receivableTotal)}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-faint sm:text-xs">dari {receivables.length} catatan</p>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-ink-muted dark:border-slate-800">
        {count} catatan hutang/piutang tercatat.
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Daftar transaksi terbaru                                             */
/* ------------------------------------------------------------------ */
function RecentTransactions({
  transactions,
  data,
  onSelect,
}: {
  transactions: Transaction[];
  data: AppData;
  onSelect: (id: string) => void;
}) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-3 pt-5 sm:px-6 dark:border-slate-800">
        <p className="text-sm font-semibold text-ink">Daftar Transaksi</p>
        <span className="text-xs text-ink-muted">{transactions.length} terbaru</span>
      </div>
      {transactions.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyNote text="Tidak ada transaksi pada periode ini." />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {transactions.map((t) => {
            const isExpense = t.type !== "income";
            const cat = categoryById(data, t.categoryId);
            const wallet = walletById(data, t.walletId);
            const meta = [cat?.name, wallet?.name].filter(Boolean).join(" · ");
            return (
              <li key={t.id}>
                <button
                  onClick={() => onSelect(t.id)}
                  aria-label={`${t.merchant}, ${meta || "transaksi"}`}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      !isExpense
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                    aria-hidden="true"
                  >
                    {!isExpense ? <ArrowUpRight size={18} weight="bold" /> : <ArrowDownRight size={18} weight="bold" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{t.merchant}</span>
                    {meta && <span className="mt-0.5 block truncate text-xs text-ink-muted">{meta}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className={`tnum text-sm font-semibold ${!isExpense ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>
                      {isExpense ? "−" : "+"}
                      {formatIDR(t.amount)}
                    </span>
                    <CaretRight size={14} className="text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted">{text}</p>;
}
