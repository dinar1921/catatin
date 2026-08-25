import { Router, type Request, type Response } from "express";
import { getGroupData } from "../services/serializer.js";
import { buildDerivedNotifications, mergeNotifications } from "../services/notifications.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/notifications", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const data = getGroupData(groupId);
  const derived = buildDerivedNotifications(data);
  res.json(mergeNotifications(data.notifications, derived));
});

router.post("/notifications/:id/read", requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const groupId = req.groupId!;
  const row = db.prepare("SELECT id FROM notifications WHERE id = ? AND group_id = ?").get(id, groupId);
  if (!row) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan" });
    return;
  }
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND group_id = ?").run(id, groupId);
  res.json({ ok: true });
});

router.post("/notifications/read-all", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  db.prepare("UPDATE notifications SET read = 1 WHERE group_id = ?").run(groupId);
  res.json({ ok: true });
});

import { db } from "../db/index.js";

export default router;
