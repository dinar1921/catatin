import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Plus,
  PencilSimple,
  Trash,
  FunnelSimple,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { categoryById, memberById, walletVisible } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { fmtDateID, fmtDayMonth } from "../../lib/dates";
import {
  AmountInput,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Pagination,
  ProgressBar,
  Select,
  Sheet,
  usePagination,
  useToast,
} from "../../components/ui";
import { PageHeader } from "../../components/layout";
import {
  getUnifiedBills,
  getUnifiedBillDetail,
  getCreditCardStatementDetail,
  getCreditCards,
  createBill,
  payBill,
  payCreditCardStatement,
  payInstallmentFull,
} from "../../lib/api";
import type {
  CreditCard,
  PaymentMethod,
  UnifiedBillDetailResponse,
  UnifiedBillItem,
  UnifiedBillSummary,
} from "../../lib/types";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";

type TabId = "all" | "regular_recurring" | "installment" | "debt" | "cc";

const tabDefs: { id: TabId; label: string; types: string[] }[] = [
  { id: "all", label: "Semua", types: [] },
  { id: "regular_recurring", label: "Tagihan Bulanan", types: ["regular", "recurring"] },
  { id: "installment", label: "Cicilan", types: ["installment"] },
  { id: "debt", label: "Hutang", types: ["debt", "receivable"] },
  { id: "cc", label: "Kartu Kredit", types: ["credit_card_statement"] },
];

const billTypeOptions = [
  { value: "", label: "Semua Jenis" },
  { value: "regular", label: "Tagihan Biasa" },
  { value: "recurring", label: "Tagihan Bulanan" },
  { value: "installment", label: "Cicilan" },
  { value: "hutang", label: "Hutang" },
  { value: "credit_card_statement", label: "Kartu Kredit" },
];

const billStatusOptions = [
  { value: "", label: "Semua Status" },
  { value: "upcoming", label: "Akan Datang" },
  { value: "due_today", label: "Jatuh Tempo Hari Ini" },
  { value: "partial", label: "Sebagian Dibayar" },
  { value: "overdue", label: "Terlambat" },
  { value: "paid", label: "Lunas" },
];

export function billRowStatus(s: any): { label: string; variant: "default" | "income" | "expense" | "warning" | "danger" | "neutral" } {
  const info = unifiedStatusInfo(String(s));
  return { label: info.label, variant: info.variant === "neutral" ? "default" : info.variant };
}

export function billIcon(b: { type: string }, size = 20): React.ReactNode {
  return billIconByDomain(b.type, size);
}

export function billMetaLine(b: { type: string; dueDate?: string | null; dueDay?: number | null }, inst?: { paidCount: number; tenor: number } | null): string {
  const tgl = b.dueDate ? `tgl ${fmtDayMonth(b.dueDate)}` : b.dueDay != null ? `tgl ${b.dueDay}` : "";
  const base = [unifiedDomainLabel(b.type), tgl].filter(Boolean).join(" · ");
  if (b.type === "installment" && inst) return `${base} - ${inst.paidCount}/${inst.tenor}`;
  return base;
}

export function unifiedDomainLabel(t: string): string {
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
    default:
      return "Tagihan";
  }
}

export function unifiedStatusInfo(s: string): { label: string; variant: "default" | "income" | "expense" | "warning" | "neutral" } {
  switch (s) {
    case "paid":
    case "paid_off":
    case "completed":
    case "paid_period":
      return { label: "Lunas", variant: "income" };
    case "due_today":
      return { label: "Jatuh Tempo Hari Ini", variant: "warning" };
    case "partial":
      return { label: "Sebagian Dibayar", variant: "warning" };
    case "overdue":
      return { label: "Terlambat", variant: "expense" };
    case "not_started":
      return { label: "Belum Dimulai", variant: "neutral" };
    case "issued":
      return { label: "Periode Berjalan", variant: "default" };
    case "open":
      return { label: "Berjalan", variant: "neutral" };
    case "upcoming":
    default:
      return { label: "Akan Datang", variant: "neutral" };
  }
}

