import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CurrencyCircleDollar, PencilSimple, Trash, CaretRight } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { budgetRows, expenseCats, filterTransactions } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { startOfMonthISO, endOfMonthISO } from "../../lib/dates";
import { AmountInput, Badge, Button, Card, ConfirmDialog, EmptyState, Field, ProgressBar, Select, Sheet, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import type { FilterState } from "../../lib/types";

export function BudgetPage() {
  const { data, activeProfileId, addBudget, updateBudget, deleteBudget } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // transaksi bulan ini (budget = monthly, PRD §17)
  const ts = useMemo(() => {
    const f: FilterState = {
      period: { preset: "custom", start: startOfMonthISO(), end: endOfMonthISO() },
      profileId: activeProfileId,
      type: "all",
      categoryId: "",
      walletId: "",
    };
    return filterTransactions(data, f, activeProfileId);
  }, [data, activeProfileId]);

  const rows = budgetRows(data, ts, activeProfileId);
  const spentTotal = rows.reduce((s, r) => s + r.spent, 0);
  const limitTotal = rows.reduce((s, r) => s + r.budget.amount, 0);

  const [catId, setCatId] = useState("");
  const [amount, setAmount] = useState(0);
  const [scope, setScope] = useState<"group" | "personal">("group");

  const save = () => {
    if (!catId || amount <= 0) {
      toast.push("error", "Pilih kategori dan isi nominal budget");
      return;
    }
    addBudget({ categoryId: catId, amount, ownerProfileId: scope === "group" ? null : activeProfileId === "all" ? null : activeProfileId });
    toast.push("success", "Budget ditambahkan");
    setAddOpen(false);
    setCatId("");
    setAmount(0);
  };

  const startEdit = (id: string) => {
    const row = rows.find((r) => r.budget.id === id);
    if (!row) return;
    setEditingId(id);
    setCatId(row.budget.categoryId);
    setAmount(row.budget.amount);
    setScope(row.budget.ownerProfileId ? "personal" : "group");
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!catId || amount <= 0) {
      toast.push("error", "Pilih kategori dan isi nominal budget");
      return;
    }
    updateBudget(editingId, {
      categoryId: catId,
      amount,
      ownerProfileId: scope === "group" ? null : activeProfileId === "all" ? null : activeProfileId,
    });
    toast.push("success", "Budget diperbarui");
    setEditOpen(false);
    setEditingId(null);
  };

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle={`Bulan ini: ${formatIDR(spentTotal)} dari ${formatIDR(limitTotal)}`}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} weight="bold" /> Tambah Budget
          </Button>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<CurrencyCircleDollar size={40} />} title="Belum ada budget" body="Tetapkan budget per kategori agar pengeluaran tetap terkendali." />
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const tone = r.pct >= 100 ? "expense" : r.pct >= 80 ? "warn" : "brand";
            return (
              <Card
                key={r.budget.id}
                interactive
                onClick={() => navigate("/transactions")}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {r.name}
                    {r.pct >= 100 && (
                      <Badge variant="danger">Melebihi</Badge>
                    )}
                    {r.pct >= 80 && r.pct < 100 && (
                      <Badge variant="warning">
                        {r.pct >= 90 ? "Hampir penuh" : "Perhatian"}
                      </Badge>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(r.budget.id); }}
                      aria-label={`Edit budget ${r.name}`}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-slate-100 hover:text-brand-700 dark:hover:bg-slate-800"
                    >
                      <PencilSimple size={14} weight="bold" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(r.budget.id); setConfirmDel(true); }}
                      aria-label={`Hapus budget ${r.name}`}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  </span>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatIDR(r.spent)} <span className="font-medium text-ink-faint">/ {formatIDR(r.budget.amount)}</span>
                  </span>
                </div>
                <ProgressBar pct={r.pct} tone={tone} />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="tnum text-xs text-ink-muted">
                    {r.pct >= 100 ? "Budget terlampaui" : `Sisa ${formatIDR(Math.max(0, r.budget.amount - r.spent))}`}
                  </span>
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    Detail <CaretRight size={14} weight="bold" />
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Budget">
        <div className="space-y-4">
          <Field label="Kategori">
            <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">Pilih kategori</option>
              {expenseCats(data).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nominal budget per bulan">
            <AmountInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Jenis budget">
            <Select value={scope} onChange={(e) => setScope(e.target.value as "group" | "personal")}>
              <option value="group">Group (semua anggota)</option>
              <option value="personal">Personal (satu profile)</option>
            </Select>
          </Field>
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

      <Sheet open={editOpen} onClose={() => { setEditOpen(false); setEditingId(null); }} title="Edit Budget">
        <div className="space-y-4">
          <Field label="Kategori">
            <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">Pilih kategori</option>
              {expenseCats(data).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nominal budget per bulan">
            <AmountInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Jenis budget">
            <Select value={scope} onChange={(e) => setScope(e.target.value as "group" | "personal")}>
              <option value="group">Group (semua anggota)</option>
              <option value="personal">Personal (satu profile)</option>
            </Select>
          </Field>
          <div className="flex gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="secondary" className="flex-1" onClick={() => { setEditOpen(false); setEditingId(null); }}>
              Batal
            </Button>
            <Button className="flex-1" onClick={saveEdit}>
              Simpan
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDel}
        title="Hapus budget?"
        body="Budget ini akan dihapus. Pengeluaran yang sudah tercatat tidak terpengaruh."
        confirmLabel="Hapus"
        onConfirm={() => {
          if (editingId) deleteBudget(editingId);
          setConfirmDel(false);
          setEditingId(null);
        }}
        onCancel={() => { setConfirmDel(false); setEditingId(null); }}
      />
    </div>
  );
}
