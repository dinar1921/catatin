import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trash, ArrowLeft, UploadSimple } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import type { NewBillInput } from "../../lib/types";
import { expenseCats, incomeCats } from "../../lib/derive";
import { todayISO } from "../../lib/dates";
import { AmountInput, Button, Card, Field, Input, Select, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import type { Attachment, PaymentMethod, TransactionType } from "../../lib/types";

export function AddTransactionPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "scan" ? "scan" : "manual";

  if (mode === "scan") {
    return <ScanRedirect />;
  }

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <PageHeader title="Tambah Transaksi" subtitle="Catat pemasukan atau pengeluaran" />
      <ManualForm />
    </div>
  );
}

function ScanRedirect() {
  const navigate = useNavigate();
  navigate("/scan", { replace: true });
  return null;
}

/* ------------------------------------------------------------------ */
/* Manual form                                                         */
/* ------------------------------------------------------------------ */
type BillOption = "none" | "regular" | "recurring" | "installment";

function ManualForm() {
  const { data, sessionProfileId, addTransaction } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [ownerProfileId, setOwnerProfileId] = useState(sessionProfileId);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [creditCardId, setCreditCardId] = useState("");
  const [billOption, setBillOption] = useState<BillOption>("none");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // field tagihan dinamis
  const [billTitle, setBillTitle] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [frequency, setFrequency] = useState("bulanan");
  const [tenor, setTenor] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState(0);

  const cats = useMemo(() => (type === "income" ? incomeCats(data) : expenseCats(data)), [data, type]);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        id: `att-${Date.now()}`,
        fileName: f.name,
        mimeType: f.type || "image/jpeg",
        dataUrl: String(reader.result),
      });
    };
    reader.readAsDataURL(f);
  };

  const fileRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (amount <= 0) e.amount = "Nominal harus lebih dari 0";
    if (!categoryId) e.categoryId = "Pilih kategori";
    if (!walletId) e.walletId = "Pilih wallet";
    if (paymentMethod === "Credit Card" && !creditCardId) e.creditCardId = "Pilih kartu kredit";
    if (billOption === "installment" && (!tenor || Number(tenor) <= 0)) e.tenor = "Tenor harus diisi";
    if (billOption === "installment" && installmentAmount <= 0) e.installmentAmount = "Nominal cicilan harus diisi";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) {
      toast.push("error", "Periksa kembali isian form");
      return;
    }
    let bill: NewBillInput | null = null;
    if (billOption !== "none") {
      bill = {
        kind: billOption,
        amount: billOption === "installment" ? amount : amount,
        dueDay: dueDay ? Number(dueDay) : null,
        dueDate: null,
        frequency: billOption === "recurring" ? frequency : null,
        tenor: billOption === "installment" ? Number(tenor) : null,
        installmentAmount: billOption === "installment" ? installmentAmount : null,
        title: billTitle || merchant || "Tagihan",
      };
    }
    addTransaction({
      type,
      amount,
      categoryId,
      walletId,
      paymentMethod: paymentMethod || null,
      creditCardId: paymentMethod === "Credit Card" ? creditCardId : null,
      occurredAt,
      merchant: merchant || "Tanpa merchant",
      description,
      ownerProfileId,
      attachment,
      bill,
    });
    toast.push("success", billOption !== "none" ? "Transaksi dan tagihan disimpan" : "Transaksi disimpan");
    navigate("/transactions");
  };

  return (
    <Card className="space-y-5">
      {/* Tipe */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setType("expense");
            setCategoryId("");
          }}
          className={
            type === "expense"
              ? "rounded-xl border-2 border-expense bg-rose-50 dark:bg-rose-950 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-400"
              : "rounded-xl border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-sm font-semibold text-ink-muted hover:border-slate-300 dark:border-slate-600"
          }
        >
          Pengeluaran
        </button>
        <button
          onClick={() => {
            setType("income");
            setCategoryId("");
          }}
          className={
            type === "income"
              ? "rounded-xl border-2 border-income bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
              : "rounded-xl border border-slate-200/80 dark:border-slate-800 px-4 py-3 text-sm font-semibold text-ink-muted hover:border-slate-300 dark:border-slate-600"
          }
        >
          Pemasukan
        </button>
      </div>

      <Field label="Nominal" error={errors.amount}>
        <AmountInput value={amount} onChange={setAmount} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategori" error={errors.categoryId}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Pilih kategori</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Wallet" error={errors.walletId}>
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">Pilih wallet</option>
            {data.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Kaitkan tagihan? — trigger deterministik form dinamis (PRD §8.2) */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Kaitkan tagihan?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { id: "none", label: "Tidak" },
              { id: "regular", label: "Tagihan biasa" },
              { id: "recurring", label: "Tagihan berulang" },
              { id: "installment", label: "Cicilan" },
            ] as { id: BillOption; label: string }[]
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setBillOption(o.id)}
              className={
                billOption === o.id
                  ? "rounded-xl border-2 border-brand-600 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 dark:bg-brand-950/15 dark:text-brand-300"
                  : "rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2 text-xs font-semibold text-ink-muted hover:border-slate-300 dark:border-slate-600"
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {billOption !== "none" && (
        <div className="space-y-4 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/15">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            Form tagihan {billOption === "regular" ? "biasa" : billOption === "recurring" ? "berulang" : "cicilan"}
          </p>
          <Field label="Nama tagihan">
            <Input value={billTitle} onChange={(e) => setBillTitle(e.target.value)} placeholder="Contoh: Netflix, Cicilan Motor" />
          </Field>
          {billOption === "recurring" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jatuh tempo (tanggal)">
                <Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="15" />
              </Field>
              <Field label="Frekuensi">
                <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="bulanan">Bulanan</option>
                  <option value="mingguan">Mingguan</option>
                </Select>
              </Field>
            </div>
          )}
          {billOption === "installment" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tenor (bulan)" error={errors.tenor}>
                  <Input inputMode="numeric" value={tenor} onChange={(e) => setTenor(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="24" />
                </Field>
                <Field label="Hari jatuh tempo">
                  <Input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="25" />
                </Field>
              </div>
              <Field label="Nominal cicilan per bulan" error={errors.installmentAmount}>
                <AmountInput value={installmentAmount} onChange={setInstallmentAmount} showTerbilang={false} compact />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal">
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
        <Field label="Atas nama">
          <Select value={ownerProfileId} onChange={(e) => setOwnerProfileId(e.target.value)}>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Merchant">
        <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Contoh: Superindo" />
      </Field>
      <Field label="Deskripsi">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan (opsional)" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Metode pembayaran">
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}>
            <option value="">Tidak memilih</option>
            <option value="Cash">Cash</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Credit Card">Credit Card</option>
            <option value="Transfer">Transfer</option>
          </Select>
        </Field>
        {paymentMethod === "Credit Card" && (
          <Field label="Kartu kredit" error={errors.creditCardId}>
            <Select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
              <option value="">Pilih kartu kredit</option>
              {data.creditCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} •{c.lastFour}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {/* Upload struk: placeholder → preview (PRD §9.1) */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Foto struk (opsional)</p>
        {!attachment ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-canvas/50 px-4 py-8 text-center hover:border-brand-600/50"
          >
            <UploadSimple size={24} className="text-ink-faint" weight="duotone" />
            <span className="text-sm font-semibold text-ink-muted">Pilih foto struk</span>
            <span className="text-xs text-ink-faint">JPG/PNG, maks 5MB</span>
          </button>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800">
            <img src={attachment.dataUrl} alt={attachment.fileName} className="mx-auto max-h-56 max-w-full bg-canvas object-contain" />
            <div className="flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
              <span className="truncate text-xs font-medium text-ink-muted">{attachment.fileName}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  Ganti
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAttachment(null)} className="text-rose-600 dark:text-rose-400">
                  <Trash size={14} weight="bold" /> Hapus
                </Button>
              </div>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-200/80 dark:border-slate-800 pt-4">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Batal
        </Button>
        <Button onClick={save}>Simpan Transaksi</Button>
      </div>

      {/* Merchant memory hint (PRD §8.5) */}
      {merchant && (
        <MerchantHint merchant={merchant} onPick={(c) => setCategoryId(c)} />
      )}
    </Card>
  );
}

function MerchantHint({ merchant, onPick }: { merchant: string; onPick: (categoryId: string) => void }) {
  const { data } = useApp();
  const history = useMemo(() => {
    const map = new Map<string, { id: string; count: number }>();
    for (const t of data.transactions) {
      if (!t.merchant.toLowerCase().includes(merchant.toLowerCase())) continue;
      const cur = map.get(t.categoryId) ?? { id: t.categoryId, count: 0 };
      cur.count += 1;
      map.set(t.categoryId, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, name: data.categories.find((c) => c.id === id)?.name ?? "", count: v.count }))
      .filter((x) => x.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);
  }, [data, merchant]);

  if (history.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2.5">
      <span className="text-xs font-semibold text-ink-muted">Sering dipakai untuk merchant ini:</span>
      {history.map((h) => (
        <button
          key={h.id}
          onClick={() => onPick(h.id)}
          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-slate-200 hover:ring-brand-600/40 dark:bg-slate-900 dark:text-brand-300 dark:ring-slate-700"
        >
          {h.name}
        </button>
      ))}
    </div>
  );
}
