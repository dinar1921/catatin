import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, ArrowsLeftRight, Wallet as WalletIcon, Users, User, PencilSimple, Trash } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { memberById, walletBalance, walletVisible } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { fmtDayMonth, monthKey, todayISO } from "../../lib/dates";
import { AmountInput, Button, Card, cn, ConfirmDialog, EmptyState, Field, Input, Pagination, Select, Sheet, usePagination, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import { TransactionDetailSheet } from "../transactions/TransactionDetail";

export function WalletsPage() {
  const { data, activeProfileId, addWallet, transferBetweenWallets } = useApp();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [ownerId, setOwnerId] = useState(activeProfileId === "all" ? data.members[0]?.id ?? "" : activeProfileId);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState(0);

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

  const openTransfer = (from?: string) => {
    const candidates = wallets.length >= 2 ? wallets : data.wallets;
    const f = from && candidates.some((w) => w.id === from) ? from : candidates[0]?.id ?? "";
    setTransferFrom(f);
    setTransferTo(candidates.find((w) => w.id !== f)?.id ?? "");
    setTransferAmount(0);
    setTransferOpen(true);
  };

  const submitTransfer = () => {
    if (!transferFrom || !transferTo) {
      toast.push("error", "Pilih wallet asal dan tujuan");
      return;
    }
    if (transferFrom === transferTo) {
      toast.push("error", "Wallet asal dan tujuan tidak boleh sama");
      return;
    }
    if (transferAmount <= 0) {
      toast.push("error", "Nominal transfer harus lebih dari 0");
      return;
    }
    transferBetweenWallets({ fromWalletId: transferFrom, toWalletId: transferTo, amount: transferAmount });
    toast.push("success", "Transfer berhasil");
    setTransferOpen(false);
    setTransferAmount(0);
  };

  return (
    <div>
      <PageHeader
        title="Wallet"
        subtitle={`Total ${formatIDR(total)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => openTransfer()} disabled={wallets.length < 2}>
              <ArrowsLeftRight size={16} weight="bold" /> Transfer
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} weight="bold" /> Tambah Wallet
            </Button>
          </>
        }
      />

      {wallets.length === 0 ? (
        <Card>
          <EmptyState icon={<WalletIcon size={40} weight="duotone" />} title="Belum ada wallet" body="Tambahkan wallet personal atau bersama keluarga." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {wallets.map((w) => {
            const owner = w.ownerProfileId ? memberById(data, w.ownerProfileId) : null;
            return (
              <Link key={w.id} to={`/wallets/${w.id}`}>
                <Card interactive className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                    <WalletIcon size={22} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{w.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                      {w.scope === "shared" ? <Users size={12} weight="bold" /> : <User size={12} weight="bold" />}
                      {w.scope === "shared" ? "Bersama keluarga" : owner?.name}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-lg font-bold tracking-tight text-ink">{formatIDR(walletBalance(data, w.id))}</span>
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
          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={save}>
              Simpan
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Antar Wallet">
        <div className="space-y-4">
          <Field label="Dari wallet">
            <Select value={transferFrom} onChange={(e) => {
              setTransferFrom(e.target.value);
              if (e.target.value === transferTo) setTransferTo("");
            }}>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ke wallet">
            <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              {wallets.filter((w) => w.id !== transferFrom).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nominal">
            <AmountInput value={transferAmount} onChange={setTransferAmount} />
          </Field>
          <div className="rounded-xl bg-canvas p-3 text-xs text-ink-muted">
            Pemindahan dana dicatat sebagai pengeluaran di wallet asal dan pemasukan di wallet tujuan, tanpa memengaruhi laporan pendapatan/pengeluaran.
          </div>
          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => setTransferOpen(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={submitTransfer}>
              Transfer
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
  const { data, updateWallet, deleteWallet, transferBetweenWallets } = useApp();
  const toast = useToast();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [ownerId, setOwnerId] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState(0);

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

  const filtered = useMemo(
    () =>
      typeFilter === "all"
        ? txList
        : typeFilter === "income"
          ? txList.filter((t) => t.type === "income")
          : txList.filter((t) => t.type !== "income"),
    [txList, typeFilter],
  );

  const { pageItems, page, totalPages, setPage } = usePagination(filtered, 20);

  const monthTx = useMemo(() => {
    const mk = monthKey(todayISO());
    return txList.filter((t) => monthKey(t.occurredAt) === mk);
  }, [txList]);

  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type !== "income").reduce((s, t) => s + t.amount, 0);

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
        <ArrowLeft size={16} weight="bold" /> Kembali
      </button>

      {/* Hero wallet — modern finance */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800 p-4 text-left text-white shadow-card sm:p-5 dark:to-brand-900">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-brand-500/30" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
              <WalletIcon size={22} weight="duotone" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{wallet.name}</p>
              <p className="text-xs text-brand-100">
                {wallet.scope === "shared" ? "Bersama keluarga" : `Milik ${owner?.name}`}
              </p>
            </div>
          </div>
          <span className="flex shrink-0 gap-1">
            <button
              onClick={() => { setTransferFrom(wallet.id); setTransferTo(data.wallets.find((w) => w.id !== wallet.id)?.id ?? ""); setTransferAmount(0); setTransferOpen(true); }}
              aria-label="Transfer dari wallet ini"
              title="Transfer"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            >
              <ArrowsLeftRight size={16} weight="bold" />
            </button>
            <button
              onClick={() => { setName(wallet.name); setScope(wallet.scope); setOwnerId(wallet.ownerProfileId ?? ""); setEditOpen(true); }}
              aria-label="Edit wallet"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            >
              <PencilSimple size={16} weight="bold" />
            </button>
            <button
              onClick={() => setConfirmDel(true)}
              aria-label="Hapus wallet"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
            >
              <Trash size={16} weight="bold" />
            </button>
          </span>
        </div>

        <p className="relative mt-5 text-xs font-medium text-brand-100">Saldo saat ini</p>
        <p className="tnum relative mt-1 text-3xl font-bold leading-none tracking-tight sm:text-4xl">
          {formatIDR(walletBalance(data, wallet.id))}
        </p>

        <div className="relative mt-5 grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
          <div>
            <p className="text-xs text-brand-100">Pemasukan bulan ini</p>
            <p className="tnum mt-0.5 text-base font-semibold sm:text-lg">{formatIDR(monthIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-brand-100">Pengeluaran bulan ini</p>
            <p className="tnum mt-0.5 text-base font-semibold sm:text-lg">{formatIDR(monthExpense)}</p>
          </div>
        </div>
      </div>

      <p className="mb-3 mt-6 text-sm font-semibold text-ink">Riwayat transaksi</p>

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {[
          { id: "all", label: "Semua" },
          { id: "income", label: "Pemasukan" },
          { id: "expense", label: "Pengeluaran" },
        ].map((o) => (
          <button
            key={o.id}
            onClick={() => {
              setTypeFilter(o.id as typeof typeFilter);
              setPage(1);
            }}
            className={
              typeFilter === o.id
                ? "flex-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                : "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<WalletIcon size={40} weight="duotone" />} title="Belum ada transaksi" body="Transaksi di wallet ini akan muncul di sini." />
        </Card>
      ) : (
        <>
          <Card padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
            {pageItems.map((t) => (
              <button
                key={t.id}
                onClick={() => setDetailId(t.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-muted">{fmtDayMonth(t.occurredAt)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.merchant}</span>
                <span className={cn("tnum shrink-0 text-sm font-semibold", t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-ink")}>
                  {t.type === "income" ? "+" : "−"}
                  {formatIDR(t.amount)}
                </span>
              </button>
            ))}
          </Card>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      <TransactionDetailSheet transactionId={detailId} onClose={() => setDetailId(null)} />

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Wallet">
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
          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>
              Batal
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!name.trim()) {
                  toast.push("error", "Nama wallet wajib diisi");
                  return;
                }
                updateWallet(wallet.id, { name: name.trim(), scope, ownerProfileId: scope === "personal" ? ownerId || null : null });
                toast.push("success", "Wallet diperbarui");
                setEditOpen(false);
              }}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDel}
        title="Hapus wallet?"
        body="Wallet dan saldonya akan dihapus. Transaksi yang terkait tetap tersimpan, tapi walletnya tidak lagi terhubung."
        confirmLabel="Hapus"
        onConfirm={() => {
          deleteWallet(wallet.id);
          setConfirmDel(false);
          navigate("/wallets");
        }}
        onCancel={() => setConfirmDel(false)}
      />

      <Sheet open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Antar Wallet">
        <div className="space-y-4">
          <Field label="Dari wallet">
            <Select value={transferFrom} onChange={(e) => {
              setTransferFrom(e.target.value);
              if (e.target.value === transferTo) setTransferTo("");
            }}>
              {data.wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ke wallet">
            <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              {data.wallets.filter((w) => w.id !== transferFrom).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nominal">
            <AmountInput value={transferAmount} onChange={setTransferAmount} />
          </Field>
          <div className="rounded-xl bg-canvas p-3 text-xs text-ink-muted">
            Pemindahan dana dicatat sebagai pengeluaran di wallet asal dan pemasukan di wallet tujuan, tanpa memengaruhi laporan pendapatan/pengeluaran.
          </div>
          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => setTransferOpen(false)}>
              Batal
            </Button>
            <Button className="flex-1" onClick={() => {
              if (!transferFrom || !transferTo || transferFrom === transferTo) {
                toast.push("error", "Pilih wallet asal dan tujuan yang berbeda");
                return;
              }
              if (transferAmount <= 0) {
                toast.push("error", "Nominal transfer harus lebih dari 0");
                return;
              }
              transferBetweenWallets({ fromWalletId: transferFrom, toWalletId: transferTo, amount: transferAmount });
              toast.push("success", "Transfer berhasil");
              setTransferOpen(false);
            }}>
              Transfer
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
