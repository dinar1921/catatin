import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PencilSimple, Trash, Paperclip, CaretRight, CreditCard as CreditCardIcon } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { categoryById, isCreditCardSettlement, memberById, walletById, billStatus } from "../../lib/derive";
import { identifyTransferPairs, isWalletTransfer } from "../../lib/transfer";
import { formatIDR, terbilang } from "../../lib/format";
import { fmtFullDateID } from "../../lib/dates";
import { AmountInput, Avatar, Badge, Button, ConfirmDialog, Field, Input, Select, Sheet, useToast } from "../../components/ui";
import type { PaymentMethod, Transaction } from "../../lib/types";

export function TransactionDetailSheet({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { data, deleteTransaction, updateTransaction } = useApp();
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);

  const tx = useMemo(() => data.transactions.find((t) => t.id === transactionId), [data, transactionId]);
  const pairs = useMemo(() => identifyTransferPairs(data.transactions), [data.transactions]);
  const pair = tx ? pairs.get(tx.id) : undefined;
  const isTransfer = tx ? isWalletTransfer(tx) || Boolean(pair) : false;

  if (!tx) return <Sheet open={false} onClose={onClose} title="" />;

  const cat = categoryById(data, tx.categoryId);
  const wallet = walletById(data, tx.walletId);
  const owner = memberById(data, tx.ownerProfileId);
  const creator = memberById(data, tx.createdBy);
  const bill = tx.billId ? data.bills.find((b) => b.id === tx.billId) : null;
  const inst = tx.installmentId ? data.installments.find((i) => i.id === tx.installmentId) : null;

  const typeLabel = isTransfer ? "Transfer" : tx.type === "income" ? "Pemasukan" : tx.type === "expense" ? "Pengeluaran" : "Pembayaran Kartu Kredit";
  const isSettlement = isCreditCardSettlement(tx);

  const sourceWallet = pair ? walletById(data, pair.sourceWalletId) : wallet;
  const destWallet = pair ? walletById(data, pair.destinationWalletId) : undefined;

  const handleDelete = () => {
    if (pair) {
      // Hapus KEDUA sisi ledger dari satu transfer.
      deleteTransaction(pair.outgoing.id);
      if (pair.incoming.id !== pair.outgoing.id) deleteTransaction(pair.incoming.id);
    } else {
      deleteTransaction(tx.id);
    }
    setConfirmDel(false);
    onClose();
    toast.push("success", pair ? "Transfer dihapus" : "Transaksi dihapus");
  };

  return (
    <>
      <Sheet
        open={!!transactionId}
        onClose={onClose}
        title={editing ? "Edit Transaksi" : "Detail Transaksi"}
        footer={
          editing ? null : (
            <div className="flex gap-3">
              {!isSettlement && !isTransfer && (
                <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
                  <PencilSimple size={16} weight="bold" /> Edit
                </Button>
              )}
              <Button variant="danger" className="flex-1" onClick={() => setConfirmDel(true)}>
                <Trash size={16} weight="bold" /> {isTransfer ? "Hapus Transfer" : "Hapus"}
              </Button>
            </div>
          )
        }
      >
        {editing ? (
          <EditForm
            tx={tx}
            onCancel={() => setEditing(false)}
            onSave={(patch) => {
              updateTransaction(tx.id, patch);
              setEditing(false);
              toast.push("success", "Transaksi diperbarui");
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={isTransfer ? "default" : tx.type === "income" ? "income" : tx.type === "expense" ? "expense" : "default"}>{typeLabel}</Badge>
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                {owner && (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={owner.name} color={owner.color} size={20} /> {owner.name}
                  </span>
                )}
                {creator && creator.id !== owner?.id && <span>· dicatat {creator.name}</span>}
              </div>
            </div>

            <div>
              <p className="tnum text-4xl font-bold tracking-tight text-ink">
                {isTransfer ? "" : tx.type === "expense" || tx.type === "transfer" ? "−" : "+"}
                {formatIDR(tx.amount)}
              </p>
              <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{terbilang(tx.amount)}</p>
            </div>

            {isTransfer ? (
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-sm font-semibold text-ink">
                  {sourceWallet?.name ?? "Wallet asal"} → {destWallet?.name ?? "Wallet tujuan"}
                </p>
                <p className="text-xs text-ink-muted">Pemindahan dana antar wallet — tidak memengaruhi pemasukan/pengeluaran.</p>
              </div>
            ) : (
              tx.merchant && (
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-sm font-semibold text-ink">{tx.merchant}</p>
                  <p className="whitespace-pre-line text-xs text-ink-muted">{tx.description || "Tanpa keterangan"}</p>
                </div>
              )
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {isTransfer ? (
                <>
                  <Detail label="Dari" value={sourceWallet?.name ?? (tx.merchant || "—")} />
                  <Detail label="Ke" value={destWallet?.name ?? "—"} />
                </>
              ) : (
                <>
                  <Detail label="Kategori" value={cat?.name ?? "—"} />
                  <Detail label="Wallet" value={wallet?.name ?? "—"} />
                </>
              )}
              <Detail label="Tanggal" value={fmtFullDateID(tx.occurredAt)} />
              <Detail label="Metode" value={tx.paymentMethod ?? "—"} />
              {!isTransfer && tx.creditCardId && (
                <Detail label="Kartu kredit" value={data.creditCards.find((c) => c.id === tx.creditCardId)?.name ?? "—"} />
              )}
              <Detail label="Sumber" value={sourceLabel(tx.source)} />
            </dl>

            {tx.items.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Item struk</p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  {tx.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-ink">
                        {it.itemName} <span className="text-ink-muted">× {it.quantity}</span>
                      </span>
                      <span className="tnum font-semibold text-ink">{formatIDR(it.totalPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tx.attachment && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Foto struk</p>
                <img src={tx.attachment.dataUrl} alt={tx.attachment.fileName} className="mx-auto max-h-52 max-w-full rounded-xl border border-slate-200/80 bg-canvas object-contain dark:border-slate-800" />
              </div>
            )}

            {bill && (
              <Link
                to={`/bills/${bill.id}`}
                onClick={onClose}
                className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950/15"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                  <Paperclip size={15} weight="bold" />
                  {bill.title}
                  {inst && <span className="text-xs text-ink-muted">({inst.paidCount}/{inst.tenor})</span>}
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {billStatusLabel(billStatus(bill))} <CaretRight size={13} weight="bold" />
                </span>
              </Link>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDel}
        title={isTransfer ? "Hapus transfer?" : "Hapus transaksi?"}
        body={
          isTransfer
            ? `Transfer "${sourceWallet?.name ?? "Wallet asal"} → ${destWallet?.name ?? "Wallet tujuan"}" sebesar ${formatIDR(tx.amount)} akan dihapus dari kedua wallet (asal dan tujuan).`
            : `Transaksi "${tx.merchant || "Tanpa merchant"}" sebesar ${formatIDR(tx.amount)} akan dihapus permanen.`
        }
        confirmLabel={isTransfer ? "Hapus Transfer" : "Hapus"}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function billStatusLabel(s: string): string {
  switch (s) {
    case "paid_off":
      return "Lunas";
    case "paid":
      return "Sudah dibayar";
    case "due_today":
      return "Jatuh tempo hari ini";
    case "overdue":
      return "Terlambat";
    default:
      return "Belum dibayar";
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case "manual":
      return "Manual";
    case "receipt_ocr":
      return "Scan struk";
    case "telegram":
      return "Telegram";
    case "whatsapp":
      return "WhatsApp";
    case "hermes":
      return "Hermes";
    case "opening_balance":
      return "Saldo awal";
    default:
      return s;
  }
}

/* ------------------------------------------------------------------ */
/* Edit form                                                           */
/* ------------------------------------------------------------------ */
function EditForm({
  tx,
  onCancel,
  onSave,
}: {
  tx: Transaction;
  onCancel: () => void;
  onSave: (patch: Partial<Transaction>) => void;
}) {
  const { data } = useApp();
  const [amount, setAmount] = useState(tx.amount);
  const [merchant, setMerchant] = useState(tx.merchant);
  const [description, setDescription] = useState(tx.description);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [walletId, setWalletId] = useState(tx.walletId);
  const [occurredAt, setOccurredAt] = useState(tx.occurredAt.slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(tx.paymentMethod ?? "");

  const isCcPurchase = tx.paymentMethod === "Credit Card" || Boolean(tx.creditCardId);
  const card = tx.creditCardId ? data.creditCards.find((c) => c.id === tx.creditCardId) : null;
  const cats = data.categories.filter((c) => c.direction !== "income" || tx.type === "income");

  return (
    <div className="space-y-4">
      <Field label="Nominal">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Merchant">
        <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Toko / merchant" />
      </Field>
      <Field label="Kategori">
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {isCcPurchase ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950/15 dark:text-brand-300">
          <span className="flex items-center gap-2">
            <CreditCardIcon size={15} weight="duotone" />
            Pembelian via {card ? card.name : "kartu kredit"} — wallet tidak digunakan.
          </span>
        </div>
      ) : (
        <Field label="Wallet">
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {data.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Tanggal">
        <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
      </Field>
      <Field label="Deskripsi">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan (opsional)" />
      </Field>
      <Field label="Metode pembayaran">
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}>
          <option value="">Tidak memilih</option>
          <option value="Cash">Cash</option>
          <option value="Debit Card">Debit Card</option>
          <option value="Credit Card">Credit Card</option>
          <option value="Transfer">Transfer</option>
        </Select>
      </Field>
      <div className="flex gap-3 pt-1">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button
          className="flex-1"
          onClick={() =>
            onSave({
              amount,
              merchant,
              description,
              categoryId,
              // Pembelian kartu kredit: wallet tetap NULL (wallet isolation).
              walletId: (paymentMethod === "Credit Card" || isCcPurchase ? null : walletId) as any,
              occurredAt,
              paymentMethod: paymentMethod || null,
            })
          }
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}
