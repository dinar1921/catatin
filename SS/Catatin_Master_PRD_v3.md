# CATATIN — Master Product Requirements Document v3.2
*Master PRD + 3-Phase Build Roadmap + Unified Billing + Credit Card Liability + Multi-Profile Family Support + AI/OCR Architecture + Testing Strategy*

**Changelog v3.2:**
- Menambahkan entitas **TransactionDraft** (pending transaction) dan **Approval Inbox (Persetujuan)** sebagai satu-satunya jalur persetujuan draft AI/bot/Hermes.
- Menambahkan **Notification Center MVP** (in-app) untuk reminder dan draft menunggu persetujuan.
- Menetapkan **aturan cutoff periode statement kartu kredit** dan **settlement sebagai tipe transaksi eksplisit** (`credit_card_settlement`) yang tidak masuk agregasi expense.
- Menambahkan **tracking periode pembayaran tagihan bulanan** (`last_paid_period`) dan **status jatuh tempo sebagai derived value**.
- Menetapkan pola **opening balance** (transaksi `source: opening_balance`) dan **trigger deterministik** form tagihan dinamis.
- Menambahkan **Net Cashflow** dan **Pending Approvals** pada konten dashboard.
- Menambahkan **default heuristic insight (cashflow runway)** dan **merchant → kategori memory**.
- Menambahkan **contract-first OpenAPI**, **cursor pagination** Hermes, dan **verifikasi webhook signature**.
- Normalisasi **enum status** (machine value snake_case + label UI Bahasa Indonesia) dan perbaikan penomoran section.

## 1. Product Vision

Catatin adalah aplikasi web-based untuk pencatatan dan pengelolaan cashflow yang sederhana, cepat, modern, dan nyaman digunakan pada mobile maupun desktop.

Target utama:
- Individu untuk keuangan pribadi.
- Pasangan/suami-istri.
- Keluarga/kelompok kecil yang menggunakan satu dashboard dan data bersama.
- UMKM kecil dengan kebutuhan cashflow sederhana.

Core promise:
> “Wah, ternyata Catatin bisa jelasin pengeluaran ke mana saja dan bantu manage uang jadi lebih simple.”

Catatin bukan accounting system penuh. Fokusnya adalah:
1. Mencatat pemasukan dan pengeluaran.
2. Menunjukkan saldo melalui wallet.
3. Membantu memahami ke mana uang pergi.
4. Mengingatkan tagihan dan cicilan.
5. Membantu membaca struk dengan OCR + AI.
6. Memberikan satu insight dan satu rekomendasi yang relevan.
7. Mendukung beberapa profile dalam satu group/family dengan data bersama.
8. Menyediakan API terbatas agar external AI agent seperti Hermes dapat membaca data dan melakukan aksi sederhana dengan approval untuk mutasi finansial.

---

## 2. Product Principles

1. **Simple first** — jangan menambah kompleksitas jika tidak memberi nilai jelas.
2. **Responsive, mobile-first** — mobile menjadi prioritas utama, tetapi desktop harus fully usable.
3. **Modern fintech** — visual clean, secure, professional, biru sebagai warna utama.
4. **Shared data without unnecessary complexity** — satu group dapat memiliki beberapa profile yang memakai data bersama.
5. **Personal ownership inside shared group** — setiap data penting dapat diketahui siapa pembuatnya dan profile siapa yang menjadi owner.
6. **Approval before financial mutation** — AI/bot/Hermes tidak boleh langsung membuat mutasi finansial tanpa approval.
7. **One source of truth** — transaksi menjadi sumber utama perubahan cashflow dan saldo.
8. **AI as assistant, not the product** — AI internal digunakan untuk OCR, extraction, membaca data, insight, rekomendasi, dan simulasi sederhana.
9. **Universal dashboard** — dashboard menampilkan informasi penting dan dapat berpindah antara semua anggota atau profile tertentu.
10. **Online-first** — tidak perlu offline transaction queue/PWA offline sync.
11. **Stable contracts** — frontend dan backend menggunakan API contract yang jelas dan terkontrol.
12. **Approved UI is frozen** — setelah UI disetujui, perubahan backend tidak boleh mendesain ulang UI tanpa instruksi eksplisit.
13. **Accuracy before automation** — OCR/AI harus melalui validation dan review sebelum transaksi finansial dibuat.
14. **Indonesian-first UX** — UI menggunakan Bahasa Indonesia dan format angka/nominal Indonesia secara konsisten.

---

## 3. Scope Baseline and Overrides

Baseline dari PRD v2 dipertahankan kecuali override berikut:

- Konsep workspace diganti menjadi **Group/Family Account** yang ringan.
- Satu group dapat memiliki beberapa profile/member.
- Data group tersimpan pada shared scope yang sama dan dapat dilihat sebagai gabungan atau difilter berdasarkan profile.
- Tidak ada konsep organisasi/permission matrix kompleks pada MVP.
- Role group hanya **Admin** dan **Member**.
- Setiap transaksi memiliki group, creator, dan owner profile.
- Wallet dapat bersifat personal atau shared.
- Tidak ada transfer antar-wallet pada MVP.
- Wallet sederhana: saldo dan daftar transaksi.
- Tidak ada subkategori.
- Income dicatat manual; tidak perlu recurring income.
- Recurring expense menggunakan bill/reminder yang dapat on/off.
- **Penambahan tagihan dilakukan melalui form transaksi**. Saat kategori atau opsi tagihan dipilih, form tambahan tagihan muncul secara kontekstual.
- Cicilan memakai satu schedule/reminder dengan progress pembayaran; tidak membuat reminder baru tiap periode.
- Pembayaran cicilan dapat dilakukan per periode atau bayar penuh.
- Hutang/piutang non-cicilan didukung dan dikelola di dalam menu **Tagihan**. Tidak ada menu Hutang terpisah.
- Dashboard universal, period-driven, dan fokus.
- Filter dashboard tersembunyi secara default dan dibuka melalui tombol Filter.
- Preset periode dashboard: hari ini, 7 hari terakhir, bulan ini, tanggal spesifik.
- Setiap summary/card dashboard yang memiliki detail/tujuan navigasi harus clickable.
- Nominal transaksi pada daftar transaksi clickable dan membuka popup/bottom-sheet detail.
- Desktop memakai sidebar kiri; mobile memakai bottom navigation.
- Receipt upload setelah gambar dipilih harus berubah menjadi preview gambar, bukan tetap menampilkan placeholder upload.
- Semua input nominal menggunakan format IDR otomatis dan menampilkan penulisan nominal/terbilang.
- AI internal bukan chatbot utama di web.
- Natural-language input di web tidak digunakan; AI natural-language digunakan melalui Telegram/WhatsApp.
- Voice input tidak digunakan.
- Offline/PWA offline sync tidak digunakan.
- Telegram dan WhatsApp wajib tersedia pada scope produk akhir.
- Hermes adalah external agent melalui API.
- Delete memakai confirmation sederhana.
- Receipt attachment dapat dihapus terpisah dari transaksi; gambar dikompres sebelum disimpan.
- 1 receipt = 1 transaksi.

---

## 4. Users, Profiles, Roles, and Groups

### 4.1 Group / Family Account

Group adalah wadah data bersama untuk satu keluarga, pasangan, atau kelompok kecil.

Contoh:
- Keluarga Dinar
- Rumah Tangga Dinar
- Tim Toko ABC

Semua anggota group membaca dan menulis data pada shared group scope sesuai permission.

Tidak menggunakan konsep workspace enterprise pada MVP.

### 4.2 Profile

Setiap orang di dalam group memiliki profile sendiri.

Profile minimum:
- id
- group_id
- name
- email/username
- avatar (optional)
- role: admin | member
- is_active
- created_at
- updated_at

### 4.3 Creator vs Owner

Untuk data finansial penting, sistem membedakan:
- **created_by** — siapa yang membuat/mencatat data.
- **owner_profile_id** — data tersebut atas nama profile siapa.
- **group_id** — group tempat data berada.

Contoh:
> Dinar mencatat transaksi Rp750.000 untuk belanja rumah.
>
> created_by = Dinar
> owner_profile_id = Dinar
> group_id = Keluarga Dinar

