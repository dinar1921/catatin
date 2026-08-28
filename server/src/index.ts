import { createApp } from "./app.js";
import { db } from "./db/index.js";
import { startTelegramPoller } from "./services/telegram-bot.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[server] Catatin API berjalan di http://localhost:${PORT}`);
  // Long polling Telegram (mode token + chat ID) — otomatis aktif bila bot token tersimpan.
  startTelegramPoller();
});

/**
 * R07-D: graceful shutdown.
 * Urutan: berhenti menerima koneksi baru → tutup HTTP server → tutup DB → exit bersih.
 */
function shutdown(signal: string) {
  console.log(`[server] Menerima ${signal}, memulai shutdown yang aman...`);
  server.close(() => {
    console.log("[server] HTTP server ditutup.");
    try {
      db.close();
      console.log("[server] Database ditutup dengan aman.");
    } catch (e) {
      console.error("[server] Gagal menutup database:", e);
    }
    process.exit(0);
  });

  // Fallback: paksa keluar bila server tidak bisa ditutup dalam 10 detik.
  setTimeout(() => {
    console.error("[server] Timeout shutdown — memaksa keluar.");
    try {
      db.close();
    } catch {
      /* abaikan */
    }
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));