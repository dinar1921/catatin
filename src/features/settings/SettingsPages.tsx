import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CaretRight,
  Key,
  TelegramLogo,
  ChatCircle,
  Robot,
  Tag,
  Wallet as WalletIcon,
  Trash,
} from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { Button, Card, Field, Input, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";

export function SettingsPage() {
  const { data, resetData } = useApp();
  const toast = useToast();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" />
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        <MenuLink to="/settings/categories" icon={<Tag size={18} />} label="Kategori" sub={`${data.categories.length} kategori`} />
        <MenuLink to="/settings/wallets" icon={<WalletIcon size={18} />} label="Wallet" sub={`${data.wallets.length} wallet`} />
        <MenuLink to="/settings/api" icon={<Key size={18} />} label="API Access / Hermes" />
        <MenuLink to="/settings/telegram" icon={<TelegramLogo size={18} />} label="Telegram" />
        <MenuLink to="/settings/whatsapp" icon={<ChatCircle size={18} />} label="WhatsApp" />
        <MenuLink to="/settings/ai-ocr" icon={<Robot size={18} />} label="AI / OCR Configuration" />
      </div>
      <div className="mt-4">
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            resetData();
            toast.push("success", "Data mock direset ke awal");
          }}
        >
          Reset Data Demo
        </Button>
        <p className="mt-2 text-center text-xs text-ink-faint">Mengembalikan semua data mock ke kondisi awal.</p>
      </div>
    </div>
  );
}

function MenuLink({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/60">
      <span className="text-ink-muted">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      {sub && <span className="text-xs text-ink-muted">{sub}</span>}
      <CaretRight size={14} className="text-ink-faint" />
    </Link>
  );
}

function Back({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => history.back()} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <PageHeader title={title} />
    </div>
  );
}

export function CategoriesSettingsPage() {
  const { data } = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"income" | "expense">("expense");

  return (
    <div>
      <Back title="Kategori" />
      <Card className="mx-auto max-w-xl p-5">
        <p className="mb-3 text-sm font-bold text-ink">Tambah kategori</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori" />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "income" | "expense")}
            className="h-11 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-sm text-ink"
          >
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
          <Button
            onClick={() => {
              if (!name.trim()) {
                toast.push("error", "Nama kategori wajib diisi");
                return;
              }
              toast.push("success", `Kategori "${name}" ditambahkan (mock)`);
              setName("");
            }}
          >
            Tambah
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.categories.map((c) => (
            <span key={c.id} className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-muted">
              {c.name} {c.direction === "income" ? "(pemasukan)" : ""}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function WalletsSettingsPage() {
  const { data } = useApp();
  return (
    <div>
      <Back title="Wallet" />
      <div className="mx-auto max-w-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        {data.wallets.map((w) => (
          <div key={w.id} className="flex items-center justify-between px-4 py-3.5 text-sm">
            <span className="font-semibold text-ink">{w.name}</span>
            <span className="text-xs text-ink-muted">{w.scope === "shared" ? "Shared" : "Personal"}</span>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-xl text-center text-xs text-ink-faint">Kelola wallet di menu Wallet.</p>
    </div>
  );
}

export function ApiSettingsPage() {
  const toast = useToast();
  const [key, setKey] = useState<string | null>(null);

  return (
    <div>
      <Back title="API Access / Hermes" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="p-5">
          <p className="text-sm font-bold text-ink">API key untuk Hermes</p>
          <p className="mt-1 text-xs text-ink-muted">
            Key ditampilkan penuh hanya sekali saat dibuat, tersimpan hashed, dan dapat di-revoke. Mutasi selalu melewati persetujuan.
          </p>
          {key ? (
            <div className="mt-3">
              <p className="tnum break-all rounded-xl bg-canvas p-3 font-mono text-xs text-ink">{key}</p>
              <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">Simpan sekarang — tidak akan ditampilkan lagi.</p>
            </div>
          ) : (
            <Button
              className="mt-3"
              onClick={() => {
                setKey("catatin_hk_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12));
              }}
            >
              <Key size={16} /> Buat API Key
            </Button>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-ink">Perilaku (mock Phase 1)</p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-muted">
            <li>• READ: saldo, transaksi, tagihan, laporan (scoped ke group).</li>
            <li>• WRITE: membuat draft yang menunggu persetujuan di Approval Inbox.</li>
            <li>• Rate limit & audit log aktif (backend Phase 2).</li>
          </ul>
          <Button variant="ghost" size="sm" className="mt-2 text-rose-600 dark:text-rose-400" onClick={() => toast.push("info", "Key di-revoke (mock)")}>
            <Trash size={14} /> Revoke key
          </Button>
        </Card>
      </div>
    </div>
  );
}

export function TelegramSettingsPage() {
  const toast = useToast();
  return (
    <div>
      <Back title="Telegram" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
            <TelegramLogo size={22} weight="duotone" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">Bot Catatin</p>
            <p className="text-xs text-ink-muted">Catat transaksi via chat, approval lewat tombol.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => toast.push("success", "Bot terhubung (mock)")}>
            Hubungkan
          </Button>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-bold text-ink">Contoh penggunaan</p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-xl rounded-tl-none bg-canvas p-3 text-ink-secondary">"beli makan 50rb"</div>
            <div className="rounded-xl rounded-tr-none bg-brand-50 dark:bg-brand-950 p-3 text-brand-800 dark:text-brand-200 dark:bg-brand-50 dark:bg-brand-950/15 dark:text-brand-200">
              Draft dibuat → cek di Approval Inbox → setujui.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function WhatsAppSettingsPage() {
  const toast = useToast();
  return (
    <div>
      <Back title="WhatsApp" />
      <div className="mx-auto max-w-xl">
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
            <ChatCircle size={22} weight="duotone" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">WhatsApp Business API</p>
            <p className="text-xs text-ink-muted">Meta Cloud API · verifikasi webhook di Phase 2.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => toast.push("success", "WhatsApp terhubung (mock)")}>
            Hubungkan
          </Button>
        </Card>
      </div>
    </div>
  );
}

export function AiOcrSettingsPage() {
  const toast = useToast();
  const [model, setModel] = useState("gemini-2.0-flash");
  return (
    <div>
      <Back title="AI / OCR Configuration" />
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="p-5">
          <Field label="Model OCR / Vision (default)">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm text-ink"
            >
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="claude-sonnet">Claude Sonnet</option>
            </select>
          </Field>
          <div className="mt-3 grid gap-2 text-xs text-ink-muted">
            <p>• Model dikonfigurasi terpisah: OCR, extraction, insight, agent.</p>
            <p>• Credential disimpan di server (secret manager), tidak pernah ke frontend.</p>
            <p>• Fallback & retry diaktifkan otomatis.</p>
          </div>
          <Button className="mt-4" onClick={() => toast.push("success", "Konfigurasi disimpan (mock)")}>
            Simpan
          </Button>
        </Card>
      </div>
    </div>
  );
}