### 4.4 Role

**Admin**:
- melihat semua data group.
- mengelola anggota.
- mengundang member.
- mengelola kategori, wallet, budget, bill, installment, debt/receivable, dan pengaturan group.
- mengelola integrasi bot/API.

**Member**:
- input transaksi.
- melihat data yang tersedia di group.
- melihat dashboard group.
- mengelola data yang diizinkan untuknya.
- menggunakan OCR.
- membuat dan membayar transaksi terkait tagihan/cicilan sesuai akses.
- tidak dapat mengubah pengaturan group yang bersifat administratif.

Tidak ada permission matrix yang lebih kompleks pada MVP.

### 4.5 Member Management

Menu Profile/Group menyediakan:
- My Profile
- Family/Group
- Members
- Invite Member

Invitation minimal mendukung salah satu mekanisme yang stabil pada implementasi MVP:
- email invitation, atau
- invitation link, atau
- invitation code.

Tidak perlu membangun sistem organisasi kompleks.

---

## 5. Authentication

MVP:
- Login menggunakan username/email + password.
- Registration sederhana.
- Forgot/reset password dapat dipertahankan dari baseline.
- Password wajib di-hash dengan Argon2id.
- Session/token implementation harus aman dan tidak mengekspos credential.
- Access token/session harus terikat pada user dan group scope yang relevan.

---

## 6. Core Data Concepts

### 6.1 User / Profile

- id
- group_id
- username/email
- full_name
- avatar (optional)
- password_hash
- role
- is_active
- created_at
- updated_at

### 6.2 Group

- id
- name
- owner_profile_id
- is_active
- created_at
- updated_at

### 6.3 Wallet

- id
- group_id
- owner_profile_id (nullable untuk shared wallet)
- name
- balance
- scope: personal | shared
- type/metadata bila diperlukan
- created_at
- updated_at

### 6.4 Category

- id
- group_id (nullable jika default global)
- name
- direction: income | expense | both bila diperlukan
- is_default
- created_at
- updated_at

Tidak ada subkategori pada MVP.

### 6.5 Transaction

- id
- group_id
- created_by
- owner_profile_id
- type: income | expense | credit_card_settlement
- amount
- category_id
- wallet_id
- payment_method (optional metadata, contoh: Debit Card | Cash | Credit Card)
- credit_card_id (nullable; wajib diisi bila payment_method = Credit Card)
- occurred_at
- merchant
- description
- source: manual | receipt_ocr | telegram | whatsapp | hermes | opening_balance
- status
- attachment_id (optional)
- bill_id (nullable)
- installment_id (nullable)
- created_at
- updated_at

Transaction tetap menjadi source of truth untuk cashflow.

### 6.6 Receipt Attachment

- id
- transaction_id
- group_id
- compressed_file_path
- mime_type
- ocr_status
- created_at

### 6.7 Receipt Item

- id
- transaction_id
- item_name
- quantity
- unit_price
- total_price

### 6.8 Budget

- id
- group_id
- owner_profile_id (nullable bila group budget)
- category_id
- wallet_id (optional)
- period
- amount
- created_by
- created_at
- updated_at

### 6.9 Billing / Tagihan

Tagihan adalah satu modul utama yang menggabungkan tagihan biasa, tagihan bulanan, hutang, cicilan, dan kewajiban kartu kredit. Tidak ada menu Hutang terpisah di navigasi utama.

- id
- group_id
- owner_profile_id
- title
- type: bill | recurring_bill | debt | receivable | installment | credit_card_statement
- amount
- paid_amount
- remaining_amount
- category_id (optional)
- wallet_id (optional)
- credit_card_id (nullable)
- counterparty (nullable)
- frequency (nullable)
- due_day (nullable)
- due_date (nullable)
- status: derived — upcoming | due_today | unpaid | paid | overdue | paid_off
- last_paid_period (nullable; YYYY-MM — periode terakhir yang sudah dibayar, khusus tagihan bulanan)
- is_active
- created_by
- created_at
- updated_at

Menu Tagihan menggunakan pengelompokan UI berdasarkan jenis, bukan membuat menu terpisah:
- Tagihan Biasa
- Tagihan Bulanan
- Hutang / Cicilan
- Tagihan Kartu Kredit

### 6.10 Installment

- id
- bill_id
- group_id
- owner_profile_id
- title
- total_amount
- installment_amount
- tenor
- paid_count
- start_date
- due_day
- status: derived — unpaid | paid | overdue | paid_off
- credit_card_id (nullable)
- created_by
- created_at
- updated_at

Jika cicilan dibayar menggunakan kartu kredit, setiap transaksi cicilan tetap dibuat sebagai transaksi terpisah, tetapi kewajibannya juga diakumulasi pada statement/tagihan kartu kredit terkait.

### 6.11 DebtReceivable

- id
- bill_id
- group_id
- owner_profile_id
- type: debt | receivable
- counterparty
- total_amount
- paid_amount
- remaining_amount
- due_date (optional)
- status: derived — unpaid | paid | overdue | paid_off
- wallet_id (for settlement)
- credit_card_id (nullable)
- notes
- created_by
- created_at
- updated_at

Debt/receivable selalu ditampilkan melalui menu Tagihan.

### 6.12 CreditCard

CreditCard adalah akun kewajiban pembayaran yang mengakumulasi transaksi yang dibayar menggunakan kartu kredit. Kartu kredit tidak diperlakukan sebagai wallet kas.

- id
- group_id
- owner_profile_id
- name
- issuer
- last_four (optional)
- statement_day
- due_day
- credit_limit (optional)
- current_outstanding
- status: active | inactive
- created_at
- updated_at

### 6.13 CreditCardStatement

Statement kartu kredit mengakumulasi transaksi pembelian/hutang/cicilan yang menggunakan kartu tersebut pada periode tagihan tertentu.

- id
- credit_card_id
- group_id
- period_start
- period_end
- statement_amount
- paid_amount
- remaining_amount
- due_date
- status: open | issued | overdue | paid
- created_at
- updated_at

Statement memiliki relasi ke transaksi penyusunnya. Detail statement harus dapat menampilkan daftar transaksi, hutang, dan cicilan yang membentuk nominal akumulasi.

### 6.14 CreditCardStatementItem

- id
- statement_id
- transaction_id
- bill_id (nullable)
- installment_id (nullable)
- debt_receivable_id (nullable)
- amount
- item_type: purchase | debt | installment | adjustment
- created_at

Satu transaksi hanya boleh masuk ke statement kartu kredit yang relevan. Tidak membuat duplikasi transaksi expense.

### 6.15 ActivityLog

- group_id
- actor_id
- action
- object_type
- object_id
- before_data
- after_data
- timestamp

### 6.16 TransactionDraft (Pending Transaction)

Draft adalah entitas transaksi yang belum disetujui, dibuat oleh alur OCR, Telegram/WhatsApp, atau Hermes. Draft tidak pernah mengubah saldo/wallet/dashboard sampai di-approve.

- id
- group_id
- created_by
- owner_profile_id (nullable — dapat diisi saat review)
- source: receipt_ocr | telegram | whatsapp | hermes
- transaction_type: income | expense (default expense)
- amount
- category_id (nullable)
- wallet_id (nullable)
- payment_method (nullable)
- credit_card_id (nullable)
- occurred_at (nullable)
- merchant
- description
- items (JSON — hasil extraction item receipt)
- receipt_attachment_id (nullable)
- uncertain_fields: [] (daftar field yang diragukan AI/OCR)
- validation_messages: [] (hasil schema/business validation)
- status: draft | in_review | approved | rejected | expired
- reviewed_by (nullable)
- reviewed_at (nullable)
- approved_by (nullable)
- approved_at (nullable)
- rejected_reason (nullable)
- transaction_id (nullable — terisi saat approve)
- created_at
- updated_at

Aturan:
- Tidak ada jalur dari draft ke transaksi tanpa aksi user (approve).
- Approve menyalin data draft menjadi Transaction (source of truth) dan menghubungkan transaction_id.
- Reject/expired menghapus draft; attachment terkait ikut dihapus bila tidak dipakai transaksi lain.

### 6.17 Enum dan Status Convention

