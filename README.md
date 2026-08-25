# Catatin

Catatan keuangan keluarga / pasangan / kelompok kecil yang sederhana, modern, dan mobile-first.

> "Wah, ternyata Catatin bisa jelasin pengeluaran ke mana saja dan bantu manage uang jadi lebih simple."

## Fitur

- **Transaksi** — input manual pemasukan/pengeluaran, format IDR otomatis + terbilang.
- **Wallet** — personal & shared, saldo otomatis dari transaksi, transfer antar-wallet.
- **Kategori** — kelola kategori, saran kategori dari riwayat merchant (merchant memory).
- **Budget** — budget per kategori dengan indikator aman/waspada/lebih.
- **Tagihan (Unified Bills)** — biasa, berulang, hutang/piutang, cicilan, kartu kredit. Bayar parsial/lunas, guard anti pembayaran ganda.
- **Kartu Kredit** — akumulasi kewajiban per statement, settlement tidak double-counting.
- **Laporan** — KPI, per kategori/wallet, merchant, budget, tagihan; export PDF & Excel.
- **Group/Family** — beberapa profil berbagi satu dashboard.
- **Member management** — admin buat akun anggota, ubah role, hapus (soft).
- **Approval Inbox** — satu-satunya jalur mutasi finansial dari AI/bot/Hermes.
- **Notification Center** — notifikasi derived (tagihan due/overdue, draft menunggu).
- **Scan Struk (OCR)** — upload → validasi magic bytes → kompresi → draft → review → approve.
- **AI/OCR Config** — provider heuristic/Gemini/OpenAI/Claude/custom, API key, test koneksi.
- **Telegram** — long polling (tanpa webhook), setup token + chat ID, catat transaksi dari chat/foto, AI deteksi income/expense, klarifikasi, tombol Setujui/Tolak.
- **WhatsApp** — webhook Meta Cloud API (verifikasi signature + challenge).
- **Hermes API** — API key management (buat/revoke/rotate, hash SHA-256).
- **Keamanan** — Argon2id, cookie session httpOnly, CSRF origin check, rate limit, audit log, verifikasi webhook.

## Tech Stack

- Frontend: React 19, Vite 6, TypeScript, Tailwind CSS 4, React Router 7
- Backend: Node.js, Express 4, TypeScript (tsx)
- Database: SQLite (`node:sqlite` bawaan, WAL)
- Auth: `@node-rs/argon2`, cookie session
- Upload/OCR: `multer`, `sharp`
- Laporan: `pdfkit`, `exceljs`
- Validasi: `zod`

## Prasyarat

- Node.js >= 22 (dipakai `node:sqlite` bawaan — tidak butuh better-sqlite3)

## Cara Menjalankan

```powershell
# Install dependensi
npm install
cd server
npm install
cd ..

# Terminal 1 — backend
cd server
npm run dev          # http://localhost:3001

# Terminal 2 — frontend
npm run dev          # http://localhost:5173
```

Buka **http://localhost:5173**.

### Login Demo

```
Email:    dinar@keluarga.id
Password: demo123
```

Data demo dibuat lewat `cd server && npm run seed`.

---

## Deployment — EasyPanel (Home Server)

EasyPanel menjalankan container Docker dan menangani domain + SSL otomatis. Cara terbaik: **deploy dari Git repo menggunakan Dockerfile** (sudah tersedia di repo ini).

### Persiapan (sekali)
1. Push repo ini ke GitHub/GitLab (bisa private).
2. Pastikan DNS domain (mis. `catatin.domain.com`) diarahkan ke IP home server.

