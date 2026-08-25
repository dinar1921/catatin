import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Receipt,
  ArrowLeft,
  CaretRight,
  CalendarBlank,
  CalendarCheck,
  Infinity,
  HandCoins,
  CreditCard as CreditCardIcon,
  Check,
  Lightning,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { billStatus, categoryById, memberById, walletVisible } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { dueLabel, fmtDateID, fmtDayMonth } from "../../lib/dates";
import { AmountInput, Badge, Button, Card, EmptyState, Field, Pagination, ProgressBar, Select, Sheet, usePagination, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import type { Bill, BillType, Installment, PaymentMethod } from "../../lib/types";

type TabId = "all" | "regular" | "recurring" | "debt_installment" | "cc";

const tabDefs: { id: TabId; label: string; types: BillType[] }[] = [
  { id: "all", label: "Semua", types: [] },
  { id: "regular", label: "Tagihan Biasa", types: ["regular"] },
  { id: "recurring", label: "Tagihan Bulanan", types: ["recurring"] },
  { id: "debt_installment", label: "Hutang & Cicilan", types: ["debt", "receivable", "installment"] },
  { id: "cc", label: "Kartu Kredit", types: ["credit_card_statement"] },
];

export function billTypeLabel(t: BillType): string {
  switch (t) {
    case "regular":
      return "Tagihan Biasa";
    case "recurring":
      return "Bulanan";
    case "debt":
      return "Hutang";
    case "receivable":
      return "Piutang";
    case "installment":
      return "Cicilan";
    case "credit_card_statement":
      return "Kartu Kredit";
  }
}

export function billStatusLabel(s: ReturnType<typeof billStatus>): string {
  switch (s) {
    case "paid_off":
      return "Lunas";
    case "paid":
      return "Sudah dibayar";
    case "due_today":
      return "Jatuh tempo hari ini";
    case "overdue":
      return "Overdue";
    default:
      return "Belum dibayar";
  }
}

function statusVariant(s: ReturnType<typeof billStatus>): "income" | "expense" | "warning" | "neutral" | "default" {
  return s === "paid_off" || s === "paid" ? "income" : s === "overdue" ? "expense" : s === "due_today" ? "warning" : "neutral";
}

/* ------------------------------------------------------------------ */
/* Helpers untuk baris tagihan (list)                                   */
/* ------------------------------------------------------------------ */
export function billRowStatus(s: ReturnType<typeof billStatus>): { label: string; variant: "default" | "income" | "expense" | "warning" | "danger" | "neutral" } {
  if (s === "paid_off" || s === "paid") return { label: "Lunas", variant: "income" };
  if (s === "overdue") return { label: "Overdue", variant: "expense" };
  return { label: "Berjalan", variant: "default" };
}

export function billIcon(b: Bill, size = 20): React.ReactNode {
  switch (b.type) {
    case "recurring":
      return <Infinity size={size} weight="duotone" />;
    case "installment":
      return <CalendarCheck size={size} weight="duotone" />;
    case "debt":
      return <HandCoins size={size} weight="duotone" />;
    case "receivable":
      return <HandCoins size={size} weight="duotone" />;
    case "credit_card_statement":
      return <CreditCardIcon size={size} weight="duotone" />;
    default:
      return <Receipt size={size} weight="duotone" />;
  }
}

/** "Cicilan · tgl 25 - 7/24" | "Bulanan · tgl 15" | "Hutang · tgl 15 Agu" */
export function billMetaLine(b: Bill, inst?: Installment | null): string {
  const tgl = b.dueDate ? `tgl ${fmtDayMonth(b.dueDate)}` : b.dueDay != null ? `tgl ${b.dueDay}` : "";
  const base = [billTypeLabel(b.type), tgl].filter(Boolean).join(" · ");
  if (b.type === "installment" && inst) return `${base} - ${inst.paidCount}/${inst.tenor}`;
  return base;
}

export function BillsPage() {
  const { data, activeProfileId } = useApp();
  const [tab, setTab] = useState<TabId>("all");

  const bills = useMemo(
    () =>
      data.bills.filter((b) => b.isActive && (activeProfileId === "all" || b.ownerProfileId === activeProfileId)),
    [data, activeProfileId],
  );

  const shown = tab === "all" ? bills : bills.filter((b) => tabDefs.find((t) => t.id === tab)?.types.includes(b.type));

  const { pageItems, page, totalPages, setPage } = usePagination(shown, 20);

  const summary = useMemo(() => {
    const unpaid = bills.filter((b) => b.paidAmount < b.amount);
    const unpaidAmount = unpaid.reduce((s, b) => s + (b.amount - b.paidAmount), 0);
    const dueToday = bills.filter((b) => billStatus(b) === "due_today").length;
    const overdue = bills.filter((b) => billStatus(b) === "overdue").length;
    const paidOff = bills.filter((b) => billStatus(b) === "paid_off").length;
    return { unpaid: unpaid.length, unpaidAmount, dueToday, overdue, paidOff };
  }, [bills]);

  return (
    <div>
      <PageHeader title="Tagihan" subtitle="Semua kewajiban pembayaran dalam satu tempat" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Belum dibayar" value={`${summary.unpaid} tagihan`} sub={formatIDR(summary.unpaidAmount)} tone="bad" />
        <SummaryCard label="Jatuh tempo" value={`${summary.dueToday}`} sub="hari ini" tone="warn" />
        <SummaryCard label="Overdue" value={`${summary.overdue}`} sub="perlu perhatian" tone="bad" />
        <SummaryCard label="Lunas" value={`${summary.paidOff}`} sub="bulan ini" tone="good" />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabDefs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                : "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={<Receipt size={40} />} title="Tidak ada tagihan" body="Tagihan dibuat lewat form transaksi saat memilih 'Kaitkan tagihan?'." />
        </Card>
      ) : (
        <Card padded={false} className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {pageItems.map((b) => {
            const st = billStatus(b);
            const inst = data.installments.find((i) => i.billId === b.id);
            const remaining = Math.max(0, b.amount - b.paidAmount);
            const row = billRowStatus(st);
            return (
              <Link key={b.id} to={`/bills/${b.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/60">
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
                <CaretRight size={16} weight="bold" className="shrink-0 text-ink-faint" />
              </Link>
            );
          })}
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "good" | "bad" | "warn" | "primary" }) {
  const toneCls = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-brand-700 dark:text-brand-300";
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={"tnum mt-1 text-lg font-bold tracking-tight " + toneCls}>{value}</p>
      <p className="tnum text-xs text-ink-faint">{sub}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Detail tagihan                                                      */
/* ------------------------------------------------------------------ */
export function BillDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, payBill } = useApp();
  const bill = data.bills.find((b) => b.id === id);
  const [payOpen, setPayOpen] = useState(false);

  if (!bill) {
    return (
      <div>
        <PageHeader title="Tagihan tidak ditemukan" />
        <Button variant="secondary" onClick={() => navigate("/bills")}>
          Kembali ke Tagihan
        </Button>
      </div>
    );
  }

  const st = billStatus(bill);
  const inst = data.installments.find((i) => i.billId === bill.id);
  const cc = bill.creditCardId ? data.creditCards.find((c) => c.id === bill.creditCardId) : null;
  const stmt = cc ? data.statements.find((s) => s.creditCardId === cc.id) : null;
  const ccTx = cc ? data.transactions.filter((t) => t.creditCardId === cc.id && t.type === "expense") : [];
  const owner = memberById(data, bill.ownerProfileId);
  const cat = bill.categoryId ? categoryById(data, bill.categoryId) : null;
  const remaining = Math.max(0, bill.amount - bill.paidAmount);

  const canPay = remaining > 0;
  const isInstallment = bill.type === "installment";
  const isStatement = bill.type === "credit_card_statement";

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="flex items-center gap-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                {isStatement ? <CreditCardIcon size={22} weight="duotone" /> : <Receipt size={22} weight="duotone" />}
              </span>
              <span>
                <span className="block text-lg font-bold tracking-tight text-ink">{bill.title}</span>
                <span className="text-xs text-ink-muted">
                  {billTypeLabel(bill.type)} · {owner?.name}
                </span>
              </span>
            </span>
          </div>
          <Badge variant={statusVariant(st)}>{billStatusLabel(st)}</Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Total" value={formatIDR(bill.amount)} />
          <Stat label="Sudah dibayar" value={formatIDR(bill.paidAmount)} />
          <Stat label="Sisa" value={formatIDR(remaining)} tone={remaining > 0 ? "bad" : "good"} />
        </div>

        {isInstallment && inst && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink">Progress cicilan</span>
              <span className="tnum text-ink-muted">
                {inst.paidCount}/{inst.tenor} · {formatIDR(inst.installmentAmount)}/bulan
              </span>
            </div>
            <ProgressBar pct={(inst.paidCount / inst.tenor) * 100} />
          </div>
        )}

        <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
          <D label="Jatuh tempo" value={dueLabel(bill.dueDay, bill.dueDate)} />
          {cat && <D label="Kategori" value={cat.name} />}
          {bill.counterparty && <D label="Pihak terkait" value={bill.counterparty} />}
          {bill.frequency && <D label="Frekuensi" value={bill.frequency} />}
          {bill.lastPaidPeriod && <D label="Periode terakhir dibayar" value={bill.lastPaidPeriod} />}
          {bill.notes && <D label="Catatan" value={bill.notes} />}
        </dl>

        {canPay && (
          <Button className="mt-6 w-full" size="lg" onClick={() => setPayOpen(true)}>
            {isStatement ? "Bayar Tagihan Kartu Kredit" : isInstallment ? "Bayar Cicilan" : "Bayar Tagihan"}
          </Button>
        )}
        {!canPay && (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <Check size={16} weight="bold" /> Tagihan lunas
          </div>
        )}
      </Card>

      {/* Statement kartu kredit: daftar transaksi penyusun (PRD §15.5) */}
      {isStatement && cc && (
        <Card className="mt-4">
          <p className="mb-1 text-sm font-semibold text-ink">Transaksi penyusun statement</p>
          <p className="mb-3 text-xs text-ink-muted">
            {cc.name} •{cc.lastFour} · cutoff tgl {cc.statementDay}, jatuh tempo tgl {cc.dueDay}
          </p>
          {ccTx.length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada transaksi kartu kredit pada periode ini.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {ccTx.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="block font-medium text-ink">{t.merchant}</span>
                    <span className="text-xs text-ink-muted">{fmtDateID(t.occurredAt)}</span>
                  </span>
                  <span className="tnum font-semibold text-ink">{formatIDR(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {stmt && (
            <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Outstanding statement</span><span className="tnum font-bold text-ink">{formatIDR(stmt.statementAmount - stmt.paidAmount)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-ink-muted">Periode</span><span className="tnum text-ink">{fmtDateID(stmt.periodStart)} – {fmtDateID(stmt.periodEnd)}</span></div>
            </div>
          )}
        </Card>
      )}

      {isStatement && stmt && (
        <PaymentSheet
          open={payOpen}
          onClose={() => setPayOpen(false)}
          title={`Bayar ${bill.title}`}
          defaultAmount={remaining}
          maxAmount={remaining}
          isStatement
          onPay={(walletId, amount, method) => {
            payBill(bill.id, { amount, walletId, method });
            setPayOpen(false);
          }}
        />
      )}

      {!isStatement && (
        <PaymentSheet
          open={payOpen}
          onClose={() => setPayOpen(false)}
          title={`Bayar ${bill.title}`}
          defaultAmount={isInstallment && inst ? inst.installmentAmount : remaining}
          maxAmount={remaining}
          fullOption={isInstallment}
          isStatement={false}
          onPay={(walletId, amount, method, full) => {
            payBill(bill.id, { amount, walletId, method, full });
            setPayOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-canvas p-3">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={"tnum mt-0.5 text-sm font-bold tracking-tight " + (tone === "bad" ? "text-rose-600 dark:text-rose-400" : tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-ink")}>{value}</p>
    </div>
  );
}

function D({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="truncate text-right text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payment sheet                                                       */
/* ------------------------------------------------------------------ */
function PaymentSheet({
  open,
  onClose,
  title,
  defaultAmount,
  maxAmount,
  fullOption,
  isStatement,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultAmount: number;
  maxAmount: number;
  fullOption?: boolean;
  isStatement: boolean;
  onPay: (walletId: string, amount: number, method: PaymentMethod | null, full?: boolean) => void;
}) {
  const { data, activeProfileId } = useApp();
  const toast = useToast();
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [full, setFull] = useState(false);
  const wallets = walletVisible(data, activeProfileId);

  const submit = () => {
    if (!walletId || amount <= 0) {
      toast.push("error", "Pilih wallet dan nominal pembayaran");
      return;
    }
    onPay(walletId, amount, method || null, full);
    toast.push("success", isStatement ? "Statement kartu kredit dibayar" : "Tagihan dibayar");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button className="flex-1" onClick={submit}>
            <Lightning size={16} weight="fill" /> Bayar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Wallet pembayaran">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">Pilih wallet</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nominal" hint={isStatement ? "Pembayaran statement mengurangi kewajiban, bukan menambah pengeluaran." : undefined}>
          <AmountInput value={amount} onChange={setAmount} />
          <div className="mt-2 flex gap-2">
            {fullOption && (
              <button
                onClick={() => {
                  setAmount(maxAmount);
                  setFull(true);
                }}
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              >
                Bayar penuh ({formatIDR(maxAmount)})
              </button>
            )}
            <button
              onClick={() => setAmount(defaultAmount)}
              className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-ink-muted"
            >
              Default ({formatIDR(defaultAmount)})
            </button>
          </div>
        </Field>
        <Field label="Metode pembayaran">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "")}>
            <option value="">Tidak memilih</option>
            <option value="Cash">Cash</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Transfer">Transfer</option>
          </Select>
        </Field>
        <p className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          <CalendarBlank size={14} className="mt-0.5 shrink-0" />
          Transaksi akan dicatat hari ini dan status tagihan diperbarui otomatis.
        </p>
      </div>
    </Sheet>
  );
}