- Semua enum machine value disimpan dalam snake_case bahasa Inggris (contoh: unpaid, paid, overdue, paid_off, due_today).
- Label UI selalu Bahasa Indonesia (contoh: belum dibayar, sudah dibayar, overdue, lunas); konversi dilakukan di presentation layer.
- Status jatuh tempo (upcoming | due_today | overdue) bersifat **derived**: dihitung saat query dari due date/schedule, paid_amount, dan schedule; tidak disimpan sebagai kolom yang mudah basi.

---

## 7. Wallet Rules

Wallet bukan accounting ledger yang kompleks.

Contoh personal:
- BCA Dinar
- Mandiri Dinar
- Cash Dinar
- BCA Istri
- Cash Istri

Contoh shared:
- Rekening Keluarga
- Cash Rumah

Saldo wallet berubah berdasarkan transaksi yang terkait.

**Opening balance (keputusan implementasi):** dicatat sebagai transaksi `type: income`, `source: opening_balance`, pada wallet terkait, dengan label UI "Saldo Awal".

Aturan:
- Muncul di riwayat wallet sebagai entry "Saldo Awal".
- Tidak dihitung dalam agregasi income periode pada dashboard/laporan.
- Hanya satu opening balance per wallet pada MVP; perubahan dilakukan dengan mengedit transaksi tersebut.
- Tidak ada mekanisme "add balance" terpisah dan tidak ada transfer antar-wallet.

Payment method adalah metadata terpisah:
- Wallet: BCA Dinar
- Payment method: Debit Card

---

## 8. Transaction Input

Primary transaction entry:
A. Scan Struk
B. Input Manual

### 8.1 Manual Form

Field dasar:
- Tipe: pemasukan | pengeluaran
- Nominal
- Kategori
- Wallet
- Profile/owner
- Tanggal
- Merchant
- Deskripsi
- Payment method (opsional)
- Tambah Foto Struk
- Opsi tagihan/cicilan bila relevan
- Simpan Transaksi

### 8.2 Dynamic Bill Form

Penambahan tagihan tidak menggunakan menu input terpisah.

Flow:
1. User membuka Tambah Transaksi.
2. User memilih tipe dan kategori.
3. Setelah kategori dipilih, form menampilkan pilihan deterministik **"Kaitkan tagihan?"** dengan opsi:
   - Tidak (transaksi biasa)
   - Tagihan biasa (satu kali)
   - Tagihan berulang (recurring bill)
   - Cicilan (installment)
4. Pilihan inilah satu-satunya trigger form dinamis; kategori tidak memerlukan flag khusus.
5. Field tagihan muncul secara kontekstual sesuai pilihan.

Contoh field installment:
- total tagihan
- nominal cicilan
- tenor
- tanggal mulai
- hari jatuh tempo
- wallet
- owner profile

### 8.3 Transaction Edit/Delete

Transactions can be edited after saving.

Delete:
- confirmation modal sederhana.
- [Batal] [Hapus]
- tidak perlu ketik HAPUS/PIN/password untuk transaksi biasa.

### 8.4 Transaction Detail

Detail transaction ditampilkan melalui modal/bottom-sheet, bukan wajib berpindah halaman.

Field:
- Type
- Amount
- Owner profile
- Created by
- Merchant
- Category
- Wallet
- Payment method
- Date
- Description
- Item list bila tersedia
- Receipt image bila tersedia
- Bill/installment summary bila terkait
- Edit
- Delete

Interaction:
- nominal transaksi pada daftar dapat diklik.
- klik membuka detail popup.
- desktop menggunakan centered modal.
- mobile menggunakan bottom sheet atau full-height modal yang nyaman untuk touch.

### 8.5 Merchant → Kategori Memory

Sistem mempelajari pemetaan merchant → kategori dari riwayat transaksi group (transaksi tersimpan dengan merchant non-kosong).

Behavior:
- Saat user memilih/mengetik merchant yang pernah dipakai, form menyarankan kategori terakhir yang paling sering dipakai untuk merchant tersebut.
- Saran bersifat non-blocking; user tetap bebas mengganti kategori.
- Data bersumber dari riwayat transaksi (query kategori terbanyak per merchant); tidak ada tabel pemetaan terpisah pada MVP.
- Mapping yang sama dapat digunakan sebagai hint routing kategori saat hasil OCR tidak yakin.

---

## 9. Receipt OCR

Flow:

Upload/photo → image validation → preprocessing/compression → OCR/Vision → AI extraction → schema validation → business validation → draft → review → approval → save.

1 receipt = 1 transaction.

### 9.1 Receipt Upload UX

Sebelum upload:
- tampilkan upload placeholder.

Setelah user memilih foto/gambar:
- placeholder upload diganti dengan preview gambar.
- tampilkan nama file bila relevan.
- tersedia aksi [Ganti] dan [Hapus].
- aspect ratio gambar dipertahankan.
- gambar dikompres sebelum disimpan.

### 9.2 Extract

- merchant
- date
- total
- description/item details
- quantity
- unit/item price
- category
- wallet/payment method bila dapat dikenali

### 9.3 Review

Desktop:
- foto struk di kiri.
- hasil ekstraksi editable di kanan.

Mobile:
- foto di atas.
- hasil ekstraksi di bawah.

Jika AI/OCR tidak yakin:
- tetap buat draft.
- field yang meragukan diberi indikator/highlight sederhana.
- jangan menampilkan angka confidence ke user.

Confidence/quality score boleh digunakan secara internal untuk routing validation dan fallback.

Receipt dapat dihapus terpisah dari transaksi.

---

## 10. AI Model Configuration

AI tidak boleh di-hardcode langsung ke business logic. Sistem menggunakan provider/model abstraction agar model dapat diganti tanpa menulis ulang transaction logic.

### 10.1 AI Provider Roles

Minimal mendukung konfigurasi terpisah untuk:
- OCR/Vision Model
- Receipt Extraction Model
- Insight/Recommendation Model
- Agent Model

### 10.2 Model Configuration

Konfigurasi minimal:
- provider
- model name
- API credential melalui environment/secret manager
- temperature bila relevan
- max tokens/output limit bila relevan
- timeout
- retry count
- fallback model/provider
- system prompt/version
- structured output schema
- model version/metadata

### 10.3 Provider Abstraction

Gunakan interface/adapter seperti:
- OCR provider adapter
- Vision provider adapter
- Structured extraction adapter
- Insight model adapter
- Agent model adapter

Implementasi awal boleh mengaktifkan satu provider utama, tetapi architecture harus memungkinkan provider/model diganti.

### 10.4 Accuracy Pipeline

Receipt:

Image
→ preprocessing
→ OCR/Vision
→ raw extraction
→ structured AI extraction
→ schema validation
→ business validation
→ uncertainty detection
→ draft
→ user review
→ approval
→ transaction

Business validation minimum:
- amount harus numeric dan > 0 untuk transaction biasa.
- total harus konsisten dengan item bila item tersedia dan dapat divalidasi.
- date harus valid.
- category harus berasal dari available category.
- wallet harus berasal dari group.
- owner profile harus berasal dari group.

### 10.5 AI Fallback

Jika model utama gagal/time-out/hasil tidak memenuhi schema:
- retry sesuai policy.
- gunakan fallback model/provider bila dikonfigurasi.
- jika tetap gagal, buat draft parsial dan minta review manual.

AI tidak boleh langsung menyimpan transaksi finansial tanpa approval.

---

## 11. AI Internal

AI internal bersifat sederhana dan terkontrol.

Digunakan untuk:
1. Membantu OCR/extraction.
2. Membaca data transaksi/laporan.
3. Menghasilkan 1 AI Insight.
4. Menghasilkan 1 rekomendasi.
5. Menjelaskan insight secara sederhana.
6. Melakukan simulasi numerik sederhana bila relevan.

AI internal bukan:
- chatbot utama di web.
- autonomous financial agent.
- executor bebas terhadap database.

AI tidak boleh melakukan mutasi finansial tanpa approval.

---

## 12. AI Insight

Dashboard menampilkan tepat:
- 1 insight.
- 1 recommendation.

Insight harus mengikuti periode filter dashboard.

