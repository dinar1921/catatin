import { createApp } from "./app.js";
import { startTelegramPoller } from "./services/telegram-bot.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(PORT, () => {
  console.log(`[server] Catatin API berjalan di http://localhost:${PORT}`);
  // Long polling Telegram (mode token + chat ID) — otomatis aktif bila bot token tersimpan.
  startTelegramPoller();
});