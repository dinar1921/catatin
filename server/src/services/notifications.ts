import type { AppData } from "./serializer.js";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function billStatus(b: Record<string, unknown>): string {
  const amount = Number(b.amount ?? 0);
  const paid = Number(b.paidAmount ?? 0);
  const dueDay = b.dueDay as number | null | undefined;
  const dueDate = b.dueDate as string | null | undefined;
  const lastPaidPeriod = b.lastPaidPeriod as string | null | undefined;
  const type = b.type as string;
  const today = todayISO();

  if (paid >= amount) return "paid_off";
  if (type === "recurring" && lastPaidPeriod === today.slice(0, 7)) return "paid";
  if (type === "recurring" && lastPaidPeriod === undefined) return "unpaid";

  let dueLabel: string | null = null;
  if (dueDate) dueLabel = dueDate;
  else if (dueDay != null) {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    dueLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(dueDay, dim)).padStart(2, "0")}`;
  }
  if (dueLabel) {
    if (dueLabel === today) return "due_today";
    if (dueLabel < today) return "overdue";
    return "unpaid";
  }
  return "unpaid";
}

/**
 * Notifikasi derived: bill jatuh tempo hari ini / overdue, dan draft pending.
 * Dipakai oleh /api/dashboard dan /api/notifications.
 */
export function buildDerivedNotifications(data: AppData): { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }[] {
  const today = todayISO();
  const out: { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }[] = [];

  for (const b of data.bills) {
    const st = billStatus(b);
    const title = String(b.title ?? "Tagihan");
    if (st === "due_today") {
      out.push({
        id: `derived-due-${b.id}`,
        kind: "due",
        title: `${title} jatuh tempo hari ini`,
        body: `Tagihan ${title} harus dibayar hari ini.`,
        linkTo: `/bills/${b.id}`,
        read: false,
        createdAt: today,
      });
    } else if (st === "overdue") {
      out.push({
        id: `derived-overdue-${b.id}`,
        kind: "overdue",
        title: `${title} melewati jatuh tempo`,
        body: `Tagihan ${title} sudah melewati jatuh tempo.`,
        linkTo: `/bills/${b.id}`,
        read: false,
        createdAt: today,
      });
    }
  }

  const pendingDrafts = data.drafts.filter((d) => d.status === "draft" || d.status === "in_review");
  if (pendingDrafts.length > 0) {
    out.push({
      id: `derived-drafts-${pendingDrafts.length}`,
      kind: "draft",
      title: "Draft menunggu persetujuan",
      body: `${pendingDrafts.length} draft menunggu persetujuanmu.`,
      linkTo: "/approvals",
      read: false,
      createdAt: today,
    });
  }

  return out;
}

/** Gabung notifikasi tersimpan + derived, dedup berdasarkan (kind, linkTo), sort by createdAt desc. */
export function mergeNotifications(
  stored: { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }[],
  derived: { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }[],
): { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }[] {
  const map = new Map<string, { id: string; kind: string; title: string; body: string; linkTo: string; read: boolean; createdAt: string }>();

  for (const d of derived) {
    const key = `${d.kind}|${d.linkTo}`;
    map.set(key, d);
  }
  for (const s of stored) {
    const key = `${s.kind}|${s.linkTo}`;
    map.set(key, s);
  }

  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export { todayISO, addDays };