Contoh:
> “Pengeluaran makananmu minggu ini Rp850.000, naik 27% dibanding rata-rata 4 minggu terakhir.”

Klik insight membuka detail sederhana:
- angka saat ini
- pembanding
- kategori/penyebab utama
- perhitungan singkat

Jangan menghasilkan insight yang terlalu banyak atau noise.

### 12.1 Default Heuristic Insight (Cashflow Runway)

Insight harus selalu bernilai bahkan tanpa LLM. Default engine menggunakan heuristik deterministik:

- **Runway**: saldo / rata-rata pengeluaran harian (30 hari terakhir) → estimasi "uang cukup sampai kapan".
- **Perbandingan**: total pengeluaran periode berjalan vs rata-rata N periode sebelumnya.
- **Top penyebab**: kategori dengan kenaikan/nilai terbesar pada periode berjalan.

LLM hanya digunakan untuk menyusun kalimat insight/rekomendasi yang natural dari hasil heuristik. Jika LLM gagal/timeout, heuristik tetap menampilkan insight angka tanpa kalimat AI.

---

## 13. Hermes External Agent API

Hermes berada di luar Catatin.

READ:
- saldo
- transaksi
- kategori
- budget
- bill/reminder
- cicilan
- hutang/piutang
- laporan
- profile/group-scoped data sesuai permission

WRITE:
- create transaction
- update transaction
- create bill/reminder
- update budget
- create/update debt or receivable

Financial mutations require approval.

API key:
- scoped ke satu group/data scope.
- disimpan hashed/encrypted sesuai kebutuhan.
- hanya ditampilkan penuh sekali saat dibuat.
- dapat revoke/rotate.
- memiliki rate limit.
- memiliki audit log.
- READ endpoints mendukung cursor pagination agar data dapat diambil bertahap.
- WRITE mutations menghasilkan draft approval (TransactionDraft §6.16); tidak ada mutation langsung tanpa approval.

Hermes tidak boleh mengakses database secara langsung.

---

## 14. Telegram and WhatsApp

Keduanya wajib pada scope produk akhir.

Natural-language input hanya melalui bot.

Example:
User: “beli makan 50rb”

Bot:
- parse
- create draft
- show summary
- provide approval interaction bila platform mendukung button
- user approves
- transaction saved

Receipt via bot:
- user sends receipt photo.
- bot processes OCR.
- bot returns draft transaction.
- user approves/edits/cancels.
- approved transaction is saved.

Button interaction preferred bila platform capability mendukung.

Bot financial mutation must never bypass approval.

---

## 15. Unified Bills / Tagihan

### 15.1 Main Tagihan Menu

Semua kewajiban pembayaran dikelola dari satu menu **Tagihan**. Tidak ada menu Hutang terpisah.

Main views:
- Tagihan Biasa
- Tagihan Bulanan
- Hutang / Cicilan
- Tagihan Kartu Kredit

UI dapat menggunakan tabs, segmented control, atau filter type. User tidak perlu berpindah ke menu lain untuk melihat jenis kewajiban yang berbeda.

### 15.2 Tagihan Biasa

Tagihan satu kali, misalnya invoice atau pembayaran yang tidak berulang.

Status UI:
- belum dibayar
- jatuh tempo hari ini
- overdue
- sudah dibayar

Saat dibayar, sistem membuat/menandai settlement sesuai tipe tagihan dan memperbarui dashboard.

### 15.3 Tagihan Bulanan / Recurring Bill

Contoh:
> Netflix Rp186.000 setiap tanggal 15.

Properties:
- amount
- category
- wallet
- owner profile
- frequency
- due day
- on/off

Satu recurring bill menggunakan satu schedule/reminder. Jangan membuat record reminder baru setiap periode. Reminder tidak membuat transaksi expense sebelum pembayaran benar-benar dilakukan.

Tracking periode (keputusan implementasi):
- Recurring bill menyimpan `last_paid_period` (YYYY-MM) untuk mencatat periode terakhir yang sudah dibayar.
- Aksi "Bayar bulan ini" membuat transaksi expense untuk periode tersebut dan memperbarui last_paid_period.
- Sistem mencegah pembayaran ganda untuk periode yang sama (double payment guard).
- Status jatuh tempo dihitung derived dari due_day + last_paid_period; tidak disimpan.

### 15.4 Hutang / Piutang / Cicilan

Hutang dan piutang ditampilkan sebagai bagian dari menu Tagihan. Cicilan adalah bentuk hutang dengan progress pembayaran.

Track:
- owner profile
- counterparty
- total
- paid
- remaining
- optional due date
- status
- payment method / wallet

Partial payment supported. Settlement:
- receivable payment -> income transaction.
- debt payment -> expense transaction.

Installment:
- initial paid_count = 0
- progress 0/24, 1/24, ..., 24/24
- mark period paid -> create expense transaction for installment amount
- pay full -> mark lunas and complete remaining schedule
- overdue -> status overdue

### 15.5 Kartu Kredit sebagai Akumulasi Tagihan

Kartu kredit diperlakukan sebagai akun kewajiban, bukan wallet kas. Setiap transaksi pembelian/hutang/cicilan yang dibayar menggunakan kartu kredit tetap dicatat sebagai transaksi terpisah agar histori pengeluaran tetap detail.

Contoh:
- Cicilan A Rp500.000 menggunakan Kartu Kredit BCA
- Hutang B Rp300.000 menggunakan Kartu Kredit BCA
- Belanja C Rp200.000 menggunakan Kartu Kredit BCA

Transaksi tersimpan terpisah:
- Rp500.000
- Rp300.000
- Rp200.000

Tetapi pada Tagihan Kartu Kredit BCA: total outstanding = Rp1.000.000.

Saat user membuka **Tagihan Kartu Kredit BCA**, UI harus menampilkan:
- total outstanding
- jumlah sudah dibayar
- sisa tagihan
- due date
- daftar transaksi penyusun
- daftar hutang/cicilan penyusun
- nominal tiap item
- link/open action ke detail transaksi terkait

Klik item pada statement membuka Transaction Detail atau Bill Detail terkait.

Aturan cutoff statement (keputusan implementasi):
- Transaksi masuk statement berdasarkan `occurred_at` (tanggal transaksi).
- Transaksi dengan occurred_at ≤ period_end statement yang sedang open (status open/issued) masuk statement tersebut.
- Transaksi setelah period_end otomatis masuk statement periode berikutnya (statement berikutnya dibuat on-demand saat diperlukan).
- Cicilan yang dibayar via kartu kredit mengikuti tanggal transaksi cicilan masing-masing.

### 15.6 Pembayaran Tagihan Kartu Kredit

Pembayaran statement kartu kredit menggunakan wallet kas (misalnya BCA/Mandiri) harus dicatat sebagai **credit card settlement**, bukan expense kedua.

Aturan:
1. Pembelian dengan kartu kredit membuat expense transaction dan menambah outstanding kartu.
2. Pembayaran statement kartu kredit mengurangi outstanding kartu dan saldo wallet kas.
3. Pembayaran statement tidak menambah total expense lagi agar tidak terjadi double counting.
4. Semua transaksi pembentuk statement tetap dapat dilihat satu per satu dari detail Tagihan Kartu Kredit.
5. Setiap pembayaran statement dicatat sebagai transaksi eksplisit `type: credit_card_settlement` pada wallet kas yang dipilih:
   - muncul di riwayat wallet (label UI: "Bayar Tagihan Kartu Kredit BCA") agar saldo selalu traceable;
   - tidak dihitung sebagai expense maupun income pada agregasi dashboard/laporan;
   - mendukung pembayaran parsial; sisa tagihan tetap tampil sampai lunas;
   - tercatat di ActivityLog seperti mutasi penting lain.

### 15.7 Reminder dan Notification Center

Reminder tersedia untuk tagihan biasa, tagihan bulanan, cicilan, dan statement kartu kredit berdasarkan due date/schedule. Tidak ada eskalasi reminder kompleks pada MVP.

