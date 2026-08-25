import type { NextFunction, Request, Response } from "express";

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!allowedOrigins.includes("http://127.0.0.1:5173")) allowedOrigins.push("http://127.0.0.1:5173");

/**
 * Origin check (Decision 7): tolak semua request non-GET bila header `Origin`
 * ada dan tidak termasuk daftar origin yang diizinkan. Request tanpa Origin
 * (curl, same-origin navigation, webhook dari server) tidak ditolak.
 */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "Forbidden: origin tidak diizinkan" });
    return;
  }
  next();
}

/** Rate limiter in-memory sederhana per key (mis. IP). */
export function rateLimit(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi nanti." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
