import { Router, type Request, type Response } from "express";
import { getGroupData } from "../services/serializer.js";
import { buildDerivedNotifications, mergeNotifications } from "../services/notifications.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** Mengembalikan seluruh AppData untuk group session (kontrak = src/lib/types.ts). */
router.get("/dashboard", requireAuth, (req: Request, res: Response) => {
  const groupId = req.groupId!;
  const data = getGroupData(groupId);
  const derived = buildDerivedNotifications(data);
  data.notifications = mergeNotifications(data.notifications, derived);
  res.json(data);
});

export default router;