/** Label Indonesia untuk item_type statement kartu kredit. */
export function statementItemTypeLabel(t: string): string {
  switch (t) {
    case "purchase":
      return "Pembelian";
    case "installment":
      return "Cicilan";
    case "fee":
      return "Biaya";
    case "interest":
      return "Bunga";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Penyesuaian";
    default:
      return t;
  }
}

export function billIconByDomain(t: string, size = 20): React.ReactNode {
  switch (t) {
    case "recurring":
      return <Infinity size={size} weight="duotone" />;
    case "installment":
      return <CalendarCheck size={size} weight="duotone" />;
    case "debt":
    case "receivable":
      return <HandCoins size={size} weight="duotone" />;
    case "credit_card_statement":
      return <CreditCardIcon size={size} weight="duotone" />;
    default:
      return <Receipt size={size} weight="duotone" />;
  }
}

export function BillsPage() {
  const { data, activeProfileId } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabId | null) ?? "all";
  const [tab, setTab] = useState<TabId>(tabParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter khusus tagihan (P1-3): dipetakan langsung ke parameter API /api/bills.
  const [billTypeFilter, setBillTypeFilter] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("");
  const [billProfileFilter, setBillProfileFilter] = useState(activeProfileId);
  const [billFilterOpen, setBillFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [summary, setSummary] = useState<UnifiedBillSummary>({
    totalUnpaid: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    upcomingCount: 0,
  });
  const [items, setItems] = useState<UnifiedBillItem[]>([]);

  useEffect(() => {
    if (tabParam !== tab) setTab(tabParam);
  }, [tabParam]);

  const loadData = () => {
    setLoading(true);
    setError(null);
    getUnifiedBills({
      type: billTypeFilter || undefined,
      status: billStatusFilter || undefined,
      profileId: billProfileFilter,
    })
      .then((res) => {
        setSummary(res.summary);
        setItems(res.items);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Gagal memuat data tagihan");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [billTypeFilter, billStatusFilter, billProfileFilter]);

  const handleTabChange = (t: TabId) => {
    setTab(t);
    setSearchParams(t === "all" ? {} : { tab: t });
  };

  const shownItems = useMemo(() => {
    if (tab === "all") return items;
    const allowedTypes = tabDefs.find((td) => td.id === tab)?.types ?? [];
    return items.filter((i) => allowedTypes.includes(i.domainType));
  }, [items, tab]);

  const { pageItems, page, totalPages, setPage } = usePagination(shownItems, 15);

  const activeFilterLabel = [
    billTypeFilter ? billTypeOptions.find((o) => o.value === billTypeFilter)?.label : null,
    billStatusFilter ? billStatusOptions.find((o) => o.value === billStatusFilter)?.label : null,
    billProfileFilter && billProfileFilter !== "all" ? memberById(data, billProfileFilter)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title="Tagihan"
        subtitle="Semua kewajiban pembayaran dalam satu tempat"
        actions={
          <div className="flex items-center gap-2">
            {activeFilterLabel && (
              <button
                onClick={() => setBillFilterOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
              >
                <FunnelSimple size={13} weight="fill" />
                {activeFilterLabel}
              </button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setBillFilterOpen(true)}>
              <FunnelSimple size={16} /> Filter
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={16} weight="bold" /> Tagihan
            </Button>
          </div>
        }
      />

      {/* Ringkasan Utama (Section 5) — bersumber dari backend summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Belum dibayar"
          value={formatIDR(summary.totalUnpaid)}
          sub="total kewajiban"
          tone="bad"
        />
        <SummaryCard
          label="Jatuh tempo"
          value={`${summary.dueTodayCount}`}
          sub="hari ini"
          tone="warn"
        />
        <SummaryCard
          label="Terlambat"
          value={`${summary.overdueCount}`}
          sub="perlu perhatian"
          tone="bad"
        />
        <SummaryCard
          label="Akan datang"
          value={`${summary.upcomingCount}`}
          sub="periode ini"
          tone="primary"
        />
      </div>

      {/* Navigation Tabs (Section 3) */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabDefs.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
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

      {tab === "cc" && <CreditCardsSection reloadParent={loadData} />}

      {loading ? (
        <Card className="mt-4 p-8 text-center text-ink-muted">Memuat data tagihan...</Card>
      ) : error ? (
        <Card className="mt-4 p-6 text-center">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadData} className="mt-3">
            Coba Lagi
          </Button>
        </Card>
      ) : shownItems.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<Receipt size={40} />}
            title={
              tab === "installment"
                ? "Belum ada cicilan."
                : tab === "cc"
                  ? "Belum ada tagihan kartu kredit."
                  : tab === "debt"
                    ? "Belum ada hutang atau piutang."
                    : "Belum ada tagihan."
            }
            body="Tagihan dibuat otomatis atau dikaitkan saat memilih 'Kaitkan tagihan?' pada transaksi."
          />
        </Card>
      ) : (
        <Card padded={false} className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {pageItems.map((item) => {
            const stInfo = unifiedStatusInfo(item.status);
            const owner = memberById(data, item.ownerProfileId ?? "");
            const isReceivable = item.domainType === "receivable";
            const instProgress = item.metadata.progressText as string | undefined;
            const counterparty = item.metadata.counterparty as string | undefined;

            return (
              <Link
                key={item.id}
                to={`/bills/${item.sourceId}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/60"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isReceivable
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  }`}
                >
                  {billIconByDomain(item.domainType, 20)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{item.title}</span>
                    <Badge variant={stInfo.variant}>{stInfo.label}</Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {unifiedDomainLabel(item.domainType)}
                    {counterparty ? ` · ${counterparty}` : ""}
                    {instProgress ? ` · ${instProgress}` : ""}
                    {item.dueDate ? ` · tgl ${fmtDayMonth(item.dueDate)}` : ""}
                    {owner ? ` · ${owner.name}` : ""}
                  </span>
                </span>
                <span
                  className={`tnum shrink-0 text-right text-sm font-semibold ${
                    item.remainingAmount === 0 ? "text-ink-faint" : isReceivable ? "text-emerald-600 dark:text-emerald-400" : "text-ink"
                  }`}
                >
                  {isReceivable ? "+" : ""}
                  {formatIDR(item.remainingAmount > 0 ? item.remainingAmount : item.amount)}
                </span>
                <CaretRight size={16} weight="bold" className="shrink-0 text-ink-faint" />
              </Link>
            );
          })}
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* Filter khusus tagihan (P1-3) */}
      <BillFilterSheet
        open={billFilterOpen}
        onClose={() => setBillFilterOpen(false)}
        typeValue={billTypeFilter}
        statusValue={billStatusFilter}
        profileValue={billProfileFilter}
        onTypeChange={setBillTypeFilter}
        onStatusChange={setBillStatusFilter}
        onProfileChange={setBillProfileFilter}
      />

      {/* Buat tagihan / hutang / piutang (R07-A) */}
      <CreateBillSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); loadData(); }} />
    </div>
  );
}

function BillFilterSheet({
  open,
  onClose,
  typeValue,
  statusValue,
  profileValue,
  onTypeChange,
  onStatusChange,
  onProfileChange,
}: {
  open: boolean;
  onClose: () => void;
  typeValue: string;
  statusValue: string;
  profileValue: string;
  onTypeChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onProfileChange: (v: string) => void;
}) {
  const { data } = useApp();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter Tagihan"
      footer={
        <div className="flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onTypeChange("");
              onStatusChange("");
              onProfileChange("all");
              onClose();
            }}
          >
            Reset
          </Button>
          <Button fullWidth onClick={onClose}>
            Terapkan
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Jenis">
          <Select value={typeValue} onChange={(e) => onTypeChange(e.target.value)}>
            {billTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={statusValue} onChange={(e) => onStatusChange(e.target.value)}>
            {billStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Anggota">
          <Select value={profileValue} onChange={(e) => onProfileChange(e.target.value)}>
            <option value="all">Semua Anggota</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* CreateBillSheet — buat tagihan/hutang/piutang/cicilan (R07-A)        */
/* ------------------------------------------------------------------ */
function CreateBillSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data, sessionProfileId } = useApp();
  const toast = useToast();
  const [type, setType] = useState<"debt" | "receivable" | "regular" | "recurring" | "installment">("debt");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(0);
  const [counterparty, setCounterparty] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [ownerProfileId, setOwnerProfileId] = useState(sessionProfileId);
  const [notes, setNotes] = useState("");
  const [tenor, setTenor] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  const cats = data.categories.filter((c) => c.direction === "expense" || c.direction === "both");

  const save = async () => {
    if (!title.trim()) {
      toast.push("error", "Nama wajib diisi");
      return;
    }
    if (amount <= 0) {
      toast.push("error", "Nominal wajib lebih dari 0");
      return;
    }
    if (type === "installment" && (!tenor || Number(tenor) <= 0)) {
      toast.push("error", "Tenor cicilan wajib diisi");
      return;
    }
    if (type === "installment" && installmentAmount <= 0) {
      toast.push("error", "Nominal cicilan per bulan wajib diisi");
      return;
    }
    setSaving(true);
    try {
      await createBill({
        type,
        title: title.trim(),
        amount,
        counterparty: counterparty.trim() || undefined,
        dueDate: dueDate || null,
        dueDay: dueDay ? Number(dueDay) : null,
        categoryId: categoryId || null,
        ownerProfileId,
        notes: notes.trim(),
        tenor: type === "installment" ? Number(tenor) : null,
        installmentAmount: type === "installment" ? installmentAmount : null,
      });
      toast.push("success", type === "receivable" ? "Piutang dicatat" : type === "debt" ? "Hutang dicatat" : "Tagihan dibuat");
      onCreated();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal membuat tagihan");
    } finally {
      setSaving(false);
    }
  };

  const isDebtReceivable = type === "debt" || type === "receivable";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tambah Tagihan"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            <Plus size={16} weight="bold" /> {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Jenis">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="debt">Hutang — saya berutang</option>
            <option value="receivable">Piutang — orang berutang ke saya</option>
            <option value="regular">Tagihan Biasa</option>
            <option value="recurring">Tagihan Berulang</option>
            <option value="installment">Cicilan</option>
          </Select>
        </Field>
        <Field label="Nama">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isDebtReceivable ? "Contoh: Hutang Budi" : "Contoh: Listrik PLN"} />
        </Field>
        <Field label="Nominal">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
        {isDebtReceivable && (
          <Field label={type === "debt" ? "Kepada siapa" : "Dari siapa"}>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Contoh: Budi" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {type === "recurring" || type === "installment" ? (
            <Field label="Hari jatuh tempo">
              <Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="25" />
            </Field>
          ) : (
            <Field label="Tanggal jatuh tempo">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          )}
          <Field label="Anggota">
            <Select value={ownerProfileId} onChange={(e) => setOwnerProfileId(e.target.value)}>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Kategori (opsional)">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {type === "installment" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tenor (bulan)">
              <Input inputMode="numeric" value={tenor} onChange={(e) => setTenor(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="12" />
            </Field>
            <Field label="Cicilan per bulan">
              <AmountInput value={installmentAmount} onChange={setInstallmentAmount} compact showTerbilang={false} />
            </Field>
          </div>
        )}
        <Field label="Catatan (opsional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan" />
        </Field>
        <p className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-xs text-ink-muted">
          {type === "receivable"
            ? "Saat dibayar, dana masuk ke wallet dan dicatat sebagai pemasukan (piutang)."
            : type === "debt"
              ? "Saat dibayar, dana keluar dari wallet dan dicatat sebagai pengeluaran (hutang)."
              : "Tagihan muncul di daftar dan siap dibayar dari menu Tagihan."}
        </p>
      </div>
    </Sheet>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "bad" | "warn" | "primary";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-brand-700 dark:text-brand-300";
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={"tnum mt-1 text-lg font-bold tracking-tight " + toneCls}>{value}</p>
      <p className="tnum text-xs text-ink-faint">{sub}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Kartu kredit section (Section 11)                                    */
/* ------------------------------------------------------------------ */
function CreditCardsSection({ reloadParent }: { reloadParent: () => void }) {
  const { data, addCreditCard, updateCreditCard, deleteCreditCard } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [statementDay, setStatementDay] = useState(5);
  const [dueDay, setDueDay] = useState(25);
  const [creditLimit, setCreditLimit] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, any>>({});

  useEffect(() => {
    let cancelled = false;
    getCreditCards()
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, any> = {};
        for (const c of res.creditCards) map[c.id] = c;
        setMetrics(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName(""); setIssuer(""); setLastFour("");
    setStatementDay(5); setDueDay(25); setCreditLimit(0);
    setOpen(true);
  };

  const openEdit = (c: CreditCard) => {
    setEditing(c);
    setName(c.name); setIssuer(c.issuer); setLastFour(c.lastFour);
    setStatementDay(c.statementDay); setDueDay(c.dueDay); setCreditLimit(c.creditLimit);
    setOpen(true);
  };

  const save = () => {
    if (!name.trim()) {
      toast.push("error", "Nama kartu wajib diisi");
      return;
    }
    const input = {
      name: name.trim(),
      issuer: issuer.trim(),
      lastFour: lastFour.trim(),
      statementDay,
      dueDay,
      creditLimit,
    };
    if (editing) {
      updateCreditCard(editing.id, input);
      toast.push("success", "Kartu kredit diperbarui");
    } else {
      addCreditCard(input);
      toast.push("success", "Kartu kredit ditambahkan");
    }
    setOpen(false);
    reloadParent();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCreditCard(deleteTarget);
      toast.push("success", "Kartu kredit dihapus");
      reloadParent();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Gagal menghapus kartu");
    }
    setDeleteTarget(null);
  };

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Kartu Kredit</p>
          <p className="mt-0.5 text-xs text-ink-muted">Kartu yang bisa dipilih saat transaksi memakai metode Credit Card.</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus size={15} weight="bold" /> Kartu
        </Button>
      </div>

      {data.creditCards.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-ink-muted">
          Belum ada kartu kredit. Tambahkan kartu agar bisa dipilih di form Tambah Transaksi.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {data.creditCards.map((c) => {
            const m = metrics[c.id];
            return (
              <li key={c.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    <CreditCardIcon size={20} weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.name}
                      {c.lastFour ? ` •••• ${c.lastFour}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {c.issuer || "Umum"} · jatuh tempo tgl {c.dueDay}
                    </p>
                  </div>
                  <button
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
                  >
                    <PencilSimple size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    aria-label={`Hapus ${c.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                  >
                    <Trash size={16} />
                  </button>
                </div>
                {m && (
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-xs sm:grid-cols-5">
                    <div>
                      <p className="text-ink-muted">Outstanding</p>
                      <p className="tnum mt-0.5 font-bold text-rose-600 dark:text-rose-400">{formatIDR(m.currentOutstanding)}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">Sudah Ditagih</p>
                      <p className="tnum mt-0.5 font-bold text-ink">{formatIDR(m.billedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">Belum Ditagih</p>
                      <p className="tnum mt-0.5 font-bold text-ink">{formatIDR(m.unbilledAmount)}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">Kredit Tersedia</p>
                      <p className="tnum mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(m.availableCredit)}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted">Komitmen Cicilan</p>
                      <p className="tnum mt-0.5 font-bold text-amber-600 dark:text-amber-400">{formatIDR(m.futureInstallmentCommitment)}</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? "Edit Kartu Kredit" : "Tambah Kartu Kredit"}>
        <div className="space-y-3">
          <Field label="Nama kartu">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: BCA Card" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Penerbit (opsional)">
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Contoh: BCA" />
            </Field>
            <Field label="4 digit akhir">
              <Input
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="8842"
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal statement">
              <Input type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(Number(e.target.value))} />
            </Field>
            <Field label="Jatuh tempo">
              <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Limit kredit (opsional)">
            <AmountInput value={creditLimit} onChange={setCreditLimit} />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={save}>
              {editing ? "Simpan" : "Tambah"}
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus kartu kredit?"
        body="Kartu yang masih dipakai transaksi atau tagihan tidak dapat dihapus."
        confirmLabel="Hapus"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Detail tagihan (Section 8, 9, 10, 12, 13)                           */
/* ------------------------------------------------------------------ */
export function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data } = useApp();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UnifiedBillDetailResponse | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [txDetailId, setTxDetailId] = useState<string | null>(null);

  const loadDetail = () => {
    if (!id) return;
    setLoading(true);
    getUnifiedBillDetail(id)
      .then((res) => {
        setDetail(res);
      })
      .catch((e) => {
        toast.push("error", e instanceof Error ? e.message : "Gagal memuat detail tagihan");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Memuat detail tagihan..." />
      </div>
    );
  }

  if (!detail || !detail.item) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Tagihan tidak ditemukan" />
        <Button variant="secondary" onClick={() => navigate("/bills")}>
          Kembali ke Tagihan
        </Button>
      </div>
    );
  }

  const { item, history } = detail;
  const stInfo = unifiedStatusInfo(item.status);
  const owner = memberById(data, item.ownerProfileId ?? "");
  const cat = item.categoryId ? categoryById(data, item.categoryId) : null;
  const remaining = item.remainingAmount;
  const canPay = remaining > 0;

  const isInstallment = item.domainType === "installment";
  const isStatement = item.domainType === "credit_card_statement";
  const isDebt = item.domainType === "debt";
  const isReceivable = item.domainType === "receivable";

  const instMeta = item.metadata as {
    installmentId?: string;
    totalAmount?: number;
    installmentAmount?: number;
    tenor?: number;
    paidCount?: number;
    paidAmount?: number;
    progressText?: string;
  };

  const stmtMeta = item.metadata as {
    cardName?: string;
    lastFour?: string;
    statementStatus?: string;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="flex items-center gap-2">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                  isReceivable
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                }`}
              >
                {billIconByDomain(item.domainType, 22)}
              </span>
              <span>
                <span className="block text-lg font-bold tracking-tight text-ink">{item.title}</span>
                <span className="text-xs text-ink-muted">
                  {unifiedDomainLabel(item.domainType)}
                  {owner ? ` · ${owner.name}` : ""}
                </span>
              </span>
            </span>
          </div>
          <Badge variant={stInfo.variant}>{stInfo.label}</Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Total Tagihan" value={formatIDR(item.amount)} />
          <Stat label="Sudah Dibayar" value={formatIDR(item.paidAmount)} />
          <Stat
            label="Sisa Kewajiban"
            value={formatIDR(remaining)}
            tone={remaining > 0 ? (isReceivable ? "good" : "bad") : "good"}
          />
        </div>

        {/* Progress Cicilan (Section 9) */}
        {isInstallment && instMeta.tenor && (
          <div className="mt-5 rounded-xl border border-slate-100 bg-canvas p-4 dark:border-slate-800">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink">Progress Cicilan</span>
              <span className="tnum font-bold text-brand-600 dark:text-brand-400">
                {instMeta.paidCount}/{instMeta.tenor} Bulan
              </span>
            </div>
            <ProgressBar pct={((instMeta.paidCount ?? 0) / instMeta.tenor) * 100} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted">
              <div>Nominal per bulan: <span className="tnum font-semibold text-ink">{formatIDR(instMeta.installmentAmount ?? 0)}</span></div>
              <div>Pembayaran parsial periode ini: <span className="tnum font-semibold text-ink">{formatIDR(instMeta.paidAmount ?? 0)}</span></div>
            </div>
          </div>
        )}

        <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
          <D label="Jatuh Tempo" value={item.dueDate ? fmtDateID(item.dueDate) : item.dueDay != null ? `Tgl ${item.dueDay}` : "—"} />
          {cat && <D label="Kategori" value={cat.name} />}
          {Boolean(item.metadata.counterparty) && <D label="Pihak Terkait" value={String(item.metadata.counterparty)} />}
          {Boolean(item.metadata.frequency) && <D label="Frekuensi" value={String(item.metadata.frequency)} />}
          {Boolean(item.metadata.lastPaidPeriod) && <D label="Periode Terakhir Dibayar" value={String(item.metadata.lastPaidPeriod)} />}
          {Boolean(item.metadata.notes) && <D label="Catatan" value={String(item.metadata.notes)} />}
        </dl>

        {canPay && (
          <div className="mt-6 flex flex-col gap-2.5">
            <Button className="w-full" size="lg" onClick={() => setPayOpen(true)}>
              <Lightning size={18} weight="fill" />
              {isStatement
                ? "Bayar Tagihan Kartu Kredit"
                : isInstallment
                  ? "Bayar Cicilan Periode Ini"
                  : isDebt
                    ? "Bayar Hutang"
                    : isReceivable
                      ? "Terima Pembayaran Piutang"
                      : "Bayar Tagihan"}
            </Button>
            {isInstallment && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  const w = walletVisible(data, item.ownerProfileId ?? "all")[0];
                  if (!w) {
                    toast.push("error", "Tidak ada wallet yang tersedia");
                    return;
                  }
                  try {
                    await payInstallmentFull(item.sourceId, { walletId: w.id });
                    toast.push("success", "Sisa cicilan berhasil dilunasi!");
                    loadDetail();
                  } catch (e) {
                    toast.push("error", e instanceof Error ? e.message : "Gagal melunasi cicilan");
                  }
                }}
              >
                Lunasi Sisa Cicilan
              </Button>
            )}
          </div>
        )}
        {!canPay && (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <Check size={16} weight="bold" /> Kewajiban Lunas
          </div>
        )}
      </Card>

      {/* Section 12 — Detail Statement Kartu Kredit + Transaksi Penyusun */}
      {isStatement && item.statementId && (
        <StatementItemsSection
          statementId={item.statementId}
          cardName={stmtMeta.cardName}
          lastFour={stmtMeta.lastFour}
          onSelectTx={(txId) => setTxDetailId(txId)}
        />
      )}

      {/* Riwayat Pembayaran Tagihan */}
      {history.length > 0 && (
        <Card className="mt-4">
          <p className="mb-3 text-sm font-semibold text-ink">Riwayat Pembayaran</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="block font-medium text-ink">{h.merchant || "Pembayaran"}</span>
                  <span className="text-xs text-ink-muted">{fmtDateID(h.occurredAt)}</span>
                </div>
                <span className="tnum font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatIDR(h.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sheet Pembayaran */}
      <PaymentSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={isReceivable ? `Terima Pembayaran ${item.title}` : `Bayar ${item.title}`}
        defaultAmount={isInstallment ? (instMeta.installmentAmount ?? remaining) : remaining}
        maxAmount={remaining}
        fullOption={isInstallment}
        isStatement={isStatement}
        confirmLabel={isReceivable ? "Terima Pembayaran" : "Bayar"}
        directionHint={
          isReceivable
            ? "Anda menerima pembayaran piutang — dana masuk ke wallet yang dipilih."
            : isDebt
              ? "Anda membayar hutang — dana keluar dari wallet yang dipilih."
              : undefined
        }
        onPay={async (walletId, amount, method, full) => {
          try {
            if (isStatement && item.statementId) {
              // Statement (baik terhubung bill maupun sintesis) dibayar via
              // endpoint statement — bukan /api/bills/:id/pay (yang hanya membaca tabel bills).
              await payCreditCardStatement(item.statementId, { amount, walletId });
            } else {
              await payBill(item.sourceId, { amount, walletId, method, full });
            }
            toast.push("success", isStatement ? "Statement kartu kredit dibayar" : isReceivable ? "Pembayaran piutang diterima" : "Pembayaran berhasil");
            setPayOpen(false);
            loadDetail();
          } catch (e) {
            toast.push("error", e instanceof Error ? e.message : "Gagal memproses pembayaran");
          }
        }}
      />

      <TransactionDetailSheet transactionId={txDetailId} onClose={() => setTxDetailId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component Detail Item Statement (Section 12 & 13)                    */
/* ------------------------------------------------------------------ */
function StatementItemsSection({
  statementId,
  cardName,
  lastFour,
  onSelectTx,
}: {
  statementId: string;
  cardName?: string;
  lastFour?: string;
  onSelectTx: (txId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [stmtData, setStmtData] = useState<{ statement: any; items: any[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCreditCardStatementDetail(statementId)
      .then((res) => {
        if (!cancelled && res.statement) setStmtData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statementId]);

  if (loading) return <Card className="mt-4 p-4 text-sm text-ink-muted">Memuat transaksi statement...</Card>;
  if (!stmtData) return null;

  const { statement, items } = stmtData;
  const stmtInfo = unifiedStatusInfo(statement.status === "open" ? "open" : statement.status === "issued" ? "issued" : statement.status === "overdue" ? "overdue" : "paid");

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <p className="text-sm font-bold text-ink">Detail Statement Kartu Kredit</p>
          <p className="text-xs text-ink-muted">
            {cardName || "Kartu Kredit"} {lastFour ? `•••• ${lastFour}` : ""} · Periode: {fmtDateID(statement.periodStart)} – {fmtDateID(statement.periodEnd)}
          </p>
        </div>
        <Badge variant={stmtInfo.variant}>{stmtInfo.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-xs sm:grid-cols-4">
        <div>Total (derived): <span className="tnum block font-bold text-ink">{formatIDR(statement.derivedAmount)}</span></div>
        <div>Total Official: <span className="tnum block font-bold text-ink">{statement.officialAmount != null ? formatIDR(statement.officialAmount) : "–"}</span></div>
        <div>Sudah Dibayar: <span className="tnum block font-bold text-emerald-600 dark:text-emerald-400">{formatIDR(statement.paidAmount)}</span></div>
        <div>Sisa Statement: <span className="tnum block font-bold text-rose-600 dark:text-rose-400">{formatIDR(statement.remainingAmount)}</span></div>
      </div>

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-ink-muted">TRANSAKSI PENYUSUN</p>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-ink-muted">Belum ada item transaksi pada statement ini.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it: any) => (
            <button
              key={it.id}
              onClick={() => {
                if (it.transactionId) onSelectTx(it.transactionId);
              }}
              className="flex w-full items-center justify-between py-2.5 text-left text-sm hover:bg-canvas/60"
            >
              <div>
                <span className="block font-medium text-ink">{it.merchant}</span>
                <span className="text-xs text-ink-muted">{fmtDateID(it.occurredAt)} · {statementItemTypeLabel(it.itemType)}</span>
              </div>
              <span className="tnum font-semibold text-ink">{formatIDR(it.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
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

function D({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="truncate text-right text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Payment sheet (Section 8, 9, 10, 12)                                */
/* ------------------------------------------------------------------ */
function PaymentSheet({
  open,
  onClose,
  title,
  defaultAmount,
  maxAmount,
  fullOption,
  isStatement,
  confirmLabel,
  directionHint,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultAmount: number;
  maxAmount: number;
  fullOption?: boolean;
  isStatement: boolean;
  confirmLabel?: string;
  directionHint?: string;
  onPay: (walletId: string, amount: number, method: PaymentMethod | null, full?: boolean) => void;
}) {
  const { data, activeProfileId } = useApp();
  const toast = useToast();
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [full, setFull] = useState(false);
  const wallets = walletVisible(data, activeProfileId);

  useEffect(() => {
    setAmount(defaultAmount);
  }, [defaultAmount]);

  const submit = () => {
    if (!walletId || amount <= 0) {
      toast.push("error", "Pilih wallet dan nominal pembayaran");
      return;
    }
    onPay(walletId, amount, method || null, full);
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
            <Lightning size={16} weight="fill" /> {confirmLabel ?? "Bayar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {directionHint && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-xs font-medium text-brand-700 dark:bg-brand-950/15 dark:text-brand-300">
            <ArrowUpRight size={14} className="mt-0.5 shrink-0" weight="bold" />
            {directionHint}
          </p>
        )}
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
          <AmountInput
            value={amount}
            onChange={(n) => {
              setAmount(n);
              // P1-5: mengubah nominal setelah memilih "Lunasi sisa" membatalkan mode full.
              if (full && n !== maxAmount) setFull(false);
            }}
          />
          <div className="mt-2 flex gap-2">
            {fullOption && (
              <button
                onClick={() => {
                  setAmount(maxAmount);
                  setFull(true);
                }}
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              >
                Lunasi sisa ({formatIDR(maxAmount)})
              </button>
            )}
            <button
              onClick={() => {
                setAmount(defaultAmount);
                setFull(false);
              }}
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
