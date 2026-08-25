import { Bell, CheckCircle, Warning, CheckSquare, Info } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../data/store";
import { Button, Card, EmptyState } from "../../components/ui";
import { PageHeader } from "../../components/layout";

export function NotificationsPage() {
  const { data, markNotifAllRead } = useApp();
  const navigate = useNavigate();
  const unread = data.notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifikasi"
        subtitle={unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
        actions={
          unread > 0 ? (
            <Button variant="secondary" size="sm" onClick={markNotifAllRead}>
              Tandai semua dibaca
            </Button>
          ) : undefined
        }
      />

      {data.notifications.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell size={40} />} title="Tidak ada notifikasi" body="Tagihan jatuh tempo dan draft menunggu persetujuan akan muncul di sini." />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.linkTo)}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas/60"
            >
              <span className="mt-0.5 shrink-0">
                {n.kind === "due" && <CheckCircle size={20} className="text-amber-600 dark:text-amber-400" weight="fill" />}
                {n.kind === "overdue" && <Warning size={20} className="text-rose-600 dark:text-rose-400" weight="fill" />}
                {n.kind === "draft" && <CheckSquare size={20} className="text-brand-600" weight="fill" />}
                {n.kind === "system" && <Info size={20} className="text-ink-faint" weight="fill" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={"block text-sm font-semibold " + (n.read ? "text-ink-secondary" : "text-ink")}>{n.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{n.body}</span>
              </span>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