### Langkah di EasyPanel
1. **New Project** → tipe **Dockerfile** (deploy from Git).
2. Isi **Git Repository URL** + **Branch** (`main`).
3. **Domain**: `catatin.domain.com` — EasyPanel otomatis membuat reverse proxy + SSL (Traefik/Let's Encrypt).
4. **Environment variables**:
   | Key | Value |
   |-----|-------|
   | `DATA_DIR` | `/data` |
   | `PORT` | `3001` |
   | `CORS_ORIGIN` | `https://catatin.domain.com` |
   | `PUBLIC_BASE_URL` | `https://catatin.domain.com` |
   | `TZ` | `Asia/Jakarta` |
   | `WHATSAPP_WEBHOOK_SECRET` / `WHATSAPP_VERIFY_TOKEN` | opsional |
5. **Volume**: tambah satu volume (persistent) yang di-mount ke path **`/data`** — berisi seluruh data aplikasi (SQLite + file struk).
6. Deploy. Setelah aktif, buka domain → buat akun → login demo / register.

> Container port `3001` (sesuai `EXPOSE`). Jika EasyPanel meminta port, isi `3001`.

### Update versi
Di EasyPanel: buka project → **Deploy** (atau set auto-deploy dari webhook Git).

### Backup
Backup cukup satu lokasi: isi volume `/data` (folder `catatin-data`).
- Database: `catatin.db` (WAL: sertakan juga `catatin.db-wal` saat server berhenti)
- File struk: `uploads/receipts/`

---

## Deployment — Docker Compose (opsional, non-EasyPanel)

Satu image berisi **frontend (React build) + backend (Express) + bot** — satu port `3001`, tanpa butuh URL publik (Telegram pakai long polling).

```bash
cp .env.example .env   # isi CORS_ORIGIN & PUBLIC_BASE_URL
docker compose up -d --build
```

Volume persisten: `catatin-data` (named volume) → `/data` di dalam container.

## Script

Root (`package.json`):

| Script | Fungsi |
|--------|--------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc --noEmit` |

Server (`server/package.json`):

| Script | Fungsi |
|--------|--------|
| `npm run dev` | API dengan watch (`tsx watch`) |
| `npm start` | API tanpa watch |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Seed ulang database demo |

## Environment Variables

Buat `.env` di folder `server/`:

| Variabel | Deskripsi | Default |
|----------|-----------|---------|
| `PORT` | Port API | `3001` |
| `CORS_ORIGIN` | Origin diizinkan (comma-separated) | `http://localhost:5173` |
| `PUBLIC_BASE_URL` | URL publik server (hanya untuk mode webhook) | `http://localhost:3001` |
| `TELEGRAM_BOT_SECRET` | Secret token webhook Telegram (hanya mode webhook) | `""` |
| `TELEGRAM_API_BASE` | Base URL Telegram Bot API (untuk proxy/self-host) | `https://api.telegram.org` |
| `TELEGRAM_BOT_USERNAME` | Username bot default | `catatin_bot` |
| `WHATSAPP_WEBHOOK_SECRET` | Secret HMAC webhook WhatsApp | `""` |
| `WHATSAPP_VERIFY_TOKEN` | Verify token webhook WhatsApp (Meta) | `""` |

Token bot Telegram & API key AI bisa dikonfigurasi dari halaman Settings (tersimpan di DB).

## Struktur

```
src/                  # Frontend (React + Vite)
  lib/                # api.ts (client), types.ts, derive.ts, format.ts, dates.ts
  data/               # store.tsx (state + optimistic), seed.ts
  components/         # ui.tsx, layout.tsx, TransactionList.tsx
  features/           # dashboard, transactions, bills, wallets, budget, reports,
                      # approvals, notifications, scan, settings, profile, auth
server/src/           # Backend (Express + TS)
  db/                 # schema.ts, seed.ts, sql.ts
  middleware/         # auth.ts, security.ts
  routes/             # auth, dashboard, transactions, wallets, budgets, categories,
                      # groups, members, bills, approvals, api-keys, settings, reports,
                      # ocr, receipts, webhooks, telegram, whatsapp, profile, notifications
  services/           # serializer, notifications, audit, uploads, ai
server/server/data/   # Database SQLite (otomatis dibuat)
```

## Endpoint API Utama

| Metode | Path | Keterangan |
|--------|------|------------|
| POST | `/api/auth/register` | Daftar akun (buat group + wallet + kategori) |
| POST | `/api/auth/login` / `/logout` | Login / logout (cookie session) |
| POST | `/api/auth/change-password` | Ubah password |
| GET / DELETE | `/api/auth/sessions` | Daftar / cabut session |
| GET | `/api/dashboard` | Seluruh data group (AppData) |
| GET/POST/PATCH/DELETE | `/api/transactions` | CRUD transaksi + bill/installment |
| GET/POST/PATCH/DELETE | `/api/wallets`, `/api/budgets`, `/api/categories` | CRUD |
| POST | `/api/wallets/transfer` | Transfer antar-wallet |
| POST | `/api/bills/:id/pay` | Bayar tagihan |
| POST | `/api/members` | Buat akun anggota (admin) |
| GET/POST/DELETE | `/api/approvals` | Draft: list, approve, reject, delete |
| POST | `/api/receipts/upload` | Upload struk → draft |
| GET | `/api/receipts/:file` | Ambil file struk (terproteksi) |
| GET/POST/DELETE | `/api/api-keys` | API key Hermes |
| GET/PUT | `/api/settings/ai` | Konfigurasi AI + API key |
| POST | `/api/settings/ai/test` | Test koneksi provider AI |
| GET | `/api/reports/export?format=pdf\|xlsx` | Export laporan |
| POST | `/api/telegram/config` | Simpan token bot Telegram (validasi getMe) |
| POST | `/api/telegram/connect` | Hubungkan chat ID ke group (mode polling) |
| POST | `/api/telegram/bind-code` | Link koneksi chat (opsional, mode webhook) |
| POST | `/api/telegram/set-webhook` | Pasang webhook (opsional, butuh URL publik) |
| GET/POST | `/api/webhooks/telegram`, `/api/webhooks/whatsapp` | Webhook bot (opsional) |

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Popup menutup sendiri / halaman tiba-tiba reload | Pastikan `vite.config.ts` punya `watch.ignored: ["**/server/**"]`, restart `npm run dev` |
| better-sqlite3 gagal build | Tidak dipakai — backend memakai `node:sqlite` Node >= 22 |
| Telegram tidak terima pesan | Default mode long polling (tanpa webhook). Pastikan bot token disimpan di Settings → Telegram dan chat sudah di-hubungkan lewat Chat ID |
| Bot tidak membalas chat | Chat belum di-hubungkan. Kirim pesan apa pun ke bot → bot membalas dengan Chat ID → masukkan Chat ID di Settings → Telegram → Hubungkan |
| Login gagal | Jalankan `npm run seed` di `server/` |

## Status

- ✅ Frontend lengkap, backend API + SQLite + auth + OCR + webhook + audit log + export laporan.
- ⏳ Dalam antrian: endpoint Hermes lengkap (cursor pagination), provider AI asli, insight mengikuti periode filter, Docker/deployment.
