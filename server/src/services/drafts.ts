import { db } from "../db/index.js";
import { sv, nid } from "../db/sql.js";
import { logActivity } from "./audit.js";
import { assertCreditCardOwnership, assertProfileOwnership, firstValidationError } from "../validation.js";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ApproveResult { txId: string }

/**
 * Approve draft → buat transaksi (source of truth) + update status draft.
 * Dipakai oleh route approvals dan callback inline keyboard bot Telegram.
 */
export function approveDraftById(
  groupId: string,
  draftId: string,
  actorProfileId: string,
  patch?: Record<string, unknown>,
): ApproveResult {
  const draft = db.prepare("SELECT * FROM drafts WHERE id = ? AND group_id = ?").get(draftId, groupId) as Record<string, unknown> | undefined;
  if (!draft) throw new Error("Draft tidak ditemukan");
  if (draft.status === "approved" || draft.status === "rejected") throw new Error("Draft sudah diproses");

  const merged = { ...draft, ...(patch ?? {}) };
  const amount = Number(merged.amount ?? 0);
  if (amount <= 0) throw new Error("Nominal tidak valid");

  // ---- Ownership validation untuk field yang mungkin di-patch ----
  const validationErr = firstValidationError([
    () => assertProfileOwnership(db, (merged.ownerProfileId ?? merged.owner_profile_id) as string | null | undefined, groupId),
    () => assertCreditCardOwnership(db, (merged.creditCardId ?? merged.credit_card_id) as string | null | undefined, groupId),
  ]);
  if (validationErr) throw new Error(validationErr);

  const transactionType = ["income", "expense"].includes(merged.transaction_type as string) ? merged.transaction_type as string : "expense";
  const occurredAt = (merged.occurredAt ?? merged.occurred_at ?? todayISO()) as string;
  const merchant = String(merged.merchant ?? "");
  const description = String(merged.description ?? "");

  let categoryId = (merged.categoryId ?? merged.category_id ?? null) as string | null;
  let walletId = (merged.walletId ?? merged.wallet_id ?? null) as string | null;
  if (categoryId && !db.prepare("SELECT id FROM categories WHERE id = ? AND group_id = ?").get(categoryId, groupId)) {
    throw new Error("Kategori tidak valid");
  }
  if (walletId) {
    if (!db.prepare("SELECT id FROM wallets WHERE id = ? AND group_id = ?").get(walletId, groupId)) {
      throw new Error("Wallet tidak valid");
    }
  } else {
    // wallets tidak punya created_at — urutkan by id (id ber-awalan timestamp).
    const firstWallet = db.prepare("SELECT id FROM wallets WHERE group_id = ? ORDER BY id ASC LIMIT 1").get(groupId) as
      | { id: string }
      | undefined;
    walletId = firstWallet?.id ?? null;
  }

  const paymentMethod = (merged.paymentMethod ?? merged.payment_method ?? null) as string | null;
  const ownerProfileId = (merged.ownerProfileId ?? merged.owner_profile_id ?? actorProfileId) as string;
  const itemsJson = Array.isArray(merged.items)
    ? JSON.stringify(merged.items)
    : typeof merged.items_json === "string" ? merged.items_json : "[]";
  let attachmentJson: string | null = null;
  if (merged.attachment && typeof merged.attachment === "object") {
    attachmentJson = JSON.stringify(merged.attachment);
  } else if (typeof merged.attachment_json === "string") {
    attachmentJson = merged.attachment_json;
  }

  const source = merged.source as string;
  const sourceMap: Record<string, string> = { receipt_ocr: "receipt_ocr", hermes: "hermes", telegram: "telegram", whatsapp: "whatsapp" };
  const txSource = sourceMap[source] ?? "telegram";
  const txId = nid("t");
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO transactions (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
      .run(sv(txId), sv(groupId), sv(transactionType), sv(txSource), sv(amount), sv(categoryId), sv(walletId),
        sv(paymentMethod), sv(occurredAt), sv(merchant), sv(description), sv(ownerProfileId),
        sv(actorProfileId), sv(attachmentJson), sv(itemsJson), now);

    db.prepare("UPDATE drafts SET status = 'approved', transaction_id = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ? AND group_id = ?")
      .run(sv(txId), sv(actorProfileId), sv(now), sv(now), sv(draftId), sv(groupId));

    db.prepare(`INSERT INTO notifications (id, group_id, kind, title, body, link_to, read, created_at)
      VALUES (?, ?, 'system', ?, ?, '/transactions', 0, ?)`)
      .run(sv(nid("n")), sv(groupId), sv("Draft disetujui"), sv(`Transaksi "${merchant}" sebesar ${amount.toLocaleString("id-ID")} berhasil disimpan.`), sv(todayISO()));

    db.exec("COMMIT");
    logActivity(groupId, actorProfileId, "approval.approve", { draftId, transactionId: txId });
    return { txId };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Reject draft — set status rejected (alasan opsional). */
export function rejectDraftById(groupId: string, draftId: string, actorProfileId: string, reason?: string | null): void {
  const draft = db.prepare("SELECT id FROM drafts WHERE id = ? AND group_id = ?").get(draftId, groupId);
  if (!draft) throw new Error("Draft tidak ditemukan");
  const now = new Date().toISOString();
  db.prepare("UPDATE drafts SET status = 'rejected', rejected_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND group_id = ?")
    .run(sv(reason ?? null), sv(actorProfileId), sv(now), sv(now), sv(draftId), sv(groupId));
  logActivity(groupId, actorProfileId, "approval.reject", { draftId, reason: reason ?? null });
}