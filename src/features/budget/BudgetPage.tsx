import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Scales, CaretRight } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { budgetRows, expenseCats, filterTransactions } from "../../lib/derive";
import { formatIDR } from "../../lib/format";
import { startOfMonthISO, endOfMonthISO } from "../../lib/dates";
import { Button, Card, EmptyState, Field, ProgressBar, Select, Sheet, useToast } from "../../components/ui";
import { PageHeader } from "../../components/layout";
import type { FilterState } from "../../lib/types";

export function BudgetPage() {
  const { data, activeProfileId, addBudget } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

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
          <EmptyState icon={<Scales size={40} />} title="Belum ada budget" body="Tetapkan budget per kategori agar pengeluaran tetap terkendali." />
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const tone = r.pct >= 100 ? "expense" : r.pct >= 80 ? "warn" : "brand";
            return (
              <button
                key={r.budget.id}
                onClick={() => navigate("/transactions")}
                className="text-left"
              >
                <Card className="p-4 transition-all hover:border-slate-300 dark:border-slate-600 hover:shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold text-ink">
                      {r.name}
                      {r.pct >= 100 && (
                        <span className="rounded-full bg-rose-50 dark:bg-rose-950 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">Melebihi</span>
                      )}
                      {r.pct >= 80 && r.pct < 100 && (
                        <span className="rounded-full bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {r.pct >= 90 ? "Hampir penuh" : "Perhatian"}
                        </span>
                      )}
                    </span>
                    <span className="tnum text-sm font-bold text-ink">
                      {formatIDR(r.spent)} <span className="font-semibold text-ink-faint">/ {formatIDR(r.budget.amount)}</span>
                    </span>
                  </div>
                  <ProgressBar pct={r.pct} tone={tone} />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-ink-muted">
                      {r.pct >= 100 ? "Budget terlampaui" : `Sisa ${formatIDR(Math.max(0, r.budget.amount - r.spent))}`}
                    </span>
                    <span className="flex items-center gap-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      Detail <CaretRight size={11} />
                    </span>
                  </div>
                </Card>
              </button>
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
            <input
              inputMode="numeric"
              value={amount === 0 ? "" : amount.toLocaleString("id-ID")}
              onChange={(e) => setAmount(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
              className="tnum h-11 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-ink"
            />
          </Field>
          <Field label="Jenis budget">
            <Select value={scope} onChange={(e) => setScope(e.target.value as "group" | "personal")}>
              <option value="group">Group (semua anggota)</option>
              <option value="personal">Personal (satu profile)</option>
            </Select>
          </Field>
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
