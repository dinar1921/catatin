import { Router, type Request, type Response } from "express";
import { getGroupData } from "../services/serializer.js";
import { buildDerivedNotifications, mergeNotifications } from "../services/notifications.js";
import { requireAuth } from "../middleware/auth.js";
import { getAiSettings, getCredentials, generateInsight } from "../services/ai/index.js";

const router = Router();

function fmtIDR(n: number): string {
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Mengembalikan seluruh AppData untuk group session (kontrak = src/lib/types.ts). */
router.get("/dashboard", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const data = getGroupData(groupId);
  const derived = buildDerivedNotifications(data);
  data.notifications = mergeNotifications(data.notifications, derived);
  res.json(data);
});

/**
 * GET /api/dashboard/insight?from=&to=&profileId=
 * Insight AI (mengikuti periode filter). Fallback ke null bila AI tidak dikonfigurasi/gagal
 * (frontend memakai heuristik).
 */
router.get("/dashboard/insight", requireAuth, async (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const from = (req.query.from as string | undefined) ?? "";
  const to = (req.query.to as string | undefined) ?? "";
  const profileId = (req.query.profileId as string | undefined) ?? "all";

  const data = getGroupData(groupId);
  const txs = data.transactions.filter((t) => {
    const d = String(t.occurredAt ?? "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (profileId !== "all" && t.ownerProfileId !== profileId) return false;
    return true;
  });

  const income = txs
    .filter((t) => t.type === "income" && t.source !== "opening_balance" && t.source !== "transfer_in")
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const expense = txs
    .filter((t) => t.type === "expense" && t.source !== "transfer_out")
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);

  const byCat = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    byCat.set(String(t.categoryId ?? ""), (byCat.get(String(t.categoryId ?? "")) ?? 0) + Number(t.amount ?? 0));
  }
  const topCats = [...byCat.entries()]
    .map(([id, total]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? "Lainnya", total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const summary = [
    `Periode: ${from || "semua"} s.d. ${to || "sekarang"}`,
    `Jumlah transaksi: ${txs.length}`,
    `Pemasukan: ${fmtIDR(income)}`,
    `Pengeluaran: ${fmtIDR(expense)}`,
    `Kategori pengeluaran terbesar: ${topCats.map((c) => `${c.name} (${fmtIDR(c.total)})`).join(", ") || "tidak ada"}`,
  ].join("\n");

  const cfg = getAiSettings(groupId);
  const cred = getCredentials(groupId);
  const result = await generateInsight(summary, cfg, cred?.apiKey ?? null);
  res.json({ text: result?.text ?? null, recommendation: result?.recommendation ?? null });
});

export default router;