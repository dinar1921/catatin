import sharp from "sharp";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { db } from "../db/index.js";
import { sv, nid } from "../db/sql.js";
import { ensureUploadsDir, UPLOADS_DIR } from "./uploads.js";
import { getProvider, getAiSettings, getCredentials, type ExtractedReceipt } from "./ai/index.js";

ensureUploadsDir();

export interface AttachmentResult {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

export interface ProcessReceiptResult {
  draftId: string;
  attachment: AttachmentResult;
  extracted: ExtractedReceipt;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtIDR(n: number): string {
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Deskripsi dari hasil ekstraksi: fakta struk (invoice/kasir/…), rincian item, lalu metode bayar. */
function buildReceiptDescription(ext: ExtractedReceipt): string {
  const lines: string[] = [];
  for (const d of ext.details) lines.push(d);
  if (ext.items.length > 0) {
    lines.push(ext.items.map((i) => `${i.itemName} x${i.quantity} @${fmtIDR(i.unitPrice)}`).join("\n"));
  }
  if (ext.paymentDetail) lines.push(`Bayar: ${ext.paymentDetail}`);
  if (ext.paymentMethod) lines.push(`Metode: ${ext.paymentMethod}`);
  return lines.join("\n") || "Hasil scan struk";
}

/**
 * Proses gambar struk: resize/kompresi sharp → simpan file → ekstraksi AI
 * (OpenAI-compatible bila dikonfigurasi, fallback heuristic) → buat draft.
 * Dipakai oleh route /api/receipts/upload dan webhook bot (foto).
 */
export async function processReceiptImage(
  buf: Buffer,
  groupId: string,
  source: "receipt_ocr" | "telegram" | "whatsapp",
  profileId: string | null,
): Promise<ProcessReceiptResult> {
  const processed = await sharp(buf)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = `${crypto.randomUUID()}.webp`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), processed);

  const attachment: AttachmentResult = {
    id: nid("att"),
    fileName,
    mimeType: "image/webp",
    dataUrl: `/api/receipts/${fileName}`,
  };

  const aiConfig = getAiSettings(groupId);
  const cred = getCredentials(groupId);
  const extracted = await getProvider(aiConfig, cred?.apiKey ?? null).extractReceipt(processed.toString("base64"));

  const draftId = nid("d");
  const now = new Date().toISOString();
  const description = buildReceiptDescription(extracted);
  db.prepare(`INSERT INTO drafts (id, group_id, source, transaction_type, amount, category_id, wallet_id, occurred_at, merchant, description, items_json, attachment_json, uncertain_fields_json, validation_messages_json, status, owner_profile_id, created_at, updated_at)
    VALUES (?, ?, ?, 'expense', ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 'in_review', ?, ?, ?)`)
    .run(
      sv(draftId), sv(groupId), sv(source), sv(extracted.amount), sv(todayISO()), sv(extracted.merchant), sv(description),
      sv(JSON.stringify(extracted.items)),
      sv(JSON.stringify(attachment)),
      sv(JSON.stringify(extracted.uncertainFields)),
      sv(JSON.stringify(extracted.validationMessages)),
      sv(profileId), sv(now), sv(now),
    );

  return { draftId, attachment, extracted };
}