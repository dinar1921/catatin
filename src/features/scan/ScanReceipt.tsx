import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Warning, UploadSimple, ArrowLeft, X } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { expenseCats } from "../../lib/derive";
import { todayISO } from "../../lib/dates";
import { Button, Input, Select, Skeleton, useToast } from "../../components/ui";
import type { Attachment } from "../../lib/types";

type Step = "upload" | "processing" | "review";

export function ScanReceiptPage() {
  const navigate = useNavigate();
  const { data, addTransaction } = useApp();
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // hasil ekstraksi (mock — field ragu diberi indikator, bukan confidence)
  const [merchant, setMerchant] = useState("Superindo");
  const [amount, setAmount] = useState(350000);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("c-belanja");
  const [walletId, setWalletId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const uncertain = useRef<string[]>(["walletId", "paymentMethod"]);

  useEffect(() => {
    if (step === "processing") {
      const t = setTimeout(() => setStep("review"), 1400);
      return () => clearTimeout(t);
    }
  }, [step]);

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
      setStep("processing");
    };
    reader.readAsDataURL(f);
  };

  const approve = () => {
    if (!attachment || amount <= 0 || !categoryId || !walletId) {
      toast.push("error", "Lengkapi wallet dan nominal sebelum menyetujui");
      return;
    }
    addTransaction({
      type: "expense",
      amount,
      categoryId,
      walletId,
      paymentMethod: (paymentMethod || null) as never,
      creditCardId: null,
      occurredAt,
      merchant,
      description: "Hasil scan struk",
      ownerProfileId: "p-dinar",
      attachment,
      source: "receipt_ocr",
      bill: null,
    });
    toast.push("success", "Transaksi dari struk disimpan");
    navigate("/transactions");
  };

  const cats = expenseCats(data);

  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <h1 className="text-xl font-extrabold tracking-tight text-ink lg:text-2xl">Scan Struk</h1>
      <p className="mt-0.5 text-sm text-ink-muted">Foto struk, AI akan mengekstrak datanya untuk kamu periksa.</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Kiri / atas: foto struk */}
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Foto struk</p>
          {!attachment ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-primary-600/50"
            >
              <Camera size={36} className="text-ink-faint" />
              <span className="text-sm font-semibold text-ink-muted">Ambil foto / pilih gambar</span>
              <span className="text-xs text-ink-faint">Gambar dikompres sebelum disimpan</span>
            </button>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
              <img src={attachment.dataUrl} alt={attachment.fileName} className="max-h-[420px] w-full bg-canvas object-contain" />
              <div className="flex items-center justify-between border-t border-slate-200/80 dark:border-slate-800 px-3 py-2">
                <span className="truncate text-xs font-medium text-ink-muted">{attachment.fileName}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    Ganti
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAttachment(null);
                      setStep("upload");
                    }}
                    className="text-rose-600 dark:text-rose-400"
                  >
                    <X size={14} /> Hapus
                  </Button>
                </div>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {/* Kanan / bawah: hasil ekstraksi */}
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Hasil ekstraksi</p>
          {step === "upload" ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
              <UploadSimple size={28} className="text-ink-faint" />
              <p className="text-sm font-semibold text-ink-muted">Upload struk untuk mulai</p>
              <p className="max-w-xs text-xs text-ink-faint">1 struk = 1 transaksi. Hasil AI selalu melalui validasi sebelum disimpan.</p>
            </div>
          ) : step === "processing" ? (
            <div className="space-y-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary-600" />
                AI sedang membaca struk…
              </p>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-2/3" />
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Ekstraksi selesai</span>
                <span className="text-[11px] text-ink-faint">Field yang diragukan ditandai</span>
              </div>
              <UncertainField label="Merchant" uncertain={uncertain.current.includes("merchant")}>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </UncertainField>
              <UncertainField label="Tanggal" uncertain={uncertain.current.includes("occurredAt")}>
                <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </UncertainField>
              <UncertainField label="Total" uncertain={uncertain.current.includes("amount")}>
                <input
                  inputMode="numeric"
                  value={amount === 0 ? "" : amount.toLocaleString("id-ID")}
                  onChange={(e) => setAmount(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
                  className="tnum h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-ink"
                />
              </UncertainField>
              <UncertainField label="Kategori" uncertain={false}>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </UncertainField>
              <UncertainField label="Wallet" uncertain={uncertain.current.includes("walletId")}>
                <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                  <option value="">Pilih wallet</option>
                  {data.wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </UncertainField>
              <UncertainField label="Metode pembayaran" uncertain={uncertain.current.includes("paymentMethod")}>
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="">Tidak tahu</option>
                  <option value="Cash">Cash</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Credit Card">Credit Card</option>
                </Select>
              </UncertainField>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-200/80 dark:border-slate-800 pt-4">
                <Button variant="secondary" onClick={() => setStep("upload")}>
                  Batal
                </Button>
                <Button onClick={approve}>
                  <Check size={16} weight="bold" /> Review & Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UncertainField({
  label,
  uncertain,
  children,
}: {
  label: string;
  uncertain: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        {label}
        {uncertain && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            <Warning size={10} weight="fill" /> cek lagi
          </span>
        )}
      </p>
      {children}
    </div>
  );
}
