import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Warning, UploadSimple, ArrowLeft, X } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { expenseCats } from "../../lib/derive";
import { todayISO } from "../../lib/dates";
import { Button, Input, Select, Skeleton, AmountInput, Badge, Card, useToast } from "../../components/ui";
import { uploadReceipt } from "../../lib/api";
import type { Attachment } from "../../lib/types";

type Step = "upload" | "processing" | "review";

export function ScanReceiptPage() {
  const navigate = useNavigate();
  const { data, approveDraft } = useApp();
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Saat masuk review, scroll ke hasil ekstraksi (di mobile hasil berada di bawah foto).
  useEffect(() => {
    if (step === "review") {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [step]);

  // hasil ekstraksi (field ragu diberi indikator)
  const [merchant, setMerchant] = useState("Superindo");
  const [amount, setAmount] = useState(350000);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("c-belanja");
  const [walletId, setWalletId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const uncertain = useRef<string[]>(["walletId", "paymentMethod"]);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setUploadError(null);
    setDraftId(null);
    // Preview instan via object URL — tampil seketika, tidak menunggu pembacaan file.
    const objectUrl = URL.createObjectURL(f);
    setAttachment({
      id: `att-${Date.now()}`,
      fileName: f.name,
      mimeType: f.type || "image/jpeg",
      dataUrl: objectUrl,
    });
    setStep("processing");
    void startUpload(f);
  };

  const startUpload = async (file: File) => {
    try {
      const res = await uploadReceipt(file);
      setDraftId(res.id);
      const ext = res.extracted ?? {};
      // Mode heuristic: AI belum membaca isi struk otomatis. Isi merchant dari nama file,
      // biarkan field lain kosong agar user mengisi lalu menyetujui.
      const merchantFromFile = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Merchant";
      setMerchant(ext.merchant && ext.merchant !== "Merchant Contoh" ? ext.merchant : merchantFromFile);
      setAmount(ext.amount || 0);
      setOccurredAt(ext.occurredAt || todayISO());
      setCategoryId("");
      setWalletId("");
      setPaymentMethod("");
      uncertain.current = [...(ext.uncertainFields ?? []), "categoryId", "walletId"];
      setStep("review");
    } catch (e) {
      console.error("[scan] upload error:", e);
      setUploadError(e instanceof Error ? e.message : "Upload gagal");
      setStep("review");
    }
  };

  const retry = () => {
    setStep("upload");
    setAttachment(null);
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const approve = () => {
    if (!draftId) {
      toast.push("error", "Upload struk belum selesai");
      return;
    }
    if (amount <= 0 || !categoryId || !walletId) {
      toast.push("error", "Lengkapi wallet dan nominal sebelum menyetujui");
      return;
    }
    approveDraft(draftId, {
      merchant,
      amount,
      categoryId,
      walletId,
      occurredAt,
    });
    toast.push("success", "Transaksi dari struk disimpan");
    navigate("/transactions");
  };

  const cats = expenseCats(data);

  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Scan Struk</h1>
      <p className="mt-1 text-sm text-ink-muted">Foto struk, AI akan mengekstrak datanya untuk kamu periksa.</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Kiri / atas: foto struk */}
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Foto struk</p>
          {!attachment ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white shadow-card dark:bg-slate-900 hover:border-brand-600/50"
            >
              <Camera size={36} className="text-ink-faint" weight="duotone" />
              <span className="text-sm font-semibold text-ink-muted">Ambil foto / pilih gambar</span>
              <span className="text-xs text-ink-faint">Gambar dikompres sebelum disimpan</span>
            </button>
          ) : (
            <Card padded={false}>
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
                    <X size={14} weight="bold" /> Hapus
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {/* Kanan / bawah: hasil ekstraksi */}
        <div ref={resultRef}>
          <p className="mb-2 text-sm font-semibold text-ink">Hasil ekstraksi</p>
          {step === "upload" ? (
            <Card className="flex aspect-[4/3] flex-col items-center justify-center text-center">
              <UploadSimple size={28} className="text-ink-faint" weight="duotone" />
              <p className="mt-2 text-sm font-semibold text-ink-muted">Upload struk untuk mulai</p>
              <p className="mt-0.5 max-w-xs text-xs text-ink-faint">1 struk = 1 transaksi. Hasil AI selalu melalui validasi sebelum disimpan.</p>
            </Card>
          ) : step === "processing" ? (
            <Card className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
                AI sedang membaca struk…
              </p>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-2/3" />
            </Card>
          ) : (
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="income">Ekstraksi selesai</Badge>
                <span className="text-xs text-ink-faint">Field yang diragukan ditandai</span>
              </div>
              <div className="rounded-xl bg-canvas p-3 text-xs text-ink-muted">
                AI (mode heuristic) belum membaca isi struk secara otomatis. Periksa & isi data di bawah, lalu setujui.
              </div>
              {uploadError && (
                <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
                  <div className="flex items-start gap-2">
                    <Warning size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" weight="fill" />
                    <div className="text-xs text-rose-600 dark:text-rose-400">
                      <p className="font-semibold">Upload gagal: {uploadError}</p>
                      <p className="mt-0.5">Periksa file (JPG/PNG/WEBP, maks 5MB) atau isi manual lalu setujui.</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={retry}>Coba lagi</Button>
                </div>
              )}
              <UncertainField label="Merchant" uncertain={uncertain.current.includes("merchant")}>
                <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </UncertainField>
              <UncertainField label="Tanggal" uncertain={uncertain.current.includes("occurredAt")}>
                <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </UncertainField>
              <UncertainField label="Total" uncertain={uncertain.current.includes("amount")}>
                <AmountInput value={amount} onChange={setAmount} />
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
            </Card>
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
          <Badge variant="warning" className="px-1.5 py-0.5">
            <Warning size={10} weight="fill" /> cek lagi
          </Badge>
        )}
      </p>
      {children}
    </div>
  );
}
