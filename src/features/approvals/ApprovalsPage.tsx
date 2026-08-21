import { useMemo, useState } from "react";
import { Check, X, Warning, PencilSimple, TelegramLogo, Robot, Camera } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { formatIDR, terbilang } from "../../lib/format";
import { fmtFullDateID, todayISO } from "../../lib/dates";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Sheet, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import type { Draft, DraftSource } from "../../lib/types";

type SrcTab = "all" | DraftSource;

const srcMeta: Record<DraftSource, { label: string; icon: React.ElementType }> = {
  receipt_ocr: { label: "OCR", icon: Camera },
  telegram: { label: "Telegram", icon: TelegramLogo },
  whatsapp: { label: "WhatsApp", icon: TelegramLogo },
  hermes: { label: "Hermes", icon: Robot },
};

export function ApprovalsPage() {
  const { data, approveDraft, rejectDraft } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<SrcTab>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const drafts = useMemo(
    () => data.drafts.filter((d) => d.status === "draft" || d.status === "in_review"),
    [data.drafts],
  );
  const shown = tab === "all" ? drafts : drafts.filter((d) => d.source === tab);

  return (
    <div>
      <PageHeader title="Persetujuan" subtitle={`${drafts.length} draft menunggu aksi`} />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            { id: "all", label: "Semua" },
            { id: "receipt_ocr", label: "OCR" },
            { id: "telegram", label: "Telegram" },
            { id: "whatsapp", label: "WhatsApp" },
            { id: "hermes", label: "Hermes" },
          ] as const
        ).map((t) => (
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
          <EmptyState
            icon={<Check size={40} />}
            title="Tidak ada draft"
            body="Draft dari AI, Telegram, WhatsApp, dan Hermes muncul di sini untuk disetujui."
          />
        </Card>
      ) : (
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          {shown.map((d) => {
            const meta = srcMeta[d.source];
            return (
              <button
                key={d.id}
                onClick={() => setDetailId(d.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
                  <meta.icon size={20} weight="duotone" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{d.merchant}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                    <span>{meta.label}</span>
                    {d.uncertainFields.length > 0 && (
                      <Badge variant="warning">
                        <Warning size={10} weight="fill" /> {d.uncertainFields.length} field ragu
                      </Badge>
                    )}
                  </span>
                </span>
                <span className="tnum shrink-0 text-sm font-bold text-ink">{formatIDR(d.amount)}</span>
              </button>
            );
          })}
        </div>
      )}

      {detailId && (
        <DraftDetail
          draft={data.drafts.find((d) => d.id === detailId) ?? null}
          onClose={() => setDetailId(null)}
          onApprove={(id, patch) => {
            approveDraft(id, patch);
            toast.push("success", "Draft disetujui, transaksi dibuat");
            setDetailId(null);
          }}
          onReject={(id) => {
            rejectDraft(id);
            toast.push("info", "Draft ditolak");
            setDetailId(null);
          }}
        />
      )}
    </div>
  );
}

function DraftDetail({
  draft,
  onClose,
  onApprove,
  onReject,
}: {
  draft: Draft | null;
  onClose: () => void;
  onApprove: (id: string, patch: Partial<Draft>) => void;
  onReject: (id: string) => void;
}) {
  const { data } = useApp();
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState(draft?.merchant ?? "");
  const [amount, setAmount] = useState(draft?.amount ?? 0);
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? "");
  const [walletId, setWalletId] = useState(draft?.walletId ?? "");
  const [occurredAt, setOccurredAt] = useState(draft?.occurredAt ?? todayISO());

  if (!draft) return <Sheet open={false} onClose={onClose} title="" />;
  const meta = srcMeta[draft.source];

  return (
    <Sheet
      open={!!draft}
      onClose={onClose}
      title={`Draft dari ${meta.label}`}
      footer={
        editing ? (
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              Batal
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                onApprove(draft.id, { merchant, amount, categoryId, walletId, occurredAt });
              }}
            >
              <Check size={16} weight="bold" /> Setujui & Simpan
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" onClick={() => onReject(draft.id)}>
              <X size={16} weight="bold" /> Tolak
            </Button>
            <Button onClick={() => onApprove(draft.id, {})}>
              <Check size={16} weight="bold" /> Setujui
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-canvas p-3">
          <p className="tnum text-2xl font-extrabold text-ink">{formatIDR(draft.amount)}</p>
          <p className="text-xs font-medium text-brand-700 dark:text-brand-300">{terbilang(draft.amount)}</p>
        </div>

        {editing ? (
          <div className="space-y-3">
            <Field label="Merchant">
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </Field>
            <Field label="Nominal">
              <input
                inputMode="numeric"
                value={amount === 0 ? "" : amount.toLocaleString("id-ID")}
                onChange={(e) => setAmount(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
                className="tnum h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-ink"
              />
            </Field>
            <Field label="Kategori">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pilih kategori</option>
                {data.categories.filter((c) => c.direction !== "income").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Wallet">
              <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                <option value="">Pilih wallet</option>
                {data.wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tanggal">
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold text-ink">{draft.merchant}</p>
            <p className="-mt-2 text-xs text-ink-muted">{draft.description}</p>
            <div className="space-y-1.5 text-sm">
              <Row label="Tanggal" value={draft.occurredAt ? fmtFullDateID(draft.occurredAt) : "Hari ini"} />
              <Row label="Kategori" value={data.categories.find((c) => c.id === draft.categoryId)?.name ?? "Belum dipilih"} />
              <Row label="Wallet" value={data.wallets.find((w) => w.id === draft.walletId)?.name ?? "Belum dipilih"} />
            </div>

            {draft.uncertainFields.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-amber-50 dark:bg-amber-950 p-3">
                <Warning size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" weight="fill" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  AI tidak yakin pada: {draft.uncertainFields.join(", ")}. Periksa sebelum menyetujui.
                </p>
              </div>
            )}

            {draft.attachment && (
              <img src={draft.attachment.dataUrl} alt={draft.attachment.fileName} className="max-h-44 w-full rounded-xl border border-slate-200/80 dark:border-slate-800 object-contain" />
            )}

            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <PencilSimple size={14} /> Edit dulu sebelum setuju
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
