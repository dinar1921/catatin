import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CaretRight,
  Receipt,
  CheckSquare,
  Sparkle,
  Wallet,
  ChartPieSlice,
  CalendarCheck,
  Lightbulb,
  ListChecks,
  CaretDown,
  ArrowUpRight,
  ArrowDownRight,
  MoneyWavy,
  CreditCard as CreditCardIcon,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import {
  budgetRows,
  categoryById,
  filterTransactions,
  greeting,
  isCreditCardSettlement,
  memberById,
  monthIncomeThis,
  monthSpendLastN,
  monthSpendThis,
  runway,
  spendingByCategory,
  totalBalance,
  walletById,
} from "../../lib/derive";
import { identifyTransferPairs, buildLogicalTransferRows } from "../../lib/transfer";
import { formatIDR, formatIDRSigned } from "../../lib/format";
import { periodRange, fmtDayMonth } from "../../lib/dates";
import { Badge, Card, CardHeader, ProgressBar } from "../../components/ui";
import { FilterChip, useFilter as useFilterCtx } from "../../components/layout";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";
import { getInsight, getUnifiedBills } from "../../lib/api";
import type { UnifiedBillItem } from "../../lib/types";

export function DashboardPage() {
  const { data, activeProfileId, sessionProfileId } = useApp();
  const { filter, openFilter } = useFilterCtx();
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showInsight, setShowInsight] = useState(false);
  const [ai, setAi] = useState<{ text: string | null; recommendation: string | null }>({ text: null, recommendation: null });
  const [upcoming, setUpcoming] = useState<UnifiedBillItem[]>([]);

  // Fetch AI insight saat filter berubah (pakai heuristic fallback bila gagal / tidak dikonfigurasi).
  useEffect(() => {
    let cancelled = false;
    const { start, end } = periodRange(filter.period);
    getInsight({ from: start, to: end, profileId: activeProfileId })
      .then((r) => { if (!cancelled) setAi(r); })
      .catch(() => { if (!cancelled) setAi({ text: null, recommendation: null }); });
    return () => { cancelled = true; };
  }, [filter, activeProfileId]);

  // Tagihan dari backend unified API (bukan kalkulasi client-side).
  useEffect(() => {
    let cancelled = false;
    getUnifiedBills({ profileId: activeProfileId })
      .then((res) => {
        if (cancelled) return;
        const active = res.items.filter(
          (i) => i.status !== "paid" && i.status !== "paid_off" && i.status !== "completed" && i.status !== "cancelled",
        );
        setUpcoming(active.slice(0, 4));
      })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [activeProfileId, filter]);

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
  const budgets = budgetRows(data, ts, activeProfileId).slice(0, 3);
  const recent = useMemo(() => {
    // Baris logis: pasangan transfer dihitung SATU kali (sama dgn halaman Transaksi).
    const allPairs = identifyTransferPairs(data.transactions);
    const owned = [...data.transactions]
      .filter((t) => activeProfileId === "all" || t.ownerProfileId === activeProfileId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return buildLogicalTransferRows(owned, allPairs).slice(0, 5);
  }, [data, activeProfileId]);
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
    <div className="flex flex-col gap-4">
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
          className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-left shadow-card transition-colors hover:border-brand-500/50 dark:border-brand-800 dark:bg-brand-950"
        >
          <CheckSquare size={20} className="shrink-0 text-brand-600" weight="duotone" />
          <span className="flex-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
            {pendingDrafts} draft menunggu persetujuanmu
          </span>
          <CaretRight size={16} weight="bold" className="text-brand-600" />
        </button>
      )}

      {/* ── BalanceCard — V2 spec §14.2: gradient hero + decorative circles ─ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800 p-4 text-left text-white shadow-card sm:p-5 dark:to-brand-900">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-brand-500/30" />

        <button
          onClick={() => navigate("/wallets")}
          className="relative flex w-full items-start justify-between gap-3 text-left"
        >
          <span>
            <span className="flex items-center gap-1.5 text-sm text-brand-100">
              <Wallet size={16} weight="duotone" /> Total uangmu saat ini
            </span>
            <span className="tnum mt-2 block text-3xl font-bold leading-none tracking-tight sm:text-5xl">
              {formatIDR(balance)}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <CaretRight size={17} weight="bold" />
          </span>
        </button>

        <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
          <button
            onClick={() => navigate("/transactions?type=expense")}
            className="rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/10"
          >
            <span className="block text-xs text-brand-100">Pengeluaran bulan ini</span>
            <span className="tnum mt-0.5 block text-base font-semibold sm:text-lg">
              {formatIDR(monthSpend)}
            </span>
          </button>
          <button
            onClick={() => navigate("/transactions?type=income")}
            className="rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/10"
          >
            <span className="block text-xs text-brand-100">Pemasukan</span>
            <span className="tnum mt-0.5 block text-base font-semibold sm:text-lg">
              {formatIDR(monthIncome)}
            </span>
          </button>
        </div>
      </div>

      {/* ── Row 2: Spending + Upcoming Bills (2-col at lg) ────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Spending utama — V2 spec §14.3 */}
        <Card>
          <CardHeader
            icon={<ChartPieSlice size={16} weight="duotone" />}
            title="Pengeluaran Utama"
            subtitle="Pengeluaran per kategori bulan ini"
          />
          {topSpend.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada pengeluaran pada periode ini.</p>
          ) : (
            <ul className="space-y-4">
              {topSpend.map((c) => (
                <li key={c.categoryId}>
                  <button
                    onClick={() => navigate(`/transactions?categoryId=${c.categoryId}`)}
                    className="w-full text-left"
                  >
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-medium text-ink">{c.name}</span>
                      <span className="tnum text-sm font-semibold text-ink">{formatIDR(c.total)}</span>
                    </div>
                    <ProgressBar
                      pct={(c.total / maxTop) * 100}
                      tone={c.total / maxTop > 0.8 ? "warn" : "brand"}
                    />
                  </button>
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
              <button
                onClick={() => navigate("/bills")}
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Lihat semua ({upcoming.length}) <CaretRight size={14} weight="bold" />
              </button>
            }
          />
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Tidak ada tagihan bulan ini.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.map((b) => {
                const day = b.dueDay ?? (b.dueDate ? Number(b.dueDate.slice(8, 10)) : null);
                const instProgress = b.metadata.progressText as string | undefined;
                const targetTab =
                  b.domainType === "credit_card_statement" ? "/bills?tab=cc" : b.domainType === "installment" ? "/bills?tab=installment" : `/bills/${b.sourceId}`;
                return (
                  <button
                    key={b.id}
                    onClick={() => navigate(targetTab)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                      {day ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{b.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {b.dueDate ? `Jatuh tempo ${fmtDayMonth(b.dueDate)}` : b.dueDay != null ? `Jatuh tempo tgl ${b.dueDay}` : ""}
                        {instProgress ? ` · ${instProgress}` : ""}
                      </span>
                    </span>
                    <div className="text-right">
                      <Badge variant={b.domainType === "installment" ? "warning" : "neutral"}>
                        {b.domainType === "installment" ? "Cicilan" : b.domainType === "credit_card_statement" ? "Kartu Kredit" : "Rutin"}
                      </Badge>
                      <p className="tnum mt-1 text-sm font-semibold text-ink">
                        {formatIDR(b.remainingAmount)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: AI Insight — V2 spec §14.5 ─────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-b from-brand-50 to-white shadow-card dark:border-brand-900 dark:from-brand-950 dark:to-slate-900">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
              <Sparkle size={15} className="text-white" weight="duotone" />
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-400">
              Insight AI
            </span>
          </div>
          <h3 className="mt-3 text-base font-bold text-ink">Ringkasan pengeluaran</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{ai.text || insightSentence}</p>

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
            <dl className="mt-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
        </div>

        {/* Recommendation footer — V2 spec §14.5 */}
        <div className="border-t border-brand-100 bg-white/70 px-5 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            <ListChecks size={15} weight="duotone" /> Rekomendasi
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">Tips keuangan</p>
          <p className="mt-0.5 text-sm text-ink-secondary">{ai.recommendation || recommendation}</p>
        </div>
      </div>

      {/* ── Row 4: Recent Transactions + Budget Status (2-col) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <ul className="py-1">
              {recent.map((t) => {
                const isTransfer = t.source === "transfer_out" || t.source === "transfer_in";
                const isSettlement = isCreditCardSettlement(t);
                const cat = categoryById(data, t.categoryId);
                const wallet = walletById(data, t.walletId);
                const card = t.creditCardId ? data.creditCards.find((c) => c.id === t.creditCardId) : null;
                const isExpense = !isTransfer && !isSettlement && t.type !== "income";

                const label = isTransfer ? "Transfer" : isSettlement ? "Pembayaran Kartu Kredit" : t.merchant;
                let meta: string;
                if (isTransfer) {
                  const src = wallet?.name ?? t.merchant;
                  const dst = t.description.replace(/^Transfer ke\s*/i, "").split(" · ")[0].trim() || "";
                  meta = `${src} → ${dst}`;
                } else if (isSettlement) {
                  meta = [wallet?.name, card?.name].filter(Boolean).join(" → ") || "Pembayaran Kartu Kredit";
                } else {
                  meta = [cat?.name, wallet?.name].filter(Boolean).join(" · ");
                }

                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setDetailId(t.id)}
                      className="flex w-full items-center gap-3 py-3 pr-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          isTransfer
                            ? "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
                            : isSettlement
                              ? "bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
                              : isExpense
                                ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                        )}
                      >
                        {isTransfer ? (
                          <MoneyWavy size={18} weight="duotone" />
                        ) : isSettlement ? (
                          <CreditCardIcon size={18} weight="duotone" />
                        ) : isExpense ? (
                          <ArrowDownRight size={18} weight="bold" />
                        ) : (
                          <ArrowUpRight size={18} weight="bold" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{label}</span>
                        <span className="block truncate text-xs text-ink-muted">{meta}</span>
                      </span>
                      <div className="text-right">
                        <span
                          className={cn(
                            "tnum block text-sm font-semibold",
                            isTransfer || isSettlement
                              ? "text-ink"
                              : isExpense
                                ? "text-ink"
                                : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {isTransfer || isSettlement
                            ? formatIDR(t.amount)
                            : formatIDRSigned(isExpense ? -t.amount : t.amount)}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {t.occurredAt.slice(8, 10)}/{t.occurredAt.slice(5, 7)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Status budget — V2 spec §14.7 */}
        <Card
          onClick={() => navigate("/budget")}
          interactive
          className="flex flex-col items-stretch justify-start"
        >
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
