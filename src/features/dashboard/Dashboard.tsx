import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CaretRight,
  Receipt,
  CheckSquare,
  Sparkle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  ChartPieSlice,
  CalendarCheck,
  Lightbulb,
  ListChecks,
  CaretDown,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import {
  budgetRows,
  categoryById,
  filterTransactions,
  greeting,
  memberById,
  monthIncomeThis,
  monthSpendLastN,
  monthSpendThis,
  runway,
  spendingByCategory,
  totalBalance,
  upcomingBills,
  walletById,
} from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { dueLabel } from "../../lib/dates";
import { Badge, Card, CardHeader, ProgressBar } from "../../components/ui";
import { FilterChip, useFilter as useFilterCtx } from "../../components/layout";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";

export function DashboardPage() {
  const { data, activeProfileId, sessionProfileId } = useApp();
  const { filter, openFilter } = useFilterCtx();
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showInsight, setShowInsight] = useState(false);

  const me = memberById(data, sessionProfileId);
  const ts = useMemo(
    () => filterTransactions(data, filter, activeProfileId),
    [data, filter, activeProfileId],
  );

  const balance = totalBalance(data, activeProfileId);
  const monthSpend = monthSpendThis(data, activeProfileId);
  const monthIncome = monthIncomeThis(data, activeProfileId);
  const avg3 = monthSpendLastN(data, activeProfileId, 3) / 3;
  const daysElapsed = Math.max(1, new Date().getDate());
  const dailyThis = monthSpend / daysElapsed;
  const dailyAvg = avg3 / 30;
  const change = dailyAvg > 0 ? ((dailyThis - dailyAvg) / dailyAvg) * 100 : 0;
  const rw = runway(data, activeProfileId);

  const topSpend = spendingByCategory(data, ts, 4);
  const maxTop = topSpend[0]?.total ?? 1;
  const bills = upcomingBills(data, activeProfileId, 4);
  const budgets = budgetRows(data, ts, activeProfileId).slice(0, 3);
  const recent = useMemo(
    () =>
      [...data.transactions]
        .filter((t) => activeProfileId === "all" || t.ownerProfileId === activeProfileId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 5),
    [data, activeProfileId],
  );
  const pendingDrafts = data.drafts.filter(
    (d) => d.status === "draft" || d.status === "in_review",
  ).length;

  const pct = Math.round(Math.abs(change));
  const insightSentence =
    change >= 0
      ? `Bulan ini pengeluaranmu ${formatIDR(monthSpend)}, naik ${pct}% dari rata-rata 3 bulan terakhir (${formatIDR(Math.round(avg3))}/bulan).`
      : `Bulan ini pengeluaranmu ${formatIDR(monthSpend)}, turun ${pct}% dari rata-rata 3 bulan terakhir (${formatIDR(Math.round(avg3))}/bulan).`;

  const recommendation =
    rw.days >= 90
      ? `Saldo ${formatIDR(balance)} cukup untuk ±${Math.round(rw.monthlyAvg > 0 ? balance / rw.monthlyAvg : 12)} bulan ke depan. Terus jaga pola ini.`
      : `Dengan saldo ${formatIDR(balance)} dan rata-rata pengeluaran ${formatIDR(Math.round(rw.dailyAvg))}/hari, uang diperkirakan cukup ±${rw.days} hari lagi. Perhatikan budget makanan.`;

  const monthName = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-5">
      {/* ── GreetingHeader — V2 spec §14.1 ────────────────────── */}
      <div className="mb-1">
        <p className="text-sm text-ink-muted">
          {greeting()}, {me?.name ?? "Keluarga"}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{monthName}</h1>
        <div className="mt-2 flex items-center gap-2">
          <FilterChip filter={filter} onClick={openFilter} />
        </div>
      </div>

      {/* ── Pending approvals strip ────────────────────────────── */}
      {pendingDrafts > 0 && (
        <button
          onClick={() => navigate("/approvals")}
          className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-left transition-all hover:border-brand-500/50 dark:border-brand-800 dark:bg-brand-950"
        >
          <CheckSquare size={20} className="shrink-0 text-brand-600" weight="duotone" />
          <span className="flex-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
            {pendingDrafts} draft menunggu persetujuanmu
          </span>
          <CaretRight size={16} className="text-brand-600" />
        </button>
      )}

      {/* ── BalanceCard — V2 spec §14.2: gradient hero + decorative circles ─ */}
      <button
        onClick={() => navigate("/wallets")}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800 p-5 text-left text-white shadow-card transition-all active:scale-[0.995] sm:p-6 dark:to-brand-900"
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-brand-500/30" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-brand-100">
              <Wallet size={16} weight="bold" /> Total uangmu saat ini
            </p>
            <p className="tnum mt-2 text-4xl font-bold leading-none tracking-tight sm:text-5xl">
              {formatIDR(balance)}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <CaretRight size={17} weight="bold" />
          </span>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
          <div>
            <p className="text-xs text-brand-100">Pengeluaran bulan ini</p>
            <p className="tnum mt-0.5 text-base font-semibold sm:text-lg">
              {formatIDR(monthSpend)}
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-100">Pemasukan</p>
            <p className="tnum mt-0.5 text-base font-semibold sm:text-lg">
              {formatIDR(monthIncome)}
            </p>
          </div>
        </div>
      </button>

      {/* ── Row 2: Spending + Upcoming Bills (2-col at lg) ────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Spending utama — V2 spec §14.3 */}
        <Card>
          <CardHeader
            icon={<ChartPieSlice size={16} weight="duotone" />}
            title="Spending utama"
            subtitle="Pengeluaran per kategori bulan ini"
          />
          {topSpend.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada pengeluaran pada periode ini.</p>
          ) : (
            <ul className="space-y-4">
              {topSpend.map((c) => (
                <li key={c.categoryId}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-medium text-ink">{c.name}</span>
                    <span className="tnum text-sm font-semibold text-ink">{formatIDR(c.total)}</span>
                  </div>
                  <ProgressBar
                    pct={(c.total / maxTop) * 100}
                    tone={c.total / maxTop > 0.8 ? "expense" : "brand"}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Tagihan & cicilan — V2 spec §14.4 */}
        <Card>
          <CardHeader
            icon={<CalendarCheck size={16} weight="duotone" />}
            title="Tagihan & cicilan"
            subtitle="Yang perlu dibayar bulan ini"
            action={
              <Badge variant="default">
                {formatIDR(bills.reduce((s, b) => s + (b.amount - b.paidAmount), 0))}
              </Badge>
            }
          />
          {bills.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Tidak ada tagihan bulan ini.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {bills.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/bills/${b.id}`)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    {b.dueDay}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{b.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {dueLabel(b.dueDay, b.dueDate)}
                      {(() => {
                        const inst = data.installments.find((i) => i.billId === b.id);
                        return inst ? ` · ${inst.paidCount}/${inst.tenor}` : "";
                      })()}
                    </span>
                  </span>
                  <div className="text-right">
                    <Badge variant={b.type === "installment" ? "warning" : "neutral"}>
                      {b.type === "installment" ? "Cicilan" : "Rutin"}
                    </Badge>
                    <p className="tnum mt-1 text-sm font-semibold text-ink">
                      {formatIDR(b.amount - b.paidAmount)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: AI Insight — V2 spec §14.5 ─────────────────── */}
      <div className="rounded-2xl border border-brand-200/70 bg-gradient-to-b from-brand-50 to-white p-5 dark:border-brand-900 dark:from-brand-950 dark:to-slate-900 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600">
            <Sparkle size={15} className="text-white" weight="fill" />
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-400">
            Insight AI
          </span>
        </div>
        <h3 className="mt-3 text-base font-bold text-ink">Ringkasan pengeluaran</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{insightSentence}</p>

        <button
          onClick={() => setShowInsight(!showInsight)}
          className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-400"
        >
          <Lightbulb size={15} weight="duotone" />
          Lihat penjelasan
          <CaretDown
            size={14}
            className={cn("transition-transform", showInsight && "rotate-180")}
          />
        </button>

        {showInsight && (
          <dl className="mt-3 rounded-xl border border-brand-100 bg-white p-4 dark:border-brand-900 dark:bg-slate-900">
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <dt className="text-sm font-semibold text-ink">Angka saat ini</dt>
              <dd className="tnum text-sm text-ink-secondary">{formatIDR(monthSpend)}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <dt className="text-sm font-semibold text-ink">Pembanding</dt>
              <dd className="tnum text-sm text-ink-secondary">{formatIDR(Math.round(avg3))}/bulan</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <dt className="text-sm font-semibold text-ink">Selisih</dt>
              <dd className="tnum text-sm text-ink-secondary">
                {change >= 0 ? "+" : ""}
                {pct}%
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-sm font-semibold text-ink">Runway</dt>
              <dd className="tnum text-sm text-ink-secondary">±{rw.days} hari</dd>
            </div>
          </dl>
        )}

        {/* Recommendation footer — V2 spec §14.5 */}
        <div className="mt-4 border-t border-brand-100 pt-4 dark:border-brand-900">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            <ListChecks size={15} weight="duotone" /> Rekomendasi
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">Tips keuangan</p>
          <p className="mt-0.5 text-sm text-ink-secondary">{recommendation}</p>
        </div>
      </div>

      {/* ── Row 4: Recent Transactions + Budget Status (2-col) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Transaksi terbaru — V2 spec §14.6 */}
        <Card>
          <CardHeader
            icon={<Receipt size={16} weight="duotone" />}
            title="Transaksi terbaru"
            subtitle={`${recent.length} transaksi terakhir`}
          />
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Belum ada transaksi</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((t) => {
                const cat = categoryById(data, t.categoryId);
                const wallet = walletById(data, t.walletId);
                const isExpense = t.type !== "income";
                return (
                  <button
                    key={t.id}
                    onClick={() => setDetailId(t.id)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        isExpense
                          ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                      )}
                    >
                      {isExpense ? (
                        <ArrowDownRight size={18} weight="bold" />
                      ) : (
                        <ArrowUpRight size={18} weight="bold" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {t.merchant}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {cat?.name} · {wallet?.name}
                      </span>
                    </span>
                    <div className="text-right">
                      <span
                        className={cn(
                          "tnum block text-sm font-semibold",
                          isExpense ? "text-ink" : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {isExpense ? "-" : "+"}
                        {formatIDR(t.amount)}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {t.occurredAt.slice(8, 10)}/{t.occurredAt.slice(5, 7)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Status budget — V2 spec §14.7 */}
        <Card>
          <CardHeader
            icon={<Wallet size={16} weight="duotone" />}
            title="Status budget"
            subtitle="Budget kategori bulan ini"
          />
          {budgets.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Belum ada budget.</p>
          ) : (
            <div className="space-y-4">
              {budgets.map((b) => (
                <div key={b.budget.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{b.name}</span>
                    <Badge
                      variant={
                        b.pct >= 100 ? "danger" : b.pct >= 80 ? "warning" : "income"
                      }
                    >
                      {b.pct >= 100 ? "Lebih" : b.pct >= 80 ? "Waspada" : "Aman"}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-ink-muted">
                    <span className="tnum">
                      {formatIDR(b.spent)} dari {formatIDR(b.budget.amount)}
                    </span>
                    <span
                      className={cn(
                        "tnum font-semibold",
                        b.pct >= 100 ? "text-rose-600" : b.pct >= 80 ? "text-amber-600" : "text-ink-muted",
                      )}
                    >
                      {Math.round(b.pct)}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar
                      pct={b.pct}
                      tone={b.pct >= 100 ? "expense" : b.pct >= 80 ? "warn" : "income"}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <TransactionDetailSheet transactionId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
