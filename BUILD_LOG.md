# Catatin — BUILD_LOG Phase 1 (Frontend Product Experience)

**Tanggal:** 18 Agu 2026 · **Branch:** `phase-1-frontend` · **Skill:** executing-plans (frontend-design + design-taste-frontend untuk dashboard)

## Files changed (baru)
- Scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- `src/index.css` — design tokens (light+dark via CSS vars, Plus Jakarta Sans, radius scale, tabular numerals)
- `src/main.tsx`, `src/App.tsx` — router (21 route + guard auth)
- `src/lib/` — `types.ts` (kontrak), `format.ts` (IDR + terbilang), `dates.ts`, `derive.ts` (saldo/status derived/agregasi/runway)
- `src/data/` — `seed.ts` (Keluarga Dinar, tanggal anchor bulan kalender), `store.tsx` (context + aksi + localStorage v3)
- `src/components/` — `ui.tsx` (primitives: Button, Input, AmountInput IDR+terbilang, Sheet, ConfirmDialog, Toast, dll), `layout.tsx` (sidebar PC, bottom nav mobile, top bar, selector group/profile, bell, FilterPanel, FilterProvider)
- `src/features/` — auth (login/register mock), dashboard, transactions (list + detail popup + add form + form tagihan dinamis + merchant memory), scan (mock OCR review), bills (hub + detail + bayar + statement CC), wallets, budget, approvals (inbox), notifications, profile/group/members/invite, settings (6 sub-halaman)
- `BUILD_PLAN.md` (rencana), `BUILD_LOG.md` (ini)

## Fitur diimplementasikan (per PRD Phase 1)
- Frame: sidebar kiri (PC ≥1024) + bottom nav (mobile) + top bar (group/profile selector, tombol Filter, lonceng notifikasi).
- Dashboard: greeting, hero saldo **flat navy** dengan hairline ledger (spend/income bulan ini, angka rata kanan) — hasil audit ulang dengan taste-skill (receipt-edge sawtooth dihapus), income/expense/net, spending utama, upcoming bills, AI insight + rekomendasi (runway heuristic), budget status, recent transactions, banner pending approvals — semua card clickable.
- Transaksi: **date-grouped transaction feed** (komponen `TransactionList` baru, referensi `SS/Menu Transaksi.jpeg`): satu container putih rounded-3xl per tanggal, header tanggal kiri + daily net kanan (hijau jika positif), row = ikon arah (abu ↘ expense / hijau ↗ income) + merchant + metadata `Kategori · Wallet` + nominal + tanggal + chevron, divider tipis antar row, spasi grup 24px; search + filter tersembunyi, nominal clickable → popup detail → edit/delete. Sistem warna diselaraskan ke referensi (page #F7F8FA, line #E9ECF1, good #159B67, muted #7B8494, primary #2563EB).
- Tambah transaksi: form manual + "Kaitkan tagihan?" (tidak/biasa/berulang/cicilan) → form tagihan dinamis; upload struk → preview menggantikan placeholder + [Ganti]/[Hapus]; saran merchant→kategori dari riwayat.
- Scan Struk: upload → processing → review (PC split / mobile stack) dengan field ragu ditandai; Review & Approve → transaksi.
- Tagihan: hub 4 tab + summary (belum dibayar/jatuh tempo/overdue/lunas), detail bill, bayar cicilan per periode/lunas, statement kartu kredit + transaksi penyusun + bayar (settlement tidak double count).
- Wallet (list + detail + tambah personal/shared), Budget (threshold 80/90/100 + tambah), Reports (ringkasan, kategori, wallet, merchant, budget, tagihan, insight; export placeholder), Approval Inbox (approve/edit/reject), Notification Center, Profile/Group/Members/Invite, Settings (kategori, wallet, API/Hermes, Telegram, WhatsApp, AI/OCR), login/register mock.
- IDR otomatis + terbilang di semua input nominal; UI Bahasa Indonesia; dark mode toggle.

## Tests / build dijalankan
- `npx tsc --noEmit` — lulus (0 error)
- `npm run build` — lulus (produksi, ~495 kB JS / 136 kB gzip)
- QA preview (mobile 494px): dashboard, list transaksi, filter, popup detail, tambah transaksi + pembuatan tagihan berulang, approvals (setujui draft), bayar cicilan (progress 7→8/24 + transaksi expense), scan struk, reports.
- Konsol: tidak ada error runtime setelah perbaikan hook call pada alur bayar.

## Batasan / asumsi (Phase 1)
- Semua data mock (localStorage `catatin:phase1:v3`); tidak ada backend/DB/OCR/AI/bot asli (sesuai scope).
- Export PDF/Excel, undangan, API key, koneksi Telegram/WhatsApp adalah placeholder dengan toast.
- Filter state dibagi antar screen (dashboard/transaksi/laporan) — penyederhanaan dari "setiap screen punya state sendiri".
- Scanner OCR memakai nilai ekstraksi contoh yang bisa diedit; belum terhubung model.
- QA desktop mengandalkan breakpoint Tailwind standar `lg:` (sidebar/top bar) — belum diverifikasi visual pada viewport ≥1024 karena keterbatasan preview.
- Tipe settlement kartu kredit tampil di riwayat wallet sebagai transaksi `credit_card_settlement`, tidak dihitung expense.

## Status acceptance (ringkas)
- Semua screen utama accessible; navigasi PC/mobile berfungsi. ✅
- Nominal clickable → detail popup; filter hidden default; 4 preset periode; chip ringkas. ✅
- Upload struk → preview; form tagihan kontekstual. ✅
- IDR + terbilang; tanpa overflow horizontal (mobile); build produksi sukses. ✅
- Proofread Bahasa Indonesia: istilah konsisten (Pemasukan/Pengeluaran, Tagihan, Wallet).

## Next recommended phase
**Phase 2** — backend & database (schema cermin `types.ts`), auth Argon2id, group/profile scoping, unified Tagihan + settlement, draft/approval API, OCR/AI adapter, integrasi Telegram/WhatsApp/Hermes, notification in-app, OpenAPI spec dari kontrak yang sama.
