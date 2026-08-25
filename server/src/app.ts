import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import { originCheck } from "./middleware/security.js";
import authRouter from "./routes/auth.js";
import profileRouter from "./routes/profile.js";
import dashboardRouter from "./routes/dashboard.js";
import notificationsRouter from "./routes/notifications.js";
import transactionsRouter from "./routes/transactions.js";
import walletsRouter from "./routes/wallets.js";
import budgetsRouter from "./routes/budgets.js";
import categoriesRouter from "./routes/categories.js";
import groupsRouter from "./routes/groups.js";
import membersRouter from "./routes/members.js";
import billsRouter from "./routes/bills.js";
import approvalsRouter from "./routes/approvals.js";
import reportsRouter from "./routes/reports.js";
import apiKeysRouter from "./routes/api-keys.js";
import settingsRouter from "./routes/settings.js";
import ocrRouter from "./routes/ocr.js";
import receiptsRouter from "./routes/receipts.js";
import webhooksRouter from "./routes/webhooks.js";
import telegramRouter from "./routes/telegram.js";
import whatsappRouter from "./routes/whatsapp.js";

interface RequestWithRaw extends express.Request {
  rawBody?: Buffer;
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  // Simpan raw body untuk verifikasi signature webhook (Decision F).
  app.use(express.json({ verify: (req, _res, buf) => { (req as RequestWithRaw).rawBody = buf; } }));
  app.use(cookieParser());
  app.use(originCheck);
  app.use(optionalAuth);

  // Webhooks (tanpa requireAuth — verifikasi via signature/secret sendiri)
  app.use("/api/webhooks", webhooksRouter);

  // Auth (rate limit hanya login & register — lihat routes/auth.ts)
  app.use("/api/auth", authRouter);

  // Protected
  app.use("/api", requireAuth, dashboardRouter);
  app.use("/api", requireAuth, notificationsRouter);
  app.use("/api/transactions", requireAuth, transactionsRouter);
  app.use("/api/wallets", requireAuth, walletsRouter);
  app.use("/api/budgets", requireAuth, budgetsRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/groups", requireAuth, groupsRouter);
  app.use("/api/bills", requireAuth, billsRouter);
  app.use("/api/approvals", requireAuth, approvalsRouter);
  app.use("/api/reports", requireAuth, reportsRouter);
  app.use("/api/api-keys", requireAuth, apiKeysRouter);
  app.use("/api/settings", requireAuth, settingsRouter);
  app.use("/api/receipts", requireAuth, ocrRouter);
  app.use("/api/receipts", requireAuth, receiptsRouter);
  app.use("/api/profile", requireAuth, profileRouter);
  app.use("/api/members", requireAuth, membersRouter);
  app.use("/api/telegram", requireAuth, telegramRouter);
  app.use("/api/whatsapp", requireAuth, whatsappRouter);

  // 404 untuk /api yang tidak dikenal
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint tidak ditemukan" });
  });

  // Sajikan frontend produksi (React SPA) bila build tersedia — satu image, satu port.
  // Di dev, direktori ini tidak berisi index.html sehingga dilewati (vite yang melayani).
  const distDir = path.resolve(process.cwd(), "dist");
  const indexHtml = path.join(distDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        res.sendFile(indexHtml); // history fallback SPA
      } else {
        next();
      }
    });
  }

  return app;
}
