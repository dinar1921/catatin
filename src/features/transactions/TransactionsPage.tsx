import { useMemo, useState } from "react";
import { MagnifyingGlass, Receipt } from "@phosphor-icons/react";
import { useApp } from "../../data/store";
import { filterTransactions } from "../../lib/derive";
import { Card, EmptyState, Pagination, Skeleton, usePagination } from "../../components/ui";
import { PageHeader, FilterChip, useFilter as useFilterCtx } from "../../components/layout";
import { TransactionList } from "../../components/TransactionList";
import { TransactionDetailSheet } from "./TransactionDetail";

export function TransactionsPage() {
  const { data, activeProfileId } = useApp();
  const { filter, openFilter } = useFilterCtx();
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading] = useState(false);

  const filtered = useMemo(() => {
    let ts = filterTransactions(data, filter, activeProfileId);
    const q = search.trim().toLowerCase();
    if (q) {
      ts = ts.filter(
        (t) => t.merchant.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    return [...ts].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [data, filter, activeProfileId, search]);

  const { pageItems, page, total, totalPages, setPage } = usePagination(filtered, 20);

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle={`${total} transaksi ditemukan`}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari merchant atau keterangan"
                className="h-11 w-full rounded-xl border border-slate-200/80 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <FilterChip filter={filter} onClick={openFilter} />
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/5 rounded" />
                      <Skeleton className="h-3 w-3/5 rounded" />
                    </div>
                    <Skeleton className="h-3.5 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={40} />}
            title="Belum ada transaksi"
            body="Coba ubah filter, atau catat transaksi baru dari menu Tambah Transaksi di sidebar."
          />
        </Card>
      ) : (
        <>
          <TransactionList data={data} transactions={pageItems} onSelect={setDetailId} />
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      <TransactionDetailSheet transactionId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