Notification Center MVP (in-app, ikon lonceng di top area):
- Memberitahu: tagihan jatuh tempo hari ini, tagihan overdue, dan draft menunggu persetujuan.
- Klik notifikasi membuka halaman terkait (bill detail / approval inbox).
- Belum ada push/email pada MVP; notifikasi dihitung derived dari data saat dibuka (tanpa job background yang wajib).

## 16. Tagihan Lifecycle and Settlement

Semua jenis tagihan mengikuti lifecycle dasar:

```text
Created
  ↓
Upcoming / Open
  ↓
Due Today
  ↓
Overdue (jika belum dibayar)
  ↓
Payment / Settlement
  ↓
Paid / Lunas
```

Untuk cicilan, status keseluruhan mengikuti progress pembayaran.

Untuk kartu kredit:
- statement dapat open/issued/overdue/paid
- outstanding di level kartu = total statement terbuka yang belum lunas sesuai aturan billing period
- settlement statement mengurangi liability, bukan expense baru

No full accounting system is introduced.

## 17. Budget

Budget adalah supporting feature.

Simple monthly category budget:
> Food — Rp850.000 / Rp1.000.000 — 85%

Budget dapat bersifat:
- personal profile budget, atau
- shared group budget.

Alert thresholds dapat retain baseline 80/90/100 behavior.

No separate complicated budgeting workflow.

Budget terlihat di dashboard dan reports.

---

## 18. Dashboard

Dashboard bersifat universal, period-driven, dan memiliki default periode **bulan ini**.

### 18.1 Dashboard Content

Hanya tampilkan informasi utama:
1. Total saldo.
2. Income vs Expense periode berjalan.
3. Net cashflow (income − expense periode berjalan).
4. Spending utama.
5. Upcoming bills/cicilan.
6. AI Insight.
7. Recent transactions.
8. Budget status.
9. Pending approvals (badge/entry kecil bila ada draft menunggu persetujuan).

Dashboard dapat menampilkan data:
- Semua anggota/group.
- Profile tertentu.

### 18.2 Group/Profile Context

Default:
> Semua Anggota

User dapat mengganti context:
- Semua Anggota
- Profile Dinar
- Profile Istri
- Profile lain yang aktif

Context ini mempengaruhi agregasi dashboard, transaksi, budget, bill, installment, dan report sesuai hak akses.

### 18.3 Clickable Dashboard

Setiap summary/card yang memiliki data detail harus clickable.

Contoh:
- Total saldo → Wallet.
- Income → Transaction list filtered income.
- Expense → Transaction list filtered expense.
- Spending utama → category detail.
- Upcoming bills → bill list.
- Recent transaction → transaction detail popup.
- Budget status → budget detail.
- AI insight → insight detail.
- Net cashflow → transaksi periode berjalan.
- Pending approvals → approval inbox (lihat §6.16).

### 18.4 Dashboard Layout Desktop

Desktop >= 1024px:
- sidebar navigation di sebelah kiri.
- content dashboard di kanan.
- sidebar dapat fixed/sticky sesuai kebutuhan layout.

### 18.5 Dashboard Layout Mobile

Mobile <= 767px:
- navigation utama di bawah.
- minimum primary navigation:
  - Dashboard
  - Transaksi
  - Tambah
  - Tagihan
  - More/Profile

### 18.6 Greeting

Contoh:
> “Selamat sore, Dinar 👋\n> Total uangmu saat ini Rp8.450.000\n> Bulan ini kamu mengeluarkan Rp3.200.000.”

Greeting dapat menyesuaikan active profile.

---

## 19. Search and Filters

### 19.1 Hidden by Default

Filter tidak ditampilkan penuh di dashboard/list secara default.

UI hanya menampilkan tombol:
> Filter

Klik tombol membuka filter panel/drawer/modal.

Desktop boleh memakai popover/drawer.
Mobile menggunakan bottom sheet/full-height filter panel.

### 19.2 Date Presets

Minimal:
- Hari ini
- 7 hari terakhir
- Bulan ini
- Tanggal spesifik

Tanggal spesifik menampilkan:
- tanggal mulai
- tanggal akhir

### 19.3 Additional Filters

Di dalam filter:
- Anggota/Profile
- Income/Expense
- Category
- Wallet

Tidak menambah filter lanjutan yang tidak memberi nilai jelas pada MVP.

### 19.4 Transaction Search

Simple text search across:
- merchant
- description

Search dapat digunakan bersama filter.

### 19.5 Filter State

Filter yang sedang aktif harus terlihat secara ringkas setelah panel ditutup, misalnya:
> Bulan ini · Dinar · Expense

Tetapi detail filter tetap berada di panel.

---

## 20. Transaction List and Detail Interaction

Transaction list harus menampilkan data ringkas seperti:
- date
- merchant/description
- category
- owner profile
- amount
- type

**Nominal adalah clickable target utama untuk membuka detail.**

Desktop:
- modal centered.

Mobile:
- bottom sheet atau modal full-height.

Popup detail wajib mendukung:
- view
- edit
- delete
- receipt preview bila ada
- bill/installment summary bila ada

---

## 21. Reports

Reports lebih detail daripada dashboard.

Minimum:
- date range
- income/expense totals
- net cashflow
- filter profile/member
- spending by category
- spending by wallet
- merchant detail
- transaction detail
- budget comparison
- unified Tagihan overview (regular, recurring, debt/receivable, installment, credit card statements)
- credit card statement and liability overview
- AI insight + recommendation
- simple explanation of key changes
- export PDF
- export Excel
- locale ID formatting
- Asia/Jakarta timezone

Reports menggunakan shared group data dan dapat difilter per profile.

---

## 22. Number, Currency, and Nominal Spelling Rules

Semua input nominal menggunakan format IDR otomatis.

### 22.1 Display

Example:
- 1000 → Rp1.000
- 50000 → Rp50.000
- 1250000 → Rp1.250.000

### 22.2 Internal Storage

Database menyimpan numeric monetary value, bukan string berformat.

Contoh:
- UI: `Rp1.250.000`
- internal numeric value: `1250000`

Hindari floating point untuk operasi uang. Pilih representation numeric/integer yang konsisten pada backend/database.

### 22.3 Terbilang

Setiap input nominal menampilkan penulisan nominal secara otomatis di bawah field.

Contoh:
> Rp1.250.000
> Satu juta dua ratus lima puluh ribu rupiah

Terbilang berlaku minimal pada:
- transaction
- budget
- bill
- installment
- debt
- receivable
- opening balance

Terbilang adalah presentation layer dan tidak disimpan sebagai source value.

---

## 23. Indonesian UI Copy and Proofreading Rules

Semua UI copy menggunakan Bahasa Indonesia kecuali istilah teknis/brand yang memang harus dipertahankan.

Sebelum sebuah phase dianggap selesai, lakukan pemeriksaan:
- salah eja kata.
- typo.
- kapitalisasi.
- konsistensi istilah.
- konsistensi singular/plural.
- konsistensi istilah income/pemasukan dan expense/pengeluaran.
- konsistensi label tombol.
- konsistensi empty/loading/error/success messages.

Gunakan istilah yang sederhana dan natural untuk pengguna Indonesia.

Jangan mencampur Bahasa Indonesia dan Bahasa Inggris secara sembarangan.

---

## 24. Design System

Direction:
- Modern fintech.
- Primary color family: blue.
- Secure/professional feel.
- Clean whitespace.
- Strong typography.
- Modern cards.
- Accessible contrast.
- Mobile-first.
- 44px minimum touch target.

Navigation:
- Desktop: left sidebar.
- Mobile: bottom navigation.

Temporary wordmark/placeholder digunakan sampai branding final tersedia.

Reference skill:
> `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`

Gunakan skill sebagai design reference/constraint. Jangan copy blindly dan jangan membuat visual system yang tidak relevan.

---

## 25. Responsive UX

Breakpoints:
- Mobile <= 767px
- Tablet 768-1023px
- Desktop >= 1024px

Mobile adalah prioritas.
Desktop harus fully usable melalui URL.

### Add Transaction Mobile

Primary action:
> + Tambah Transaksi

Options:
- Scan Struk
- Input Manual

No web chat interface.
No voice input.
No offline mode.

### Responsive interaction rules

