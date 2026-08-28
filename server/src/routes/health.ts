import { Router, type Request, type Response } from "express";
import { db } from "../db/index.js";
import { currentVersion } from "../db/migrate.js";

const router = Router();

/**
 * GET /api/health
 * Health-check endpoint untuk production readiness (R07-D).
 * - Tidak memerlukan autentikasi.
 * - Memverifikasi database dapat diakses dan versi migrasi terbaca.
 * - Tidak mengekspos secret, API key, atau kredensial.
 */
router.get("/", (_req: Request, res: Response) => {
  try {
    // Verifikasi koneksi database dengan query sederhana
    db.prepare("SELECT 1 AS ok").get();
    const version = currentVersion(db);
    res.status(200).json({
      status: "ok",
      version: "0.1.0",
      db: "ok",
      migrationVersion: version,
      uptime: Math.floor(process.uptime()),
    });
  } catch (e) {
    console.error("[health] Database tidak dapat diakses:", e);
    res.status(503).json({
      status: "error",
      version: "0.1.0",
      db: "error",
      uptime: Math.floor(process.uptime()),
    });
  }
});

export default router;