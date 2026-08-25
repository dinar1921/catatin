import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { getGroupData } from "../services/serializer.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function fmtIDR(n: number): string {
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function periodLabel(from?: string, to?: string): string {
  if (from && to) return `${from} s.d. ${to}`;
  if (from) return `mulai ${from}`;
  if (to) return `sampai ${to}`;
  return "semua periode";
}

function computeReport(groupId: string, from?: string, to?: string, profileId?: string) {
  const data = getGroupData(groupId);
  const txs = data.transactions.filter((t) => {
    const d = String(t.occurredAt ?? "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (profileId && profileId !== "all" && t.ownerProfileId !== profileId) return false;
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
    const id = String(t.categoryId ?? "lainnya");
    byCat.set(id, (byCat.get(id) ?? 0) + Number(t.amount ?? 0));
  }
  const categories = data.categories;
  const spending = [...byCat.entries()]
    .map(([id, total]) => ({ name: categories.find((c) => c.id === id)?.name ?? "Lainnya", total }))
    .sort((a, b) => b.total - a.total);

  const byWallet = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    const id = String(t.walletId ?? "lainnya");
    byWallet.set(id, (byWallet.get(id) ?? 0) + Number(t.amount ?? 0));
  }
  const wallets = data.wallets;
  const spendingWallet = [...byWallet.entries()]
    .map(([id, total]) => ({ name: wallets.find((w) => w.id === id)?.name ?? "Lainnya", total }))
    .sort((a, b) => b.total - a.total);

  const merchants = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (t.type !== "expense" || t.source === "transfer_out") continue;
    const name = String(t.merchant || "Tanpa merchant");
    const cur = merchants.get(name) ?? { total: 0, count: 0 };
    cur.total += Number(t.amount ?? 0);
    cur.count += 1;
    merchants.set(name, cur);
  }
  const merchantList = [...merchants.entries()].sort((a, b) => b[1].total - a[1].total);

  const group = data.group;
  return {
    data,
    txs: [...txs].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
    income,
    expense,
    net: income - expense,
    spending,
    spendingWallet,
    merchantList,
    group,
    memberName: profileId && profileId !== "all" ? data.members.find((m) => m.id === profileId)?.name : "Semua Anggota",
  };
}

/** GET /api/reports/export?format=pdf|xlsx&from=&to=&profileId= */
router.get("/export", requireAuth, async (req: Request, res: Response) => {
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const from = (req.query.from as string | undefined) ?? undefined;
  const to = (req.query.to as string | undefined) ?? undefined;
  const profileId = (req.query.profileId as string | undefined) ?? "all";

  const report = computeReport(req.groupId!, from, to, profileId);
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Catatin";
    const ws = wb.addWorksheet("Laporan");
    ws.columns = [
      { header: "Tanggal", key: "tanggal", width: 14 },
      { header: "Jenis", key: "jenis", width: 12 },
      { header: "Merchant / Keterangan", key: "merchant", width: 32 },
      { header: "Kategori", key: "kategori", width: 20 },
      { header: "Wallet", key: "wallet", width: 18 },
      { header: "Nominal (IDR)", key: "nominal", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow(["Ringkasan", "", "", "", "", ""]);
    ws.addRow(["Pemasukan", fmtIDR(report.income)]);
    ws.addRow(["Pengeluaran", fmtIDR(report.expense)]);
    ws.addRow(["Arus kas bersih", fmtIDR(report.net)]);
    ws.addRow([]);
    ws.addRow(["Detail Transaksi", "", "", "", "", ""]);
    for (const t of report.txs) {
      const cat = report.data.categories.find((c) => c.id === t.categoryId)?.name ?? "";
      const wallet = report.data.wallets.find((w) => w.id === t.walletId)?.name ?? "";
      ws.addRow({
        tanggal: String(t.occurredAt ?? "").slice(0, 10),
        jenis: t.type === "income" ? "Pemasukan" : t.type === "credit_card_settlement" ? "Settlement CC" : "Pengeluaran",
        merchant: String(t.merchant ?? ""),
        kategori: cat,
        wallet,
        nominal: t.type === "income" ? fmtIDR(Number(t.amount ?? 0)) : fmtIDR(-Number(t.amount ?? 0)),
      });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="catatin-laporan-${dateStamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
    return;
  }

  // PDF
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="catatin-laporan-${dateStamp}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).text("Laporan Keuangan Catatin", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#64748b")
    .text(`${report.group.name} · ${report.memberName} · ${periodLabel(from, to)}`, { align: "center" })
    .text(`Dibuat ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`, { align: "center" });
  doc.moveDown();
  doc.fillColor("#0f172a");

  doc.fontSize(11).text("Ringkasan", { underline: true });
  doc.moveDown(0.2);
  const rows: [string, string][] = [
    ["Pemasukan", fmtIDR(report.income)],
    ["Pengeluaran", fmtIDR(report.expense)],
    ["Arus kas bersih", fmtIDR(report.net)],
  ];
  drawTable(doc, rows, [120, 120]);
  doc.moveDown();

  if (report.spending.length > 0) {
    doc.fontSize(11).text("Pengeluaran per Kategori", { underline: true });
    doc.moveDown(0.2);
    drawTable(doc, report.spending.map((s) => [s.name, fmtIDR(s.total)] as [string, string]), [150, 120]);
    doc.moveDown();
  }
  if (report.merchantList.length > 0) {
    doc.fontSize(11).text("Merchant Teratas", { underline: true });
    doc.moveDown(0.2);
    drawTable(doc, report.merchantList.slice(0, 8).map(([name, m]) => [`${name} (${m.count}x)`, fmtIDR(m.total)] as [string, string]), [180, 120]);
    doc.moveDown();
  }

  doc.fontSize(11).text(`Detail Transaksi (${report.txs.length})`, { underline: true });
  doc.moveDown(0.2);
  for (const t of report.txs.slice(0, 50)) {
    const type = t.type === "income" ? "Pemasukan" : t.type === "credit_card_settlement" ? "Settlement CC" : "Pengeluaran";
    const sign = t.type === "income" ? "+" : "-";
    doc.fontSize(8.5).fillColor("#334155")
      .text(`${String(t.occurredAt ?? "").slice(0, 10)} · ${type} · ${String(t.merchant ?? "")}`, { width: 430, lineBreak: false });
    doc.text(`${sign}${fmtIDR(Number(t.amount ?? 0))}`, { align: "right", width: 130 });
  }
  doc.fillColor("#0f172a");
  doc.end();
});

function drawTable(doc: PDFKit.PDFDocument, rows: [string, string][], widths: [number, number]): void {
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) doc.fillColor("#f1f5f9").rect(40, doc.y - 3, 250, 16).fill();
    doc.fillColor("#0f172a").fontSize(9.5);
    doc.text(k, 40, doc.y, { width: widths[0], lineBreak: false });
    doc.text(v, { align: "right", width: widths[1] });
  });
}

export default router;