- Filter panel menjadi bottom sheet/full-height pada mobile.
- Transaction detail menjadi bottom sheet/full-height pada mobile.
- Dashboard cards tetap readable dan clickable.
- Bottom navigation tidak menutupi content.
- Upload receipt preview tidak menyebabkan horizontal overflow.

---

## 26. Security

Retain security principles:
- Argon2id password hashing.
- HTTPS/TLS.
- input sanitization.
- anti SQL injection.
- XSS protection.
- CSRF protection where applicable.
- rate limiting.
- secure file validation using MIME + magic bytes.
- no password/sensitive credential logging.
- secure secrets handling.
- audit log for meaningful mutations.
- receipt files stored outside public executable paths.
- API key protection and revocation.
- webhook signature verification untuk callback Telegram/WhatsApp.
- draft approval sebagai satu-satunya jalur mutasi finansial dari AI/bot/Hermes.
- strict group/profile scope enforcement in API.
- authorization checks pada setiap resource yang menggunakan group_id/profile_id.

Every destructive action uses explicit confirmation.

AI/bot/Hermes tidak boleh bypass approval untuk financial mutation.

---

## 27. Deployment

Target:
- Docker.
- EasyPanel / AApanel / self-hosted Docker.
- one application service for MVP where practical.
- persistent database volume.
- persistent compressed receipt volume.
- health endpoint.
- automatic restart.
- environment variables/secrets.
- HTTPS via reverse proxy/platform.

Do not over-engineer infrastructure before application stable.

---

## 28. Recommended Technical Direction

Lock one stack for consistent vibe coding.

Recommended baseline:
- Frontend: React + Vite.
- Styling: Tailwind CSS.
- Backend: Node.js + Express.
- Database: SQLite for MVP, schema portable to PostgreSQL.
- ORM/query layer: one consistent typed approach.
- Charts: Recharts.
- Auth: secure token/session implementation with Argon2id.
- OCR: pluggable OCR/Vision adapter.
- AI: provider abstraction with configurable model roles.
- Telegram: grammY.
- WhatsApp: Meta WhatsApp Cloud API.
- PDF: PDFKit or equivalent server-side generator.
- Excel: ExcelJS.
- Deployment: Docker.

Do not implement all AI providers at once. Build provider interfaces and activate only the provider/model needed by the implementation.

---

## 29. API Contract Strategy

Frontend must be developed against stable mock contracts before backend implementation.

### 29.1 Dashboard Contract

`GET /api/dashboard/summary`

Example conceptual response:

```json
{
  "group": {},
  "activeProfile": "all",
  "period": {},
  "totalBalance": 0,
  "income": 0,
  "expense": 0,
  "netCashflow": 0,
  "runway": {},
  "pendingApprovals": 0,
  "comparison": {},
  "topSpending": [],
  "upcomingBills": [],
  "aiInsight": {},
  "aiRecommendation": {},
  "recentTransactions": [],
  "budgetStatus": []
}
```

### 29.2 Transaction Contract

