import { Router, type Request, type Response } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sv, svs } from "../db/sql.js";
import { safeUnlink } from "../services/uploads.js";
import { logActivity } from "../services/audit.js";
import { approveDraftById, rejectDraftById } from "../services/drafts.js";

const router = Router();

/** GET /api/approvals — daftar draft dengan filter source/status */
router.get("/", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const { source, status } = req.query as Record<string, string | undefined>;
  const clauses = ["group_id = ?"];
  const params: unknown[] = [groupId];
  if (source && source !== "all") { clauses.push("source = ?"); params.push(source); }
  if (status && status !== "all") { clauses.push("status = ?"); params.push(status); }
  const rows = db
    .prepare(`SELECT * FROM drafts WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
    .all(...svs(params)) as Record<string, unknown>[];
  res.json({ drafts: rows });
});

/** DELETE /api/approvals/:id — hapus draft (dan file attachment bila ada) */
router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const draft = db.prepare("SELECT attachment_json FROM drafts WHERE id = ? AND group_id = ?").get(id, groupId) as
    | { attachment_json: string | null }
    | undefined;
  if (!draft) {
    res.status(404).json({ error: "Draft tidak ditemukan" });
    return;
  }
  // Hapus file attachment bila mengarah ke /api/receipts/<file>
  try {
    if (draft.attachment_json) {
      const att = JSON.parse(draft.attachment_json) as { dataUrl?: string } | null;
      const m = att?.dataUrl?.match(/\/api\/receipts\/([^/?#]+)/);
      if (m?.[1]) safeUnlink(m[1]);
    }
  } catch { /* abaikan file cleanup */ }
  db.prepare("DELETE FROM drafts WHERE id = ? AND group_id = ?").run(sv(id), sv(groupId));
  logActivity(groupId, req.profile!.id, "approval.delete", { draftId: id });
  res.json({ ok: true });
});

/** POST /api/approvals/:id/approve — buat transaksi dari draft + set status approved */
router.post("/:id/approve", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  try {
    const { txId } = approveDraftById(groupId, id, req.profile!.id, (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json({ id: txId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyetujui draft";
    const status = msg.includes("tidak ditemukan") ? 404 : msg.includes("sudah diproses") ? 409 : msg.includes("tidak valid") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

/** POST /api/approvals/:id/reject — set status rejected */
router.post("/:id/reject", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  try {
    const reason = (req.body?.reason as string | undefined) ?? null;
    rejectDraftById(groupId, id, req.profile!.id, reason);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menolak draft";
    const status = msg.includes("tidak ditemukan") ? 404 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;