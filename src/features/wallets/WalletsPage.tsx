import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Wallet as WalletIcon, Users, User } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { memberById, walletBalance, walletVisible } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { fmtDayMonth } from "../../lib/dates";
import { Button, Card, EmptyState, Field, Input, Select, Sheet, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";

export function WalletsPage() {
  const { data, activeProfileId, addWallet } = useApp();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [ownerId, setOwnerId] = useState(activeProfileId === "all" ? data.members[0]?.id ?? "" : activeProfileId);

  const wallets = walletVisible(data, activeProfileId);
  const total = wallets.reduce((s, w) => s + walletBalance(data, w.id), 0);

  const save = () => {
    if (!name.trim()) {
      toast.push("error", "Nama wallet wajib diisi");
      return;
    }
    addWallet({ name: name.trim(), scope, ownerProfileId: scope === "personal" ? ownerId : null });
    toast.push("success", "Wallet ditambahkan");
    setAddOpen(false);
    setName("");
  };

  return (
    <div>
      <PageHeader
        title="Wallet"
        subtitle={`Total ${formatIDR(total)}`}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} weight="bold" /> Tambah Wallet
          </Button>
        }
      />

      {wallets.length === 0 ? (
        <Card>
          <EmptyState icon={<WalletIcon size={40} />} title="Belum ada wallet" body="Tambahkan wallet personal atau bersama keluarga." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {wallets.map((w) => {
            const owner = w.ownerProfileId ? memberById(data, w.ownerProfileId) : null;
            return (
              <Link key={w.id} to={`/wallets/${w.id}`}>
                <Card className="flex items-center gap-4 p-5 transition-all hover:border-slate-300 dark:border-slate-600 hover:shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-950 text-white">
                    <WalletIcon size={22} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{w.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                      {w.scope === "shared" ? <Users size={12} /> : <User size={12} />}
                      {w.scope === "shared" ? "Bersama keluarga" : owner?.name}
                    </span>
                  </span>
                  <span className="tnum text-lg font-extrabold text-ink">{formatIDR(walletBalance(data, w.id))}</span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Wallet">
        <div className="space-y-4">
          <Field label="Nama wallet">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: BCA Dinar" />
          </Field>
          <Field label="Jenis wallet">
            <Select value={scope} onChange={(e) => setScope(e.target.value as "personal" | "shared")}>
              <option value="personal">Personal (milik satu orang)</option>
              <option value="shared">Shared (bersama keluarga)</option>
            </Select>
          </Field>
          {scope === "personal" && (
            <Field label="Pemilik">
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex gap-3 border-t border-slate-200/80 dark:border-slate-800 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={save}>
              Simpan
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export function WalletDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useApp();
  const [detailId, setDetailId] = useState<string | null>(null);

  const wallet = data.wallets.find((w) => w.id === id);
  const txList = useMemo(
    () =>
      wallet
        ? data.transactions
            .filter((t) => t.walletId === wallet.id)
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        : [],
    [data, wallet],
  );

  if (!wallet) {
    return (
      <div>
        <PageHeader title="Wallet tidak ditemukan" />
        <Button variant="secondary" onClick={() => navigate("/wallets")}>
          Kembali
        </Button>
      </div>
    );
  }

  const owner = wallet.ownerProfileId ? memberById(data, wallet.ownerProfileId) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} /> Kembali
      </button>
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-950 text-white">
            <WalletIcon size={24} weight="duotone" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">{wallet.name}</p>
            <p className="text-xs text-ink-muted">
              {wallet.scope === "shared" ? "Bersama keluarga" : `Milik ${owner?.name}`}
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold text-ink-muted">Saldo saat ini</p>
        <p className="tnum text-3xl font-extrabold tracking-tight text-ink">{formatIDR(walletBalance(data, wallet.id))}</p>
      </Card>

      <p className="mb-3 mt-6 text-sm font-bold text-ink">Riwayat transaksi</p>
      {txList.length === 0 ? (
        <Card>
          <EmptyState icon={<WalletIcon size={40} />} title="Belum ada transaksi" body="Transaksi di wallet ini akan muncul di sini." />
        </Card>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          {txList.map((t) => (
            <button
              key={t.id}
              onClick={() => setDetailId(t.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas/60"
            >
              <span className="w-12 shrink-0 text-xs font-semibold text-ink-muted">{fmtDayMonth(t.occurredAt)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{t.merchant}</span>
              <span className={"tnum shrink-0 text-sm font-bold " + (t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-ink")}>
                {t.type === "income" ? "+" : "−"}
                {formatIDR(t.amount)}
              </span>
            </button>
          ))}
        </div>
      )}

      <TransactionDetailSheet transactionId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
