import { nid } from "../db/sql.js";
import { db } from "../db/index.js";

export function logActivity(
  groupId: string | null,
  profileId: string | null,
  action: string,
  details?: Record<string, unknown>,
) {
  db.prepare(
    "INSERT INTO audit_logs (id, group_id, profile_id, action, details_json, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
  ).run(nid("al"), groupId, profileId, action, JSON.stringify(details ?? {}));
}