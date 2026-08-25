import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs, nid } from "../db/sql.js";
import { logActivity } from "../services/audit.js";

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, "Nama wallet wajib diisi"),
  scope: z.enum(["personal", "shared"]),
  ownerProfileId: z.string().nullable().optional(),
});

router.get("/", requireAuth, (req: Request, res: Response) => {
  const rows = db.prepare("SELECT * FROM wallets WHERE group_id = ?").all(req.groupId!) as Record<string, unknown>[];
  res.json({ wallets: rows });
});

router.post("/", requireAuth, (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { name, scope, ownerProfileId } = parsed.data;
  const id = nid("w");
  db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES (?, ?, ?, ?, ?)").run(
    sv(id), sv(req.groupId!), sv(name), sv(ownerProfileId ?? null), sv(scope),
  );
  logActivity(req.groupId!, req.profile!.id, "wallet.create", { walletId: id, name, scope });
  res.status(201).json({ id });
});

router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM wallets WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Wallet tidak ditemukan" });
    return;
  }
  const patch = req.body ?? {};
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { setClauses.push("name = ?"); params.push(patch.name); }
  if (patch.scope !== undefined) { setClauses.push("scope = ?"); params.push(patch.scope); }
  if (patch.ownerProfileId !== undefined) { setClauses.push("owner_profile_id = ?"); params.push(patch.ownerProfileId ?? null); }
  if (setClauses.length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diubah" });
    return;
  }
  params.push(id, req.groupId!);
  db.prepare(`UPDATE wallets SET ${setClauses.join(", ")} WHERE id = ? AND group_id = ?`).run(...svs(params));
  logActivity(req.groupId!, req.profile!.id, "wallet.update", { walletId: id, patch });
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT id FROM wallets WHERE id = ? AND group_id = ?").get(id, req.groupId!);
  if (!existing) {
    res.status(404).json({ error: "Wallet tidak ditemukan" });
    return;
  }
  const usage = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM transactions WHERE wallet_id = ? AND group_id = ?) +
        (SELECT COUNT(*) FROM bills WHERE wallet_id = ? AND group_id = ?) AS total`,
    )
    .get(id, req.groupId!, id, req.groupId!) as { total: number };
  if (usage.total > 0) {
    res.status(409).json({ error: `Wallet masih dipakai ${usage.total} data` });
    return;
  }
  db.prepare("DELETE FROM wallets WHERE id = ? AND group_id = ?").run(sv(id), sv(req.groupId!));
  logActivity(req.groupId!, req.profile!.id, "wallet.delete", { walletId: id });
  res.json({ ok: true });
});

const transferSchema = z.object({
  fromWalletId: z.string().min(1),
  toWalletId: z.string().min(1),
  amount: z.number().min(1),
  occurredAt: z.string().optional(),
  description: z.string().optional().default(""),
});

/**
 * POST /api/wallets/transfer
 * Transfer antar-wallet: expense di wallet asal + income di wallet tujuan (nominal sama),
 * dibuat dalam satu DB transaction agar saldo kedua wallet konsisten & traceable.
 * source='transfer_out' / 'transfer_in' dipakai untuk memfilter agregasi income/expense.
 */
router.post("/transfer", requireAuth, (req: Request, res: Response) => {
  const parsed = transferSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" });
    return;
  }
  const { fromWalletId, toWalletId, amount, occurredAt, description } = parsed.data;
  const groupId = req.groupId!;

  if (fromWalletId === toWalletId) {
    res.status(400).json({ error: "Wallet asal dan tujuan tidak boleh sama" });
    return;
  }

  const fromWallet = db.prepare("SELECT id, name FROM wallets WHERE id = ? AND group_id = ?").get(fromWalletId, groupId) as
    | { id: string; name: string }
    | undefined;
  const toWallet = db.prepare("SELECT id, name FROM wallets WHERE id = ? AND group_id = ?").get(toWalletId, groupId) as
    | { id: string; name: string }
    | undefined;
  if (!fromWallet) {
    res.status(404).json({ error: "Wallet asal tidak ditemukan" });
    return;
  }
  if (!toWallet) {
    res.status(404).json({ error: "Wallet tujuan tidak ditemukan" });
    return;
  }

  // Saldo asal (income - expense) harus mencukupi.
  const balRow = db
    .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS bal FROM transactions WHERE wallet_id = ? AND group_id = ?")
    .get(fromWalletId, groupId) as { bal: number };
  const balance = Number(balRow.bal);
  if (balance < amount) {
    res.status(400).json({ error: "Saldo wallet asal tidak mencukupi" });
    return;
  }

  const fromTxId = nid("t");
  const toTxId = nid("t");
  const now = new Date().toISOString();
  const date = occurredAt ?? now.slice(0, 10);
  const fromDesc = `Transfer ke ${toWallet.name}${description ? ` · ${description}` : ""}`;
  const toDesc = `Transfer dari ${fromWallet.name}${description ? ` · ${description}` : ""}`;

  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, 'expense', 'transfer_out', ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, '[]', ?)`)
      .run(sv(fromTxId), sv(groupId), sv(amount), sv(fromWalletId), sv(date), sv(fromWallet.name), sv(fromDesc), sv(req.profile!.id), sv(req.profile!.id), sv(now));
    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, 'income', 'transfer_in', ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, '[]', ?)`)
      .run(sv(toTxId), sv(groupId), sv(amount), sv(toWalletId), sv(date), sv(toWallet.name), sv(toDesc), sv(req.profile!.id), sv(req.profile!.id), sv(now));
    db.exec("COMMIT");
    logActivity(groupId, req.profile!.id, "wallet.transfer", { fromWalletId, toWalletId, amount });
    res.status(201).json({ fromTxId, toTxId });
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[wallets] transfer error:", err);
    res.status(500).json({ error: "Gagal memproses transfer" });
  }
});

export default router;
