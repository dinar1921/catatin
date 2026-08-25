import type { NextFunction, Request, Response } from "express";
import { db } from "../db/index.js";
import { sv } from "../db/sql.js";

export const SESSION_COOKIE = "catatin_sid";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

export function createSession(profileId: string): string {
  const sid = crypto.randomUUID();
  db.prepare("INSERT INTO sessions (id, profile_id, expires_at) VALUES (?, ?, ?)").run(
    sv(sid), sv(profileId), Date.now() + SESSION_TTL_MS,
  );
  return sid;
}

export function destroySession(sid: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sv(sid));
}

export function resolveSession(sid: string): { profileId: string } | null {
  const row = db.prepare("SELECT profile_id, expires_at FROM sessions WHERE id = ?").get(sv(sid)) as
    | { profile_id: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sv(sid));
    return null;
  }
  return { profileId: row.profile_id };
}

/** Menyuntikkan `req.profile` dan `req.groupId` jika session valid. Tidak menolak bila tidak ada session. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const sid = (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
  if (sid) {
    const session = resolveSession(sid);
    if (session) {
      const profile = db
        .prepare("SELECT * FROM profiles WHERE id = ?")
        .get(session.profileId) as unknown as ProfileRow | undefined;
      if (profile && profile.is_active === 1) {
        req.profile = profile;
        req.groupId = profile.group_id;
      }
    }
  }
  next();
}

/** Menolak bila tidak ada session valid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  optionalAuth(req, res, () => {
    if (!req.profile) {
      res.status(401).json({ error: "Unauthorized: login diperlukan" });
      return;
    }
    next();
  });
}

/** Menolak bila profile bukan admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.profile?.role !== "admin") {
      res.status(403).json({ error: "Forbidden: hanya admin" });
      return;
    }
    next();
  });
}

export interface ProfileRow {
  id: string;
  group_id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  is_active: number;
  color: string;
  password_hash: string | null;
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  owner_profile_id: string;
  created_at: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      profile?: ProfileRow;
      groupId?: string;
    }
  }
}