- `GET /api/transactions`
- `POST /api/transactions`
- `GET /api/transactions/:id`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id`

Filter/query parameters must support at minimum:
- group/profile scope
- period/date range
- type
- category
- wallet
- text search

### 29.3 Group/Profile Contract

Minimal endpoints:
- `GET /api/group`
- `GET /api/group/members`
- `POST /api/group/invitations`
- `PATCH /api/profile`

### 29.4 Unified Tagihan Contract

Minimal endpoint families:
- `/api/bills`
- `/api/installments`
- `/api/debts`
- `/api/receivables`
- `/api/credit-cards`
- `/api/credit-card-statements`
- `/api/credit-card-statements/:id/items`
- `/api/credit-card-statements/:id/pay`

Frontend navigation tetap satu menu Tagihan. Backend boleh memakai resource endpoint terpisah untuk maintainability, tetapi tidak boleh memaksa user melihat menu terpisah.

Bill/installment/debt creation must be compatible with transaction-linked creation flow.

Credit card rules:
- transaction expense remains separate and is linked to credit_card_id where applicable.
- statement aggregation reads linked transaction items.
- payment of statement updates statement/credit card outstanding and cash wallet without creating a second expense classification.

### 29.5 AI Configuration Contract

Admin-only configuration endpoint family may expose non-secret metadata such as:
- provider
- model role
- active model
- fallback model
- status

Secrets must never be returned to the frontend as plaintext.

Exact JSON schemas must be defined before backend coding.

Rule:
> Backend implementation must conform to approved frontend contracts unless a change is explicitly approved.

### 29.6 Approval / Draft Contract

Minimal endpoints:
- `GET /api/approvals` — daftar draft menunggu persetujuan (filter source/status).
- `GET /api/approvals/:id` — detail draft + extraction fields + uncertain flags.
- `POST /api/approvals/:id` — edit draft sebelum approve.
- `POST /api/approvals/:id/approve` — approve → buat transaction (source of truth).
- `POST /api/approvals/:id/reject` — reject + alasan opsional.
- `DELETE /api/approvals/:id` — batalkan/hapus draft.

Semua endpoint bersifat group-scoped dan auth-required. Tidak ada jalur approval yang dapat dilewati.

### 29.7 Contract-First (OpenAPI)

Frontend dan backend berbagi satu sumber kontrak:
- Definisikan OpenAPI spec + skema TypeScript/zod tunggal sebelum implementasi Phase 1 dan Phase 2.
- Mock Phase 1 dan backend Phase 2 dihasilkan/divalidasi terhadap spec yang sama.
- Perubahan kontrak hanya melalui revisi spec yang disetujui.

---

## 30. Build Roadmap — 3 Phases

The previous Phase 0–10 roadmap is replaced by exactly **3 development phases**.

### PHASE 1 — Build Frontend Product Experience

Goal:
Build the complete responsive frontend and UX with stable mock data. No real backend/database dependency.

Scope:
- project setup.
- React/Vite.
- Tailwind.
- routing.
- design tokens.
- reusable components.
- login/register mock screens.
- group/profile selector.
- profile screen.
- group/member management mock UI.
- desktop left sidebar.
- mobile bottom navigation.
- dashboard.
- clickable dashboard cards.
- dashboard period selector.
- hidden filter panel.
- transaction list.
- transaction nominal click → detail modal.
- add manual transaction.
- dynamic bill/installment form inside transaction flow.
- wallet UI.
- budget UI.
- bill/reminder UI.
- installment UI.
- unified Tagihan UI containing debt/receivable and credit card statement detail.
- reports UI.
- receipt upload UI.
- receipt preview after upload.
- OCR review UI with mocked extraction.
- AI insight UI.
- approval inbox UI (Persetujuan) untuk draft mock OCR/bot/Hermes.
- notification center UI minimal (ikon lonceng + daftar notifikasi mock).
- net cashflow card dan runway insight (heuristik, mock data).
- merchant → kategori suggestion (mock).
- loading/empty/error/success states.
- automatic IDR formatting.
- automatic nominal terbilang.
- Indonesian UI copy proofreading.
- mobile/desktop responsive QA.

Explicitly do not implement:
- real backend.
- real database.
- real OCR provider.
- real AI provider.
- real Telegram/WhatsApp.
- real Hermes mutations.

Acceptance criteria:
- all primary screens accessible.
- navigation works.
- dashboard cards are clickable where intended.
- nominal opens transaction detail popup.
- filter is hidden until user clicks Filter.
- all four period presets work with mock data.
- desktop sidebar works.
- mobile bottom navigation works.
- upload changes placeholder to image preview.
- bill fields appear contextually from transaction flow.
- IDR formatting works.
- terbilang updates correctly.
- no visible spelling/wording errors.
- responsive layout has no blocking overflow issues.
- approval inbox dan notification center accessible dengan mock.
- net cashflow card dan runway insight render dari mock data.
- production build succeeds.

### PHASE 2 — Build Backend, Database, OCR, AI, and Integrations

Goal:
Replace mock data with production-like backend and connect the approved frontend without redesigning it.

Scope:
- authentication and authorization.
- groups and profiles.
- member invitation.
- group/profile scoping.
- wallets.
- categories.
- transactions CRUD.
- transaction ownership.
- wallet balance aggregation.
- receipt attachment storage/compression.
- OCR provider adapter.
- AI/Vision provider adapter.
- structured receipt extraction.
- schema validation.
- business validation.
- AI model configuration.
- fallback/retry logic.
- AI insight/recommendation.
- unified Tagihan module (regular, recurring, debt/receivable, installment, credit card statements).
- installment progress.
- pay period.
- pay full.
- overdue/lunas.
- credit card statement aggregation and settlement.
- budget.
- reports.
- PDF/Excel export.
- Telegram.
- WhatsApp.
- Hermes API.
- financial approval flow.
- rate limits.
- audit log.
- TransactionDraft + approval inbox backend.
- settlement sebagai tipe transaksi credit_card_settlement.
- opening balance (source: opening_balance).
- status derived (upcoming/due_today/overdue).
- tracking periode tagihan bulanan (last_paid_period).
- notification center in-app.
- merchant → kategori memory (query riwayat).
- cursor pagination pada API Hermes.
- webhook signature verification.
- OpenAPI spec sebagai sumber kontrak tunggal.
- security hardening required by implemented endpoints.

Rules:
- do not redesign approved UI.
- preserve loading/empty/error/success states.
- replace mock data with real API responses.
- enforce group/profile authorization at backend.
- enforce financial approval.
- keep AI models configurable through abstraction.

Acceptance criteria:
- frontend works against backend without unapproved redesign.
- data persists correctly.
- group members see synchronized shared group data.
- profile filtering returns correct data.
- wallet balances update correctly.
- bills/installments work.
- OCR produces editable drafts.
- AI extraction respects schema.
- model fallback works when configured.
- financial mutations require approval.
- APIs are authenticated, scoped, rate-limited where applicable, and audited.
- draft/approval flow works end-to-end untuk OCR, bot, dan Hermes.
- credit card settlement tidak double count expense dan terlihat di riwayat wallet.
- recurring bill tidak bisa dibayar ganda per periode.
- opening balance tidak dihitung sebagai income.
- OpenAPI spec menjadi satu-satunya sumber kontrak mock ↔ backend.

### PHASE 3 — Testing, QA, Security, and Production Readiness

Goal:
Verify the complete system before production deployment.

Testing scope:

#### Frontend Tests
- component tests.
- form validation.
- navigation tests.
- modal/bottom-sheet interactions.
- filter behavior.
- responsive layout checks.
- transaction detail interaction.
- receipt preview behavior.
- IDR formatting.
- terbilang.

#### Backend Tests
- authentication.
- authorization.
- group scope isolation.
- profile filter.
- transaction CRUD.
- wallet balance calculation.
- unified Tagihan calculation.
- installment calculation.
- credit card statement aggregation and settlement.
- debt/receivable settlement.
- report aggregation.

#### OCR/AI Tests
- Indonesian receipt samples.
- clear receipt.
- low-quality receipt.
- partial receipt.
- malformed/noisy input.
- wrong extraction detection.
- schema validation failure.
- business validation failure.
- retry.
- fallback model.
- manual correction flow.
- approval protection.

#### E2E Critical Flows
1. Login → dashboard.
2. Switch group/profile context → dashboard updates.
3. Add regular transaction → wallet/dashboard updates.
4. Add transaction → choose bill option → bill fields appear → save.
5. Installment payment → expense transaction created → progress updates.
6. Click transaction amount → detail popup → edit/delete.
7. Filter dashboard → summary updates.
8. Upload receipt → preview → OCR → AI extraction → review → approve → transaction created.
9. Member A records transaction → Member B sees it in shared group data.
10. Hermes/API mutation → approval → transaction saved.

#### Security and Production QA
- dependency/security scan as appropriate.
- API authorization checks.
- secret handling verification.
- file upload security.
- rate limit verification.
- audit log verification.
- build verification.
- Docker deployment verification.
- health endpoint verification.
- production smoke test.

Acceptance criteria:
- all critical E2E flows pass.
- no high-severity security blocker remains.
- OCR/AI failure paths are safe and recoverable.
- mobile and desktop critical screens pass QA.
- production build and Docker deployment succeed.
- production smoke test passes.

---

## 31. DeepSeek Vibe-Coding Rules

Use these rules in every implementation prompt:

1. Read Master PRD v3 first.
2. Implement only the requested phase/scope.
3. Do not silently add features.
4. Do not redesign already approved UI.
5. Prefer small reusable components.
6. Keep mock data/API contracts stable.
7. Do not implement backend business logic during Phase 1 unless explicitly requested.
8. Before changing schema, explain migration impact.
9. Before changing API contract, explain frontend impact.
10. Use realistic Indonesian/IDR data.
11. Use Asia/Jakarta timezone.
12. Use Bahasa Indonesia for UI copy.
13. Keep loading, empty, error, and success states.
14. Test mobile and desktop layouts.
15. Do not leave fake TODO behavior where a requested feature should work in the current phase.
16. For uncertain implementation details, choose the simplest approach consistent with the PRD and state the assumption.
17. Never expose secrets/API keys in source code.
18. Never allow AI/bot/Hermes to bypass financial approval.
19. Run lint/build/tests relevant to the phase before declaring completion.
20. Enforce group_id/profile scope on backend resources.
21. Keep transaction as source of truth for cashflow mutations.
22. Do not store formatted currency strings as monetary source values.
23. Run Indonesian UI proofreading before phase completion.
24. Treat OCR/AI output as untrusted input until schema and business validation pass.
25. At the end of each phase report:
   - files changed
   - features implemented
   - tests run
   - known limitations
   - assumptions
   - acceptance status
   - next recommended phase
26. Do not store derived status (upcoming/due_today/overdue) as columns; compute at read time.
27. Use contract-first OpenAPI; mock Phase 1 and backend Phase 2 share the same schema.

---

## 32. Phase 1 Prompt Template

Copy/paste prompt:

> You are implementing Catatin according to **Master PRD v3**.
>
> **PHASE: 1 — FRONTEND PRODUCT EXPERIENCE**
>
> Goal:
> Build the complete responsive Catatin frontend using mock data only.
>
> Requirements:
> - React + Vite.
> - Tailwind CSS.
> - Routing.
> - Design tokens.
> - Reusable components.
> - Group/profile selector.
> - Profile and group management UI.
> - Desktop left sidebar.
> - Mobile bottom navigation.
> - Dashboard with clickable cards.
> - Dashboard period selector and hidden filter panel.
> - Transaction list.
> - Click transaction amount to open detail modal.
> - Add manual transaction.
> - Dynamic bill/installment form inside transaction flow.
> - Wallet.
> - Budget.
> - Unified Tagihan module with Tagihan Biasa, Tagihan Bulanan, Hutang/Cicilan, and Tagihan Kartu Kredit.
> - Bill/reminder, installment, debt/receivable, and credit card statement detail.
> - Reports.
> - Receipt upload with post-upload image preview replacing placeholder.
> - OCR review UI with mock extraction.
> - AI insight/recommendation UI.
> - IDR auto-formatting.
> - Automatic nominal spelling/terbilang.
> - Bahasa Indonesia UI copy.
> - Loading, empty, error, success states.
> - Mobile and desktop responsive behavior.
>
> Filter presets:
> - Hari ini.
> - 7 hari terakhir.
> - Bulan ini.
> - Tanggal spesifik.
>
> Do not implement:
> - real backend.
> - real database.
> - real OCR provider.
> - real AI provider.
> - Telegram.
> - WhatsApp.
> - Hermes mutations.
>
> IMPORTANT:
> - Do not invent features.
> - Do not create a web chatbot.
> - Do not use voice input.
> - Do not implement offline sync.
> - Do not hardcode secrets.
>
> Before finishing:
> - run build.
> - inspect mobile layout.
> - inspect desktop layout.
> - inspect filter interactions.
> - inspect transaction detail popup.
> - inspect receipt preview.
> - inspect IDR formatting and terbilang.
> - proofread all Indonesian UI copy.
> - report files changed, tests/build run, limitations, and acceptance status.
>
> STOP after Phase 1.

---

## 33. Phase 2 Prompt Template

Copy/paste prompt:

> You are implementing Catatin according to **Master PRD v3**.
>
> **PHASE: 2 — BACKEND, DATABASE, OCR, AI, AND INTEGRATIONS**
>
> The approved frontend already exists. Do not redesign it.
>
> Requirements:
> - implement authentication and authorization.
> - implement group/family accounts.
> - implement profiles and member management.
> - enforce group_id and profile ownership rules.
> - implement wallets, categories, transactions.
> - preserve transaction as source of truth for cashflow.
> - implement bill/reminder and installment.
> - support dynamic bill creation from transaction workflow.
> - implement debt/receivable.
> - implement budget.
> - implement receipt storage/compression.
> - implement OCR/Vision adapter.
> - implement AI provider/model abstraction.
> - support configurable OCR, extraction, insight, and agent models.
> - implement structured extraction schema validation.
> - implement business validation.
> - implement retry/fallback logic.
> - implement editable OCR review flow.
> - implement AI insight/recommendation.
> - implement reports and export.
> - implement Telegram.
> - implement WhatsApp.
> - implement Hermes API.
> - enforce approval for every financial mutation.
> - implement rate limits and audit logs where required.
>
> Rules:
> - do not redesign approved UI.
> - do not replace approved components unnecessarily.
> - preserve frontend API contracts unless change is explicitly approved.
> - never return secrets to frontend.
> - never bypass financial approval.
>
> Test at minimum:
> - transaction CRUD.
> - wallet balance.
> - group/profile filtering.
> - bill/installment flows.
> - OCR extraction.
> - schema validation.
> - AI fallback.
> - approval protection.
>
> At the end report:
> - database changes.
> - API endpoints.
> - model/provider configuration.
> - frontend files changed only for integration.
> - tests run.
> - limitations.
> - acceptance status.
>
> STOP after Phase 2.

---

## 34. Phase 3 Prompt Template

Copy/paste prompt:

> You are implementing and validating Catatin according to **Master PRD v3**.
>
> **PHASE: 3 — TESTING, QA, SECURITY, AND PRODUCTION READINESS**
>
> Do not add product features unless required to fix a failing acceptance criterion.
>
> Execute:
> - frontend component tests.
> - form validation tests.
> - navigation tests.
> - filter tests.
> - modal/bottom-sheet tests.
> - transaction interaction tests.
> - receipt preview tests.
> - IDR formatting tests.
> - terbilang tests.
> - backend auth tests.
> - authorization/group scope tests.
> - profile filtering tests.
> - transaction CRUD tests.
> - wallet calculation tests.
> - bill/reminder tests.
> - installment tests.
> - unified Tagihan tests.
- credit card statement aggregation/settlement tests.
- debt/receivable tests.
> - report aggregation tests.
> - OCR/AI accuracy and failure-path tests.
> - structured output validation tests.
> - retry/fallback tests.
> - approval bypass tests.
- draft lifecycle tests (create/edit/approve/reject/expired).
- approval inbox tests (OCR/bot/Hermes).
- settlement no-double-count tests.
- recurring bill period tracking tests.
- opening balance exclusion tests.
- notification derived tests.
- OpenAPI contract conformance tests.
> - critical end-to-end flows.
> - responsive QA for mobile and desktop.
> - security verification.
> - Docker deployment test.
> - health endpoint test.
> - production smoke test.
>
> Critical E2E flows:
> 1. login → dashboard.
> 2. switch profile → dashboard updates.
> 3. create transaction → wallet/dashboard updates.
> 4. create bill through transaction flow.
> 5. pay installment → transaction + progress update.
> 6. click nominal → detail popup.
> 7. apply dashboard filter.
> 8. upload receipt → preview → OCR → AI → review → approval → transaction.
> 9. member A creates transaction → member B sees synced shared data.
> 10. Hermes mutation → approval → saved transaction.
>
> Fix bugs that prevent acceptance.
>
> At the end report:
> - tests executed.
> - pass/fail status.
> - bugs fixed.
> - remaining known issues.
> - security findings.
> - deployment findings.
> - production readiness status.
>
> STOP after Phase 3.

---

## 35. Definition of Done — Overall

Catatin is ready for production only when:

### Core Finance
- manual income/expense works.
- wallet balances update correctly.
- transaction CRUD works.
- delete confirmation works.
- transaction detail popup works.
- receipt attachment works.
- OCR flow works with review + approval.

### Group and Profile
- group can contain multiple profiles.
- admin/member role works.
- member invitation flow works.
- group data is shared correctly.
- profile ownership is stored correctly.
- created_by is stored correctly.
- dashboard can show all members or a selected profile.
- profile filtering does not leak data outside authorized group scope.

### Dashboard and UX
- desktop uses left sidebar.
- mobile uses bottom navigation.
- dashboard cards with detail targets are clickable.
- filter panel is hidden by default.
- filter supports hari ini, 7 hari terakhir, bulan ini, tanggal spesifik.
- transaction nominal opens detail popup.
- responsive layouts work without blocking overflow.
- net cashflow card dan pending approvals entry tampil di dashboard.
- notification center menampilkan reminder jatuh tempo/overdue dan draft menunggu persetujuan.

### Transaction and Tagihan
- bill creation is integrated into transaction workflow.
- dynamic bill fields appear contextually.
- one main Tagihan menu contains regular bills, recurring bills, debt/receivable, installments, and credit card statements.
- installment progress works.
- pay-period creates expense transaction.
- pay-full marks installment lunas correctly.
- overdue status works.
- reminders work.
- credit card purchases remain separate transactions.
- credit card statement correctly accumulates linked purchases/debt/installments.
- credit card statement detail exposes underlying transactions.
- statement payment reduces liability and cash wallet without double counting expense.
- credit card settlement muncul di riwayat wallet dan tidak dihitung sebagai expense.
- recurring bill mencatat periode pembayaran (last_paid_period) dan mencegah pembayaran ganda.
- opening balance dicatat sebagai transaksi (source opening_balance) dan tidak dihitung sebagai income.

### AI/OCR
- AI model configuration is provider/model based.
- OCR/extraction adapters are replaceable.
- schema validation works.
- business validation works.
- retry/fallback works when configured.
- AI output never creates unapproved financial mutation.
- TransactionDraft dan approval inbox berfungsi untuk draft OCR/bot/Hermes; approval adalah satu-satunya jalur mutasi.
- receipt preview replaces upload placeholder after file selection.

### Numbers and Copy
- IDR formatting is automatic.
- numeric source value is stored correctly.
- nominal terbilang updates automatically.
- Indonesian UI copy has been proofread.
- no major typo/inconsistent terminology remains.

### Reports and Integrations
- dashboard insight/recommendation works.
- detailed reports work.
- PDF/Excel exports work.
- Telegram flow works with approval.
- WhatsApp flow works with approval.
- Hermes API is authenticated, scoped, rate-limited, and audited.
- Hermes READ mendukung cursor pagination.

### Security and Production
- security checks pass.
- secrets are protected.
- file upload validation works.
- audit logs work.
- Docker deployment works.
- health endpoint works.
- production smoke tests pass.

---

## 36. Final Product Architecture Principle

Catatin should remain simple to operate despite its breadth of features.

The primary product flow is:

```text
Group / Profile
      ↓
Dashboard
      ↓
Transaction
   ┌──┴─────────────┐
   │                │
Regular         Bill / Installment
Transaction          │
   │                 │
   └──────→ Cashflow ←┘
              │
         Wallet Balance
              │
         Dashboard / Reports

Receipt
  ↓
OCR / Vision
  ↓
AI Extraction
  ↓
Validation
  ↓
Review
  ↓
Approval
  ↓
Transaction

Hermes / Telegram / WhatsApp
              ↓
             Draft
              ↓
          Validation
              ↓
           Approval
              ↓
          Transaction
```

The system must keep one consistent source of truth for financial state, one shared group scope for family/team data, and controlled AI-assisted workflows that never bypass user approval for financial mutations.

Billing architecture principle:
- User-facing navigation has one **Tagihan** menu only.
- Tagihan is a unified presentation layer over regular bills, recurring bills, debt/receivable, installments, and credit card statements.
- A credit card payment creates separate expense transactions at purchase time; the statement aggregates them as a liability.
- Paying the credit card statement is a liability settlement and must not create a second expense classification.
