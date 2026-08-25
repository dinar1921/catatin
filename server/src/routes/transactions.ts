import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const itemSchema = z.object({ itemName: z.string(), quantity: z.number(), unitPrice: z.number(), totalPrice: z.number() });
const billSchema = z.object({
  kind: z.enum(["regular", "recurring", "installment"]),
  amount: z.number().optional(),
  dueDay: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  tenor: z.number().nullable().optional(),
  installmentAmount: z.number().nullable().optional(),
  title: z.string().optional(),
});

const createTxSchema = z.object({
  type: z.enum(["income", "expense", "credit_card_settlement"]),
  amount: z.number().min(1),
  categoryId: z.string(),
  walletId: z.string(),
  paymentMethod: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  occurredAt: z.string(),
  merchant: z.string(),
  description: z.string().optional().default(""),
  ownerProfileId: z.string(),
  source: z.string().optional().default("manual"),
  attachment: z.any().nullable().optional(),
  items: z.array(itemSchema).optional().default([]),
  bill: billSchema.nullable().optional(),
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** GET /api/transactions — daftar transaksi group dengan filter opsional */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const { q, type, walletId, categoryId, from, to, profileId, limit } = req.query as Record<string, string | undefined>;
  const clauses = ["group_id = ?"];
  const params: unknown[] = [groupId];
  if (type && type !== "all") {
    clauses.push("type = ?");
    params.push(type);
  }
  if (walletId) { clauses.push("wallet_id = ?"); params.push(walletId); }
  if (categoryId) { clauses.push("category_id = ?"); params.push(categoryId); }
  if (from) { clauses.push("occurred_at >= ?"); params.push(from); }
  if (to) { clauses.push("occurred_at <= ?"); params.push(to); }
  if (profileId && profileId !== "all") { clauses.push("owner_profile_id = ?"); params.push(profileId); }
  let sql = `SELECT * FROM transactions WHERE ${clauses.join(" AND ")} ORDER BY occurred_at DESC`;
  if (limit) {
    const lim = parseInt(limit, 10);
    if (!Number.isNaN(lim) && lim > 0) { sql += ` LIMIT ${Math.min(lim, 1000)}`; }
  }
    const rows = db.prepare(sql).all(...svs(params)) as Record<string, unknown>[];
  res.json({ transactions: rows });
});

/** POST /api/transactions — buat transaksi + opsional bill/installment */
router.post("/", requireAuth, (req: Request, res: Response) => {
  const parsed = createTxSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const input = parsed.data;
  const groupId = req.groupId!;
  const txId = nid("t");
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    let billId: string | null = null;
    let installmentId: string | null = null;
    let bills = [];
    let installments = [];

    if (input.bill) {
      const b = input.bill;
      billId = nid("b");
      const billAmount = b.kind === "installment" ? (b.amount ?? input.amount) : input.amount;
      db.prepare(`INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, counterparty, frequency, due_day, due_date, is_active, owner_profile_id, notes)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, '', ?, ?, ?, 1, ?, '')`)
        .run(sv(billId), sv(groupId), sv(b.title || input.merchant || "Tagihan"), sv(b.kind), sv(billAmount),
          sv(input.categoryId), sv(input.walletId), sv(input.creditCardId ?? null), sv(b.frequency ?? null), sv(b.dueDay ?? null), sv(b.dueDate ?? null), sv(input.ownerProfileId));

      if (b.kind === "installment" && b.tenor && b.installmentAmount) {
        installmentId = nid("i");
        db.prepare(`INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
          .run(sv(installmentId), sv(groupId), sv(billId), sv(b.title || input.merchant || "Tagihan"), sv(billAmount), sv(b.installmentAmount), sv(b.tenor), sv(input.occurredAt), sv(b.dueDay ?? 1));
      }
    }

    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sv(txId), sv(groupId), sv(input.type), sv(input.source), sv(input.amount), sv(input.categoryId), sv(input.walletId),
        sv(input.paymentMethod ?? null), sv(input.creditCardId ?? null), sv(input.occurredAt), sv(input.merchant), sv(input.description ?? ""),
        sv(input.ownerProfileId), sv(req.profile!.id), sv(billId), sv(installmentId),
        input.attachment ? JSON.stringify(input.attachment) : null, JSON.stringify(input.items ?? []), now);

    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "transaction.create", { transactionId: txId, type: input.type, amount: input.amount });
    res.status(201).json({ id: txId });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[transactions] POST error:", err);
    res.status(500).json({ error: "Gagal membuat transaksi" });
  }
});

/** PATCH /api/transactions/:id */
router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const existing = db.prepare("SELECT id FROM transactions WHERE id = ? AND group_id = ?").get(id, groupId);
  if (!existing) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }
  const patch = req.body ?? {};
  const fields = ["type", "amount", "categoryId", "walletId", "paymentMethod", "occurredAt", "merchant", "description", "ownerProfileId"];
  const setClauses: string[] = [];
  const params: unknown[] = [];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      const col = f === "categoryId" ? "category_id" : f === "walletId" ? "wallet_id" : f === "paymentMethod" ? "payment_method" : f === "occurredAt" ? "occurred_at" : f === "ownerProfileId" ? "owner_profile_id" : f;
      setClauses.push(`${col} = ?`);
      params.push(patch[f]);
    }
  }
  if (patch.attachment !== undefined) {
    setClauses.push("attachment_json = ?");
    params.push(patch.attachment ? JSON.stringify(patch.attachment) : null);
  }
  if (patch.items !== undefined) {
    setClauses.push("items_json = ?");
    params.push(JSON.stringify(patch.items));
  }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, groupId);
  db.prepare(`UPDATE transactions SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  logActivity(groupId, req.profile!.id, "transaction.update", { transactionId: id, patch });
  res.json({ ok: true });
});

/** DELETE /api/transactions/:id — hapus + restore bill/installment/statement */
router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const t = db.prepare("SELECT * FROM transactions WHERE id = ? AND group_id = ?").get(id, groupId) as Record<string, unknown> | undefined;
  if (!t) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }

  db.exec("BEGIN");
  try {
    if (t.bill_id) {
      const billAmt = (t.type === "expense" || t.type === "credit_card_settlement") ? Number(t.amount ?? 0) : 0;
      db.prepare("UPDATE bills SET paid_amount = MAX(0, paid_amount - ?) WHERE id = ? AND group_id = ?").run(sv(billAmt), sv(t.bill_id), sv(groupId));
    }
    if (t.credit_card_id && t.type === "credit_card_settlement") {
      db.prepare("UPDATE statements SET paid_amount = MAX(0, paid_amount - ?) WHERE credit_card_id = ? AND group_id = ?").run(sv(t.amount ?? 0), sv(t.credit_card_id), sv(groupId));
    }
    if (t.installment_id) {
      db.prepare("UPDATE installments SET paid_count = MAX(0, paid_count - 1) WHERE id = ? AND group_id = ?").run(sv(t.installment_id), sv(groupId));
    }
    db.prepare("DELETE FROM transactions WHERE id = ? AND group_id = ?").run(id, groupId);
    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "transaction.delete", { transactionId: id });
    res.json({ ok: true });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[transactions] DELETE error:", err);
    res.status(500).json({ error: "Gagal menghapus transaksi" });
  }
});

export default router;