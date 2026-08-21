# Catatin — BUILD_PLAN Phase 1 (Frontend Product Experience)

**Basis:** Catatin_Master_PRD_v3.md (v3.2) · Catatin_Detail_Flowcharts_PC_Mobile.md (v3.2)
**Branch:** `phase-1-frontend` · **Skill:** executing-plans · Dashboard: frontend-design + design-taste-frontend

## Prinsip
- Contract-first: tipe TS tunggal di `src/lib/types.ts` sebagai kontrak; mock store meniru API backend.
- Dashboard dikerjakan terakhir dan memakai pendekatan frontend-design (token, tipografi, signature).
- Setiap slice: tulis → build/typecheck → laporan singkat di akhir.

## Urutan eksekusi

1. **Foundation** — scaffold Vite + React + TS + Tailwind v4, routing, design tokens (CSS vars, light+dark), font Plus Jakarta Sans (self-host @fontsource), layout frame: sidebar kiri (PC) + bottom nav (mobile) + top bar (group/profile selector, Filter, lonceng Notifikasi).
2. **Lib & data** — `types.ts` (kontrak), `format.ts` (IDR + terbilang), `dates.ts`, `seed.ts` (Keluarga Dinar: member, wallet, kategori, transaksi lintas bulan, tagihan, cicilan, hutang, kartu kredit + statement, budget, draft, notifikasi), `store.tsx` (context + aksi + persistensi localStorage).
3. **UI primitives** — Button, Input, Select, AmountInput (IDR + terbilang), Modal/BottomSheet responsif, FilterPanel (tersembunyi default), ConfirmDialog, Card, Badge, Skeleton, EmptyState, Toast, Tabs, ProgressBar.
4. **Auth** — login/register mock + guard route.
5. **Core loop transaksi** — daftar transaksi (search + filter), nominal clickable → detail modal/bottom-sheet, edit, delete (confirm), form tambah manual + form tagihan dinamis ("Kaitkan tagihan?": biasa/berulang/cicilan) + upload struk dengan preview menggantikan placeholder.
6. **Scan Struk** — mock OCR review: PC split (foto kiri, hasil kanan), mobile stack; field ragu diberi indikator; Review & Approve → transaksi.
7. **Unified Tagihan** — tab Semua/Biasa/Bulanan/Hutang-Cicilan/Kartu Kredit, summary counts, detail bill, bayar cicilan per periode/lunas, statement kartu kredit + bayar (settlement).
8. **Wallet & Budget** — daftar wallet + detail (transaksi wallet), tambah wallet (personal/shared), budget per kategori dengan threshold 80/90/100.
9. **Approval Inbox & Notification Center** — draft OCR/bot/Hermes: approve/reject/edit; notifikasi (tagihan due, draft menunggu).
10. **Reports** — filter periode/profile, ringkasan income/expense/net, kategori, wallet, merchant, budget comparison, tombol export PDF/Excel (placeholder).
11. **Profile/Group/Settings** — profile, keluarga/group, member, invite, settings (kategori, wallet, API/Hermes, Telegram, WhatsApp, AI/OCR).
12. **Dashboard (frontend-design)** — greeting, hero saldo (signature: receipt-edge), income/expense/net cashflow, spending utama (bar proporsional), upcoming bills, AI insight + rekomendasi (runway heuristic), budget status, recent transactions, pending approvals.
13. **Verifikasi final** — `npm run build`, cek mobile/desktop, proofread Bahasa Indonesia, laporan rule 25.

## Acceptance (ringkas)
- Semua screen utama accessible, navigasi PC (sidebar) & mobile (bottom nav) berfungsi.
- Nominal clickable → popup detail; filter tersembunyi sampai tombol Filter diklik; 4 preset periode berfungsi.
- Upload struk → preview menggantikan placeholder; field tagihan muncul kontekstual.
- IDR + terbilang otomatis; tanpa typo; tanpa overflow horizontal; production build sukses.
