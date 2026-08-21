# CATATIN V2 — REPORT (LAPORAN) CONTENT AREA DESIGN SPECIFICATION

Extracted from the live Catatin v2 source (`src/features/reports/ReportsPage.tsx`, `useReport.ts`, `report.ts`, `src/features/dashboard/components/AiInsightCard.tsx`, `src/components/ui/**`). This is the implementation-ready visual contract for the Catatin v3 **Laporan / Report content area**. Visuals only — no business logic, calculations, API, data, state, routing, or shell.

> **Source stack:** React 19 + TypeScript, Tailwind CSS v4 (CSS-first `@theme` tokens), `@phosphor-icons/react` v2, `Plus Jakarta Sans Variable`, dark mode via `.dark` class variant.

---

## 1. EXECUTIVE SUMMARY

- The Laporan page is a **single-column analytical dashboard** (`max-w-5xl`) built from a strict sequence of reusable cards separated by `gap-4` (16px).
- Visual language is **calm financial "trust-first"**: slate neutrals, one blue brand accent, emerald/rose only as semantics, flat 2D surfaces with a single soft shadow token (`shadow-card`) and 1px hairlines.
- **No real charts.** All data visualization is expressed as **CSS `Progress` bars** (4px radius-track, rounded fill) inside `BarBreakdown`/`BudgetComparisonCard`, plus **merchant ranking** as an aligned amount + percent list. Reusable "chart container" = `Card` + `CardHeader`.
- **KPI strip** is a single card with internal hairline dividers (2-col mobile, 4-col desktop), each cell = label + semantic icon chip + large display number + one-line context.
- **Insight AI** is the only non-neutral element: a subtle brand-gradient card with an uppercase micro-label, expandable explanation block, and a separated recommendation footer.
- Grid pattern: the content area alternates **full-width cards** (KPI strip, Insight, Daftar Transaksi) and **2-across grids** (`lg:grid-cols-2`) for analysis widgets (Kategori/Dompet, Budget/Merchant, Tagihan/Hutang).
- Mobile is deliberate: 2-col KPI + 1-col filter grid, widgets stack vertically, all cards keep `rounded-2xl`; toolbar's 4 controls collapse to 2×2, then 1-col.

---

## 2. VISUAL PRINCIPLES

1. **One surface, one elevation.** All widgets = `Card` (`rounded-2xl border bg-white shadow-card`, `p-4 sm:p-5`). No nested elevation, no gradient except the Insight card.
2. **Hairline separators.** Lists divide with `divide-y divide-slate-100`; KPI cells separate with `border-l`/`border-t` hairlines; widget footers use `border-t`.
3. **Semantic color discipline.** Emerald = income/positive; rose = expense/negative/danger; brand blue = interactive/identity; amber = warning (bills "Rutin", budget "waspada"); slate carries the neutral UI.
4. **Weight-led hierarchy.** Section titles `text-sm font-semibold`; widget titles `text-sm font-semibold`; values `text-sm font-semibold`; KPIs `text-xl sm:text-2xl font-bold tracking-tight`; metadata `text-xs`.
5. **Numbers are tabular.** All amounts use `tabular-nums`; KPI display numbers add `tracking-tight`; signed amounts carry explicit `+`/`-`.
6. **Repeated layout family.** Three identical `lg:grid-cols-2` widget grids keep rhythm; full-width KPI + Insight + Transaction sections break the rhythm intentionally.
7. **States are complete:** loading skeletons, error with retry, empty widgets, and a no-results transaction list are all implemented.
8. **Reduced motion respected.** Global `prefers-reduced-motion` collapses all animation/transition to ~0.01ms.

---

## 3. REPORT CONTENT STRUCTURE

Page: `/laporan` (`ReportsPage.tsx`), rendered inside `AppShell` main container (`max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 lg:pt-8 pb-28 lg:pb-10`).

```
div (ReportsPage, flex-col)
├─ Back button (icon-only, h-10 w-10 rounded-xl)     ← mb-4
├─ PageHeader "Laporan" + action "Ekspor CSV"         ← mb-5
├─ Filter Card (mb-4, p-4)
│  ├─ grid grid-cols-2 gap-3 lg:grid-cols-4  → 2 date Inputs + 2 Selects
│  └─ mt-3 flex items-center gap-2  → search Input + "Cari" + "Atur ulang"
├─ Body (one of three):
│  ├─ loading → LoadingState rows=6 inside Card
│  ├─ error   → ErrorState
│  └─ ready   → ReportContent (flex flex-col gap-4):
│     ├─ KPI Strip Card (padded=false, 2×2 → 4-col grid)         FULL WIDTH
│     ├─ AiInsightCard                                           FULL WIDTH
│     ├─ grid lg:grid-cols-2 → BarBreakdown Kategori + BarBreakdown Dompet
│     ├─ grid lg:grid-cols-2 → BudgetComparisonCard + MerchantCard
│     ├─ grid lg:grid-cols-2 → BillsCard + DebtsCard
│     ├─ Card "Daftar Transaksi" (full width) → TransactionRow list
│     └─ Footer note (CalendarDots + period label)
```

| Level | Component | Layout | Grid slot |
|---|---|---|---|
| Toolbar | Filter Card | `mb-4 rounded-2xl p-4` | full width |
| KPI strip | `Card padded={false}` | `grid grid-cols-2 lg:grid-cols-4` | full width |
| Insight | `AiInsightCard` | `padded={false}` brand gradient | full width |
| Analysis A | `BarBreakdown` ×2 | `grid gap-4 lg:grid-cols-2` | 2-across ≥lg |
| Analysis B | `BudgetComparisonCard` + `MerchantCard` | `grid gap-4 lg:grid-cols-2` | 2-across ≥lg |
| Analysis C | `BillsCard` + `DebtsCard` | `grid gap-4 lg:grid-cols-2` | 2-across ≥lg |
| Transaction list | `Card` + `TransactionRow` | full width | full width |
| Footer | note `text-xs` centered | `py-2` | full width |

**Widget ordering:** KPI → Insight → Kategori/Dompet → Budget/Merchant → Tagihan/Hutang → Daftar Transaksi. This ordering is fixed in source.

---

## 4. HEADER

Source: `ReportsPage.tsx` (lines 382–396) + reusable `PageHeader.tsx`. Follows the **reusable PageHeader pattern** (also used on Transaksi).

| Property | Value |
|---|---|
| Wrapper | `mb-5 flex items-end justify-between gap-4` |
| Title | `text-2xl font-bold tracking-tight text-slate-900 dark:text-white` — "Laporan" |
| Subtitle | `mt-1 text-sm text-slate-500 dark:text-slate-400` — "Rekap pemasukan, pengeluaran, dan analisis keuangan." |
| Action | `Button variant="secondary"` "Ekspor CSV" with `DownloadSimple size={18}` leading icon; **only rendered when `state.status === 'ready' && transactions.length > 0`** |
| Back button | above header, `mb-4 h-10 w-10 rounded-xl` icon button, `ArrowLeft size={20}`, `text-slate-500 hover:bg-slate-100 hover:text-slate-800` |

**Responsive:** Title/subtitle fixed sizes at all breakpoints. Action button always visible (unlike Transaksi page which hides its action < `sm`). Back button appears at all breakpoints.

---

## 5. DATE & FILTER TOOLBAR

Source: `ReportsPage.tsx` (lines 398–459). One Card, two stacked bands.

### 5.1 Container
| Property | Value |
|---|---|
| Wrapper | `Card className="mb-4"` → `rounded-2xl border bg-white shadow-card p-4 sm:p-5` |
| Band 1 | `grid grid-cols-2 gap-3 lg:grid-cols-4` |
| Band 2 | `mt-3 flex items-center gap-2` |

### 5.2 Date range inputs (Dari / Sampai)
| Property | Value |
|---|---|
| Component | `Input` with `label` ("Dari tanggal" / "Sampai tanggal"), `type="date"` |
| Label | `text-sm font-medium text-slate-700 dark:text-slate-300`; wrapper `flex flex-col gap-1.5` |
| Input | `h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900`, dark `bg-slate-900 text-white` |
| Border | `border-slate-200` / dark `border-slate-700` |
| Focus | `focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60` |
| Placeholder | `placeholder:text-slate-400` / dark `slate-500` |

### 5.3 Type / Category selects
| Property | Value |
|---|---|
| Component | `Select` with `label` ("Tipe" / "Kategori") |
| Options (Tipe) | `Semua tipe` / `Pengeluaran` / `Pemasukan` |
| Options (Kategori) | `Semua kategori` + dynamic categories |
| Select | `h-11 w-full appearance-none rounded-xl border bg-white px-3 pr-9 text-sm`, chevron via `.select-chevron` (16px SVG `#64748b`, `right 0.75rem`) |
| Error state | (not used in toolbar; token exists in shared `Select`) |

### 5.4 Search + action buttons (Band 2)
| Element | Value |
|---|---|
| Search `Input` | `flex-1`, `h-11 rounded-xl`, placeholder "Cari merchant atau deskripsi...", `leadingIcon={<MagnifyingGlass size={16} />}` (leading icon `left-3 top-1/2 -translate-y-1/2`, `pl-10`) |
| Search submit | Enter key submits (onKeyDown) |
| "Cari" | `Button variant="secondary" className="shrink-0"` |
| "Atur ulang" | `Button variant="ghost" className="shrink-0"` `leadingIcon={<ArrowClockwise size={16} />}` |

**Control identification:** labeled date inputs + labeled native selects + icon search + text buttons. No pills/chips/tabs.

**Responsive:** Band 1 = `grid-cols-2` (2×2 on mobile: Dari/Sampai stacked over Tipe/Kategori) → `lg:grid-cols-4` (all four in a row). Band 2 stays a single flex row at all sizes (search flexes, buttons `shrink-0`).

---

## 6. KPI / SUMMARY CARDS

Source: `ReportContent` (lines 481–527) + `StatCell` (lines 39–86).

**Pattern: one KPI strip card, hairline-divided cells** (recently refined per taste-skill 4.4/4.9; this is the current v2 source).

| Property | Value |
|---|---|
| Container | `Card padded={false}` → `rounded-2xl border bg-white shadow-card` (no internal padding) |
| Grid | `grid grid-cols-2 lg:grid-cols-4` |
| Cell | `min-w-0 p-4 sm:p-5` |
| Cell dividers | cell 2: `border-l`; cell 3: `border-t lg:border-l lg:border-t-0`; cell 4: `border-l border-t lg:border-t-0` — all `border-slate-100 dark:border-slate-800` |
| Cell header row | `flex items-center gap-1.5`: icon chip `h-6 w-6 rounded-lg` + label `truncate text-xs font-medium text-slate-500 dark:text-slate-400` |
| Main value | `mt-2 truncate text-xl font-bold tracking-tight tabular-nums sm:text-2xl` + semantic `valueClass` |
| Sub / context | `mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500 sm:text-xs` |

| Cell | Label | Value color (light/dark) | Icon / chip | Sub |
|---|---|---|---|---|
| 1 | Pemasukan | `text-emerald-600` / `text-emerald-400` | `ArrowUpRight 14 duotone`, `bg-emerald-50 text-emerald-600` / `bg-emerald-950 text-emerald-400` | period label `{from} - {to}` |
| 2 | Pengeluaran | `text-rose-600` / `text-rose-400` | `ArrowDownRight 14`, rose chip | `{transactionCount} transaksi` |
| 3 | Arus kas bersih | emerald if `net ≥ 0`, rose if < 0 | `TrendUp`/`TrendDown 14` matching | `Surplus` / `Defisit` |
| 4 | Rata-rata pengeluaran | `text-slate-900` / `text-white` (neutral) | `Receipt 14`, `bg-brand-50 text-brand-600` / `bg-brand-950 text-brand-300` | `per transaksi pengeluaran` |

**Reusable Metric/KPI Card pattern:** `StatCell` = label + icon chip + large display number + one-line "why it matters". Signed KPI (`+`/`-`) uses `formatCurrency(Math.abs(...))`.

**Responsive:** 2×2 mobile (dividers: right column `border-l`, bottom row `border-t`), 4-across desktop (all vertical `border-l`). Amounts `text-xl` mobile → `sm:text-2xl`.

---

## 7. INSIGHT AI

Source: `AiInsightCard.tsx` (shared with Dashboard). The **only non-neutral card** in the content area.

| Property | Value |
|---|---|
| Container | `Card padded={false} overflow-hidden` + `border-brand-200/70 bg-gradient-to-b from-brand-50 to-white`; dark `border-brand-900 dark:from-brand-950 dark:to-slate-900` |
| Body padding | `p-5 sm:p-6` |
| Eyebrow row | `flex items-center gap-2`: round chip `h-7 w-7 rounded-full bg-brand-600 text-white` + `Sparkle 15 weight="fill"`; label `text-xs font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300` — "INSIGHT AI" |
| Title | `mt-3 text-base font-bold text-slate-900 dark:text-white` (`insight.title`) |
| Summary | `mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300` |
| Expand trigger | button `mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800` (+ dark variants); `Lightbulb 15 duotone` + "Lihat penjelasan" + `CaretDown 14` with `rotate-180` on expand (`transition-transform duration-200`) |
| Explanation block | `dl mt-3 space-y-2.5 rounded-xl border border-brand-100 bg-white p-4 text-sm`; dark `border-brand-900 bg-slate-900`; 4 items: `dt font-semibold text-slate-700 dark:text-slate-300`, `dd mt-0.5 text-slate-600 dark:text-slate-400` |
| Recommendation footer | `border-t border-brand-100 bg-white/70 px-5 py-4 sm:px-6`; dark `border-slate-800 bg-slate-900/70`; label row `ListChecks 15 duotone text-brand-600` + `text-xs font-bold uppercase tracking-[0.14em] text-slate-500` "REKOMENDASI"; title `mt-1.5 text-sm font-semibold text-slate-800`; body `mt-1 text-sm leading-relaxed text-slate-600` |

**Responsive:** single column, padding `p-5 sm:p-6`, full width at all breakpoints. Explanation block collapses/expands in place (no layout shift).

---

## 8. CHART SYSTEM

**Catatin v2 has NO SVG/canvas charts.** All visualization is CSS `Progress` bars and ranked lists.

### 8.1 Progress bar (shared `Progress.tsx`)
| Property | Value |
|---|---|
| Track | `h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800` |
| Fill | `h-full rounded-full transition-all duration-500`, width inline style `%` |
| Tones | `brand` = `bg-brand-500`, `emerald` = `bg-emerald-500`, `amber` = `bg-amber-500`, `rose` = `bg-rose-500`, `slate` = `bg-slate-400` |
| Clamp | value/max clamped 0–100 |

### 8.2 BarBreakdown "chart" (Kategori / Dompet)
| Property | Value |
|---|---|
| Container | `Card` + `CardHeader` (title `text-sm font-semibold`, icon chip `h-8 w-8 rounded-lg bg-brand-50 text-brand-600`) |
| List | `ul flex flex-col gap-3.5` |
| Row | label left `truncate font-medium text-sm text-slate-700 dark:text-slate-300`; right column `flex shrink-0 gap-2`: amount `tabular-nums font-semibold text-sm text-slate-900` + percent `w-9 text-right text-xs tabular-nums text-slate-400` |
| Bar | `Progress tone="brand" className="mt-1.5"` (full card width) |
| Empty | `EmptyState` "Belum ada data" + description |
| Colors | single `brand-500` series — **no per-category colors** |

### 8.3 BudgetComparison "chart"
| Property | Value |
|---|---|
| Row 1 | label left (`text-sm font-medium text-slate-700`) + `Badge` right showing `{percent}%` |
| Badge tone | `danger` (rose) if `lebih`, `warning` (amber) if `waspada`, `income` (emerald) if `aman` |
| Row 2 | `mt-1.5 flex justify-between text-xs text-slate-500`: left `{spent} dari {budget}`; right status text (`lebih {diff}` / `mendekati batas` / `aman`) |
| Bar | `Progress mt-1`, tone `rose` (lebih) / `amber` (waspada) / `emerald` (aman) |

**Chart-container pattern (reusable):** `Card > CardHeader > list of label+value+Progress`. There is no dedicated chart container component beyond `Card`.

---

## 9. ANALYSIS WIDGETS

### 9.1 BarBreakdown (Pengeluaran per Kategori / per Dompet)
Shared `BarBreakdown` component (see §8.2). Same widget used twice in one `lg:grid-cols-2` grid. Headers: "Pengeluaran per Kategori" (`ChartBar 16`), "Pengeluaran per Dompet" (`Wallet 16`).

### 9.2 BudgetComparisonCard
See §8.3. CardHeader "Perbandingan Budget" + subtitle "Pemakaian budget per kategori pada periode ini." + `ChartBar 16` icon. Empty → "Belum ada budget" / "Atur budget di halaman Budget…".

### 9.3 MerchantCard (Merchant Teratas)
| Property | Value |
|---|---|
| Header | "Merchant Teratas" + subtitle "Tempat pengeluaran terbanyak pada periode ini." + `Storefront 16` |
| List | `ul flex flex-col gap-3` (loose, no dividers) |
| Row | `flex items-center justify-between gap-2`: left `min-w-0` (merchant `truncate text-sm font-medium text-slate-700`; count `text-xs text-slate-400` "{n} transaksi"); right `flex shrink-0 gap-2` (amount `tabular-nums text-sm font-semibold text-slate-900`; percent `w-9 text-right text-xs tabular-nums text-slate-400`) |
| Empty | "Belum ada data" / "Belum ada merchant yang tercatat." |

### 9.4 BillsCard (Tagihan Berjalan)
| Property | Value |
|---|---|
| Header | "Tagihan Berjalan" + "Tagihan rutin dan cicilan aktif bulan ini." + `Repeat 16` |
| List | `ul -mx-4 -mb-4 divide-y divide-slate-100 sm:-mx-5 sm:-mb-5` (hairline rows, edge-to-edge) |
| Row | `flex items-center gap-3 px-4 py-3 sm:px-5` |
| Day tile | `h-10 w-10 rounded-xl text-sm font-bold`; installment `bg-brand-50 text-brand-600` (+dark `bg-brand-950 text-brand-300`); recurring `bg-amber-50 text-amber-600` (+dark) — shows `due_day` |
| Title + Badge | `flex items-center gap-2`: title `truncate text-sm font-medium text-slate-800`; `Badge` "Cicilan" (`default` brand) or "Rutin" (`warning` amber) |
| Meta | `truncate text-xs text-slate-500` — `{category} · {wallet}` |
| Progress (installment) | `mt-1.5 flex items-center gap-2`: `Progress tone="brand" className="min-w-0 flex-1"` + counter `text-[11px] tabular-nums text-slate-400` `{paid}/{total}` |
| Amount column | `flex shrink-0 flex-col items-end gap-0.5`: amount `tabular-nums text-sm font-semibold text-slate-900`; `text-xs text-slate-400` "Jatuh tempo {due_label}" |
| Empty | "Tidak ada tagihan" / "Tagihan rutin dan cicilan aktif akan muncul di sini." |

### 9.5 DebtsCard (Hutang & Piutang)
| Property | Value |
|---|---|
| Header | "Hutang & Piutang" + "Ringkasan posisi hutang dan piutang saat ini." + `HandCoins 16` |
| Body | `grid grid-cols-2` (single card surface, no gap) |
| Cell | `min-w-0 p-4 sm:p-5`; right cell `border-l border-slate-100 dark:border-slate-800` |
| Label row | icon chip `h-6 w-6 rounded-lg` (rose: `bg-rose-50 text-rose-600` / `TrendDown 14`; emerald: `bg-emerald-50 text-emerald-600` / `TrendUp 14`) + label `text-xs font-medium text-slate-500` |
| Value | `mt-2 truncate text-xl font-bold tracking-tight tabular-nums sm:text-2xl`; Hutang `text-rose-600`/`text-rose-400`; Piutang `text-emerald-600`/`text-emerald-400` |
| Context | `mt-0.5 truncate text-[11px] sm:text-xs text-slate-400` — "dari {total}" |
| Footer | `border-t border-slate-100 px-4 py-3 sm:px-5 text-xs text-slate-500` — "{count} catatan hutang/piutang tercatat." |

### 9.6 Daftar Transaksi (full-width list card)
See §10.

---

## 10. LIST / TABLE SYSTEM

**All lists are lists, not tables.** Three list styles coexist:

| List | Style | Dividers | Rows |
|---|---|---|---|
| BarBreakdown rows | loose `gap-3.5` | none | label + amount + % + Progress |
| MerchantCard rows | loose `gap-3` | none | merchant + count + amount + % |
| BillsCard rows | **hairline `divide-y`**, edge-to-edge (`-mx-4 sm:-mx-5`) | `divide-slate-100` | day tile + identity + amount |
| Daftar Transaksi | **hairline `divide-y`**, edge-to-edge | `border-b … last:border-0` | `TransactionRow` (reused from Transaksi feature) |

### 10.1 TransactionRow (reused in Daftar Transaksi)
| Property | Value |
|---|---|
| Row | `<Link>` `flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100` (+dark `hover:bg-slate-800/60`) |
| Icon chip | `h-10 w-10 rounded-xl`; income `bg-emerald-50 text-emerald-600` (+dark), expense `bg-slate-100 text-slate-500` (+dark); `ArrowUpRight`/`ArrowDownRight 18 weight="bold"` |
| Identity | `min-w-0 flex-1`: merchant `truncate text-sm font-medium text-slate-800`; meta `truncate text-xs text-slate-500` `{category} · {wallet}` |
| Amount col | `flex shrink-0 items-center gap-1.5`: amount `text-sm font-semibold tabular-nums` (income emerald, expense `text-slate-900`); date `text-xs text-slate-400`; `CaretRight 14 text-slate-300` |

**Amount alignment:** right-aligned amounts + percent `w-9` right-aligned in every list. **Badges:** pill, `text-xs font-semibold`, `min-h-6 rounded-full px-2.5 py-0.5`. **Header styling:** widget title via `CardHeader`.

---

## 11. TYPOGRAPHY

Font family (all): `Plus Jakarta Sans Variable` (fallback `ui-sans-serif, system-ui…`), global `antialiased`.

| Role | Size | Weight | Tracking | Color (light/dark) |
|---|---|---|---|---|
| Page title | `text-2xl` (24px) | `font-bold` | `tracking-tight` | `slate-900` / `white` |
| Page subtitle | `text-sm` (14px) | normal | — | `slate-500` / `slate-400` |
| Widget title (`CardHeader` h3) | `text-sm` (14px) | `font-semibold` | — | `slate-900` / `white` |
| Widget subtitle | `text-xs` (12px) | normal | — | `slate-500` / `slate-400` |
| Filter label | `text-sm` (14px) | `font-medium` | — | `slate-700` / `slate-300` |
| Control text | `text-sm` (14px) | normal | — | `slate-900` / `white` |
| Placeholder | `text-sm` (14px) | normal | — | `slate-400` / `slate-500` |
| KPI label | `text-xs` (12px) | `font-medium` | — | `slate-500` / `slate-400` |
| KPI value | `text-xl` (20px) → `sm:text-2xl` (24px) | `font-bold` | `tracking-tight` | semantic |
| KPI context | `text-[11px]` → `sm:text-xs` | normal | — | `slate-400` / `slate-500` |
| List primary (category/merchant/bill) | `text-sm` (14px) | `font-medium` | — | `slate-700`/`slate-800` / `slate-300`/`slate-200` |
| List metadata (count/date/wallet) | `text-xs` (12px) | normal | — | `slate-400`/`slate-500` |
| Amount (list/table) | `text-sm` (14px) | `font-semibold` | — | `slate-900` / `white` |
| Percent | `text-xs` (12px) | normal | — | `slate-400` |
| Badge | `text-xs` (12px) | `font-semibold` | — | per variant |
| Insight eyebrow / footer label | `text-xs` (12px) | `font-bold` | `uppercase tracking-[0.14em]` | `brand-700`/`brand-300`; `slate-500`/`slate-400` |
| Insight title | `text-base` (16px) | `font-bold` | — | `slate-900` / `white` |
| Insight body | `text-sm` (14px) | normal | `leading-relaxed` | `slate-600` / `slate-300` |
| Insight explanation `dt`/`dd` | `text-sm` (14px) | `dt font-semibold` | — | `slate-700`/`slate-600` |
| Transaction merchant | `text-sm` (14px) | `font-medium` | — | `slate-800` / `slate-200` |
| Footer note | `text-xs` (12px) | normal | — | `slate-400` / `slate-500` |
| Empty/Error | `text-sm`/`text-base` | `font-semibold` | — | `slate-800`/`slate-900` |
| Button label | `text-sm` (14px) | `font-semibold` | — | per variant |

**Hierarchy:** primary = `slate-800/900` + `font-semibold/bold`; secondary = `slate-500`; tertiary = `slate-400`. Two uppercase micro-labels only on the Insight card (`INSIGHT AI`, `REKOMENDASI`).

---

## 12. COLOR SYSTEM

Preserved source tokens. Brand in `src/index.css` `@theme`; slate/emerald/rose/amber = Tailwind v4 defaults.

### 12.1 Surfaces
| Token | HEX | Usage |
|---|---|---|
| Page bg light | `slate-50` `#f8fafc` | `body` |
| Page bg dark | `slate-950` `#020617` | `body` |
| Card surface | `white` / `slate-900` | all widgets, controls, modal |
| Insight bg | `linear-gradient(to bottom, brand-50 → white)` | `from-brand-50 to-white` |
| Insight bg dark | `linear-gradient(to bottom, brand-950 → slate-900)` | `dark:from-brand-950 dark:to-slate-900` |
| Recommendation strip | `white/70` / `slate-900/70` | insight footer |
| Row hover | `slate-50` / `slate-800/60` | TransactionRow |
| Row active | `slate-100` / `slate-800` | TransactionRow |

### 12.2 Text
| Token | HEX | Usage |
|---|---|---|
| Primary | `slate-900` `#0f172a` / `white` | titles, amounts |
| Secondary | `slate-700` `#334155` / `slate-300` `#cbd5e1` | labels, list primary |
| Muted | `slate-500` `#64748b` / `slate-400` `#94a3b8` | subtitles, metadata |
| Disabled/tertiary | `slate-400` / `slate-500` | percent, footer note |
| Interactive link text | `brand-700` / `brand-300` | insight expand, (brand-600 on transaksi page) |

### 12.3 Semantic
| Role | Light | Dark |
|---|---|---|
| Income / positive | `emerald-600` `#059669` | `emerald-400` `#34d399` |
| Expense / negative | `rose-600` `#e11d48` | `rose-400` `#fb7185` |
| Neutral expense amount (list) | `slate-900` | `white` |
| Success (budget aman) | `emerald-600` | `emerald-400` |
| Warning (budget waspada / bill Rutin) | `amber-600` `#d97706` (icons/chips) / `amber-700` `#b45309` (badge) | `amber-300` / `amber-400` |
| Danger (budget lebih) | `rose-600`/`rose-700` | `rose-300`/`rose-400` |
| Info (bill Cicilan, KPI Rata-rata) | `brand-600` `#2563eb` | `brand-400`/`brand-300` |

### 12.4 Chart series
| Token | HEX | Usage |
|---|---|---|
| Primary series (Kategori/Dompet bars) | `brand-500` `#3b82f6` | `Progress tone="brand"` |
| Positive series (budget aman) | `emerald-500` `#10b981` | progress fill |
| Warning series | `amber-500` `#f59e0b` | progress fill |
| Danger series | `rose-500` `#f43f5e` | progress fill |
| Track (neutral) | `slate-100` / `slate-800` | progress track |
| Category colors | **none** — single brand series | — |

### 12.5 Borders & dividers
| Token | HEX / alpha | Usage |
|---|---|---|
| Card border | `slate-200/80` / `slate-800` | widgets, controls |
| Divider | `slate-100` `#f1f5f9` / `slate-800` | `divide-y`, `border-l`, `border-t` |
| Insight border | `brand-200/70` / `brand-900` | insight card |
| Focus ring | `brand-500/60` (2px) | inputs/selects |
| Selection | `brand-600` bg + white | `::selection` |

---

## 13. SPACING / GRID / SURFACES

### 13.1 Content area
| Item | Value |
|---|---|
| Page container | `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 lg:pt-8 pb-28 lg:pb-10` |
| Page column gap | `gap-4` (16px) between all content sections |
| Header margin | `mb-5` (20px) |
| Back button margin | `mb-4` (16px) |
| Filter card margin | `mb-4` (16px) |

### 13.2 Grid
| Item | Value |
|---|---|
| Toolbar grid | `grid-cols-2 gap-3 lg:grid-cols-4` (gap 12px) |
| Analysis grids | `grid gap-4 lg:grid-cols-2` (16px gap, 2-across ≥lg) |
| KPI grid | `grid-cols-2 lg:grid-cols-4`, no gap (hairline dividers instead) |
| Full-width widgets | KPI strip, Insight, Daftar Transaksi |
| Half-width widgets | 6 analysis cards (3 pairs) |

### 13.3 Card internals
| Item | Value |
|---|---|
| Card padding | `p-4 sm:p-5` (16/20px); KPI/Debts cells `p-4 sm:p-5`; Insight body `p-5 sm:p-6` |
| CardHeader margin | `mb-4` (16px) |
| KPI cell internals | label row, `mt-2` value, `mt-0.5` context |
| List gaps | BarBreakdown `gap-3.5` (14px); Merchant `gap-3` (12px); bills/transactions rows `py-3` (12px) |
| Icon–text gap | `gap-1.5` (6px) in KPI/Insight label rows |
| Insight internals | `mt-3` title, `mt-1.5` summary, `mt-3` expand, `space-y-2.5` explanation, `py-4` footer |
| Footer note | `py-2` (8px) |

### 13.4 Component gaps
`gap-2` (8px) = Badge next to bill title, toolbar buttons; `gap-3` (12px) = icon↔identity, footer rows.

---

## 14. RADIUS

| Token | Value | Usage |
|---|---|---|
| `rounded-lg` | 8px | icon chips (KPI `h-6 w-6`, CardHeader `h-8 w-8`), progress track |
| `rounded-xl` | 12px | buttons, inputs, selects, bill day tiles, back button, insight explanation block |
| `rounded-2xl` | 16px (`--radius-card`) | **all cards** |
| `rounded-full` | 999px (`--radius-chip`) | badges, insight sparkle chip, progress fill |

---

## 15. SHADOWS

| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)` | all widgets |
| `--shadow-card-hover` | `0 2px 4px rgb(15 23 42 / 0.06), 0 16px 40px -16px rgb(30 58 138 / 0.22)` | interactive cards only (not used in report content area) |
| `shadow-sm` | Tailwind default | buttons, logo mark |
| `shadow-xl` | Tailwind default | modal (not used in report content area) |

**Elevation model:** flat + border + single soft elevation. Insight card uses background gradient, not shadow.

---

## 16. BORDERS

| Token | Width | Color | Usage |
|---|---|---|---|
| Card border | 1px | `slate-200/80` / `slate-800` | all cards, inputs, selects |
| Hairline divider | 1px | `slate-100` / `slate-800` | `divide-y`, `border-b` (group/list headers), KPI cell `border-l`/`border-t`, Debts footer `border-t` |
| Insight border | 1px | `brand-200/70` / `brand-900` | insight card; `border-brand-100`/`brand-900` on explanation |
| Row border | 1px | `slate-100` / `slate-800` | Daftar Transaksi `border-b … last:border-0` |
| Button borders | 1px | `slate-200` / `slate-700` (secondary) | toolbar buttons |

---

## 17. ICON SYSTEM

| Property | Value |
|---|---|
| Library | `@phosphor-icons/react` v2 (single family) |
| Weights | `duotone` for widget headers + KPI chips + Insight bullets; `bold` for row/back/mobile-nav/buttons; default for tertiary |
| Sizes | 13 (filter footer icon on Transaksi), 14 (KPI chips, Insight chevron, footer CalendarDots), 15 (Insight Sparkle/Lightbulb/ListChecks), 16 (CardHeader icons, ghost buttons, search, reset), 18 (secondary buttons, TransactionRow type icons, back? no back is 20), 20 (back arrow), 24 (empty state), 28 (error state) |
| Icon chips | KPI/CardHeader: `h-6 w-6`/`h-8 w-8` `rounded-lg` `bg-brand-50 text-brand-600` (+dark `bg-brand-950 text-brand-300`); semantic chips rose/emerald variants; Insight: `h-7 w-7 rounded-full bg-brand-600 text-white` |
| Icons used on this page | `ArrowLeft`, `DownloadSimple`, `MagnifyingGlass`, `ArrowClockwise`, `ArrowUpRight`, `ArrowDownRight`, `TrendUp`, `TrendDown`, `Receipt`, `Repeat`, `HandCoins`, `ChartBar`, `Wallet`, `Storefront`, `CalendarDots`, `Sparkle`, `Lightbulb`, `ListChecks`, `CaretRight`, `CaretDown`, `Plus` (referenced) |

---

## 18. STATES

| State | Where | Visual |
|---|---|---|
| Default | cards | `bg-white border shadow-card` |
| Hover | TransactionRow | `hover:bg-slate-50 dark:hover:bg-slate-800/60` |
| Active/press | buttons | `active:-translate-y-px active:scale-[0.98]`; `bg-brand-800` (primary), `bg-slate-100` (secondary) |
| Focus-visible | buttons | `focus-visible:outline-2 outline-offset-2`, `outline-brand-700`/`slate-400` |
| Focus | inputs/selects | `focus:border-brand-500 focus:ring-2 focus:ring-brand-500/60`, `focus:outline-none` |
| Disabled | buttons | `cursor-not-allowed opacity-50` |
| Loading (list) | whole body | `LoadingState rows={6}` inside `Card p-5`; skeletons `animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800` (40px icon + 2 bars per row) |
| Loading (KPI) | — | not separate; whole page body loads |
| Empty | per-widget | `EmptyState` centered `py-10`, icon chip `h-12 w-12 rounded-2xl bg-slate-100 text-slate-400`, title `text-sm font-semibold`, desc `max-w-[30ch] text-xs` |
| No-result | Daftar Transaksi | `EmptyState` "Tidak ada transaksi" |
| Error | whole body | `ErrorState` `min-h-[40dvh]` centered, rose `h-14 w-14 rounded-2xl` chip `WarningCircle 28 duotone`, title + `max-w-[36ch]` msg, retry secondary button `ArrowsClockwise 18` |
| Expanded | insight explanation | in-place `dl` reveal; chevron `rotate-180` (`transition-transform duration-200`) |

---

## 19. RESPONSIVE SYSTEM

Breakpoints used: `sm` 640, `lg` 1024.

### 19.1 Desktop (`lg+`)
| Aspect | Behavior |
|---|---|
| Shell | sidebar `w-64`; content `px-8 pt-8 pb-10` |
| Toolbar | 4 controls in a row (`lg:grid-cols-4`); search row full width |
| KPI | 4-across (`lg:grid-cols-4`), vertical hairline dividers, `sm:text-2xl` values |
| Analysis | 3 grids of 2-across (`lg:grid-cols-2`) |
| Transaction list | full-width hairline rows |

### 19.2 Tablet (`sm–lg`)
| Aspect | Behavior |
|---|---|
| Shell | no sidebar; mobile header + bottom nav; `px-6 pt-5 pb-28` |
| Toolbar | 4 controls in a row from `sm` (`sm:grid-cols-4`) — actually `grid-cols-2` until `lg`, so tablet = 2×2 |
| KPI | 2×2 (`grid-cols-2` until lg) |
| Analysis | single column (grids are `lg:grid-cols-2`) |
| Insight | `p-5 sm:p-6` |

### 19.3 Mobile (`< sm`)
| Aspect | Behavior |
|---|---|
| Shell | mobile header `h-16` sticky; bottom nav fixed; content `px-4 pt-5 pb-28` |
| Toolbar | 2×2 controls (`grid-cols-2`): Dari/Sampai, then Tipe/Kategori; search row stays flex (search flexes, buttons `shrink-0`) |
| KPI | 2×2 with L-shaped hairline dividers (`border-l` right col + `border-t` bottom row) |
| Analysis | all widgets stack vertically |
| Amounts | `text-xl` (KPI) / `text-sm` (lists); `truncate` on all identity + amounts |
| Insight | eyebrow/title/body stack; explanation block full width |

**Overflow behavior:** all text in list rows and KPI cells uses `truncate`; right columns are `shrink-0`. No horizontal scroll introduced.

---

## 20. REUSABLE COMPONENTS

| Component | Source | Structure / tokens | Variants | Responsive |
|---|---|---|---|---|
| `PageHeader` | `ui/PageHeader` | `mb-5 flex items-end justify-between gap-4`; h1 `text-2xl font-bold tracking-tight`; p `mt-1 text-sm text-slate-500`; `action?` | — | action always visible on Laporan |
| `Card` | `ui/Card` | `rounded-2xl border bg-white shadow-card p-4 sm:p-5`; props `interactive`, `padded` | interactive (hover shadow + press) | `p-4 sm:p-5` |
| `CardHeader` | `ui/Card` | `mb-4 flex items-start justify-between gap-3`; icon chip `h-8 w-8 rounded-lg bg-brand-50 text-brand-600`; title `text-sm font-semibold`; subtitle `text-xs text-slate-500` | — | — |
| `Input` | `ui/Input` | label `text-sm font-medium`; `h-11 rounded-xl border`; `leadingIcon` (left-3, pl-10); `error`/`helper` | leading-icon, error, helper | full width |
| `Select` | `ui/Select` | label; `h-11 rounded-xl appearance-none px-3 pr-9`; `.select-chevron`; error | error | full width |
| `Button` | `ui/Button` | variants primary/secondary/ghost/danger; sizes sm/md/lg; `rounded-xl font-semibold`; `leadingIcon`; `loading`; `fullWidth` | 4×3 | fullWidth opt |
| `Badge` | `ui/Badge` | `min-h-6 rounded-full px-2.5 py-0.5 text-xs font-semibold` | default/income/expense/warning/danger/neutral | — |
| `Progress` | `ui/Progress` | `h-1.5 rounded-full` track `slate-100`; fill tone + `duration-500` | brand/emerald/amber/rose/slate | `w-full` / custom `flex-1` |
| `StatCell` (KPI cell) | ReportsPage | label + `h-6 w-6` chip + `text-xl sm:text-2xl font-bold tracking-tight tabular-nums` + context | income/expense/net/neutral | cell dividers 2×2 → 4 |
| `BarBreakdown` | ReportsPage | CardHeader + label/amount/% + Progress | Kategori/Dompet | half → full |
| `BudgetComparisonCard` | ReportsPage | label + Badge % + spent/budget + status + tone Progress | aman/waspada/lebih | half → full |
| `MerchantCard` | ReportsPage | merchant + count + amount + % (loose list) | — | half → full |
| `BillsCard` | ReportsPage | day tile + title/badge + meta + progress + amount/due (hairline list) | installment/recurring | half → full |
| `DebtsCard` | ReportsPage | 2-cell KPI strip (Hutang rose / Piutang emerald) + footer | — | always 2-col |
| `AiInsightCard` | dashboard/`AiInsightCard` | brand gradient + eyebrow + title + summary + expandable explanation + recommendation footer | — | full width |
| `EmptyState` / `LoadingState` / `Skeleton` / `ErrorState` | `ui/*` | see §18 | — | — |
| `TransactionRow` | transactions/`TransactionRow` | reused for Daftar Transaksi | income/expense | full width |

---

## 21. DESIGN TOKENS (consolidated)

### Colors
| Group | Light | Dark |
|---|---|---|
| background | `slate-50` `#f8fafc` | `slate-950` `#020617` |
| surface | `white` | `slate-900` |
| surface-muted | `slate-100` / `brand-50` | `slate-800` / `brand-950` |
| text-primary | `slate-900`/`slate-800` | `white`/`slate-200` |
| text-secondary | `slate-700`/`slate-500` | `slate-300`/`slate-400` |
| text-muted | `slate-400` | `slate-500` |
| border | `slate-200/80` | `slate-800` |
| divider | `slate-100` | `slate-800` |
| accent | `brand-600` `#2563eb` | `brand-400` `#60a5fa` |
| income | `emerald-600` `#059669` | `emerald-400` `#34d399` |
| expense | `rose-600` `#e11d48` | `rose-400` `#fb7185` |
| warning | `amber-600`/`amber-500` | `amber-400`/`amber-500` |
| danger | `rose-600`/`rose-500` | `rose-400` |
| info | `brand-600`/`brand-500` | `brand-400` |

### Typography
| Token | Value |
|---|---|
| Font | `Plus Jakarta Sans Variable` + system fallbacks |
| Sizes | 11px, 12px (`text-xs`), 14px (`text-sm`), 16px (`text-base`), 20–24px (`text-xl`/`text-2xl`), 24px page title |
| Weights | 400/500/600/700 |
| Tracking | `tracking-tight` (titles + display numbers), `tracking-[0.14em]` uppercase (insight labels) |
| Line-height | default; `leading-relaxed` (insight body, empty desc) |

### Spacing
| Token | Value |
|---|---|
| xs | 2px (`gap-0.5`) |
| sm | 6px (`gap-1.5`) |
| md | 8px (`gap-2`) / 12px (`gap-3`) |
| lg | 16px (`gap-4`/`p-4`) / 20px (`p-5`/`mb-5`) |
| xl | 24px (`sm:p-6`) |
| 2xl | 32–40px (`pt-8`, `py-10`) |

### Radius
| Token | Value |
|---|---|
| sm | 8px (`rounded-lg`) |
| md | 12px (`rounded-xl`) |
| lg | 16px (`rounded-2xl`, `--radius-card`) |
| pill | 999px (`rounded-full`, `--radius-chip`) |

### Shadows
| Token | Value |
|---|---|
| card | `0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)` |
| card-hover | `0 2px 4px rgb(15 23 42 / 0.06), 0 16px 40px -16px rgb(30 58 138 / 0.22)` |
| sm | Tailwind default (buttons) |

### Dimensions
| Token | Value |
|---|---|
| Control height | 44px (`h-11`) |
| KPI icon chip | 24px (`h-6 w-6`) |
| CardHeader icon chip | 32px (`h-8 w-8`) |
| Bill day tile | 40px (`h-10 w-10`) |
| Card padding | 16/20px (`p-4 sm:p-5`), insight `p-5 sm:p-6` |
| Row min-height | 56px (`min-h-14`) |
| Icon sizes | 14/15/16/18/20/24/28 |

---

## 22. GENERIC REPORT TEMPLATE

Blueprint for Catatin v3.

```
Report Page
├─ Back button          h-10 w-10 rounded-xl icon button, mb-4
├─ PageHeader           title (text-2xl bold tracking-tight) + subtitle (text-sm) + action right
├─ Filter Card          mb-4 rounded-2xl p-4
│  ├─ 4 controls grid   grid-cols-2 lg:grid-cols-4 gap-3 (dates + selects)
│  └─ search row        mt-3 flex gap-2 (Input flex-1 + Cari secondary + Atur ulang ghost)
├─ KPI Strip Card       padded=false, grid-cols-2 lg:grid-cols-4, hairline dividers
│  └─ StatCell          label + chip + text-xl sm:text-2xl bold tracking-tight tabular + context
├─ Insight Card         brand gradient, eyebrow, title, body, expand, recommendation footer
├─ Analysis grid(s)     grid gap-4 lg:grid-cols-2
│  └─ Widget Card       CardHeader + content
├─ Transaction list     Card + hairline rows (TransactionRow)
└─ Footer note          text-xs centered, py-2
```

| Level | Component | Sizing | Spacing | Responsive |
|---|---|---|---|---|
| Header | `PageHeader` | — | `mb-5` | action persists |
| Toolbar | Filter Card | 4 controls `h-11` | `p-4`, `gap-3`, `mt-3` | 2×2 → 4-col |
| KPI | KPI Strip | cells `p-4 sm:p-5`, values `text-xl sm:text-2xl` | `mt-2` value | 2×2 → 4-col |
| Insight | AiInsightCard | `p-5 sm:p-6` | `mt-3`/`mt-1.5` | full width |
| Analysis | Widget cards | half (`lg`) / full | `gap-4` | stack → 2-col |
| Transaction | TransactionRow | `min-h-14` | `px-4 py-3` | full width |

---

## 23. CATATIN V2 → V3 TRANSLATION

### COPY DIRECTLY
- Layout principles: single column `max-w-5xl`, full-width KPI + Insight + list, 2-across analysis grids, `gap-4` rhythm, fixed widget ordering.
- Grid: `grid-cols-2 lg:grid-cols-4` KPI + toolbar; `grid gap-4 lg:grid-cols-2` analysis; hairline-divided KPI cells.
- Spacing: `p-4 sm:p-5` cards, `p-5 sm:p-6` insight, `mt-2`/`mt-1.5` KPI internals, `py-3` list rows, `py-4` footers.
- Typography hierarchy: page `text-2xl bold tracking-tight`, widgets `text-sm font-semibold`, values `text-sm font-semibold tabular-nums`, KPI `text-xl sm:text-2xl bold tracking-tight`, metadata `text-xs`.
- Card construction: `rounded-2xl border bg-white shadow-card`, `CardHeader` with `h-8 w-8` brand chip.
- Chart style: CSS `Progress` bars (`h-1.5 rounded-full`, tone fills, 500ms transition), single brand series; budget tone mapping rose/amber/emerald.
- List/table style: hairline `divide-y` for bills + transactions; loose `gap-3` for merchant ranking; right-aligned amounts + fixed `w-9` percent.
- Icon treatment: Phosphor, `duotone` headers/chips, `bold` rows/actions; semantic income/expense arrows.
- Responsive patterns: 2×2→4-col KPI, 1-col→2-col analysis, toolbar 2×2→4-col, `truncate` everywhere.
- Borders/radius/shadows: hairline `slate-100`; `rounded-xl` controls, `rounded-2xl` cards; `shadow-card` only.

### ADAPT (Catatin v3-specific)
- Brand colors: re-map `--color-brand-*` (keep 50–950 scale + usage roles: headers, chips, progress series, focus).
- Semantic colors: keep emerald/rose/amber roles; decide v3 mapping (e.g., expense neutral-slate in lists, rose for danger only).
- Font: keep a grotesk with `tabular-nums`; swap `Plus Jakarta Sans` only if v3 brand specifies.
- Insight card: v3 content-specific eyebrow labels; keep the single-gradient + footer-strip structure.
- New report widgets: charts, per-category series colors, pagination/load-more (v2 has none) — build on the `Card + CardHeader + Progress/list` pattern.
- Content-specific styling: budget tone text ("lebih {diff}", "mendekati batas", "aman"), bill badges, debt KPI cells.

### DO NOT COPY
- Business logic, calculations (`buildReport`, breakdowns, insight generation), API/data, backend, state management, routing, CSV export logic, obsolete functionality.

---

## 24. IMPLEMENTATION CHECKLIST

### Page structure
- [ ] `AppShell` container `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 lg:pt-8 pb-28 lg:pb-10`
- [ ] Order: back → PageHeader → Filter Card → loading/error/content
- [ ] `ReportContent` = `flex flex-col gap-4`

### Header
- [ ] Back button `mb-4 h-10 w-10 rounded-xl` `ArrowLeft 20`
- [ ] `PageHeader` title `text-2xl font-bold tracking-tight` + subtitle `text-sm` + action secondary button
- [ ] Ekspor CSV button conditional on ready + non-empty

### Date/filter controls
- [ ] Filter Card `mb-4 rounded-2xl p-4`
- [ ] `grid grid-cols-2 gap-3 lg:grid-cols-4`: 2 date `Input` + 2 `Select` (labeled, `h-11 rounded-xl`)
- [ ] Search row `mt-3 flex gap-2`: search Input `flex-1` + `Cari` secondary + `Atur ulang` ghost
- [ ] Focus ring `border-brand-500 ring-brand-500/60`

### KPI cards
- [ ] KPI Strip `Card padded={false}` `grid grid-cols-2 lg:grid-cols-4`
- [ ] Cells `p-4 sm:p-5` with hairline `border-l`/`border-t` (L-shape mobile, vertical desktop)
- [ ] Per cell: `h-6 w-6` icon chip + label `text-xs` + value `text-xl sm:text-2xl font-bold tracking-tight tabular-nums` + context `text-[11px]`
- [ ] Semantic colors: income emerald, expense rose, net dynamic, average neutral

### Insight
- [ ] Gradient card `from-brand-50 to-white` + `border-brand-200/70`, `overflow-hidden`
- [ ] Eyebrow `text-xs font-bold uppercase tracking-[0.14em]` + `Sparkle` round chip
- [ ] Title `text-base font-bold` + body `text-sm leading-relaxed`
- [ ] Expand button (brand) + explanation `dl rounded-xl border bg-white p-4`
- [ ] Recommendation footer `border-t` with `ListChecks` label

### Charts
- [ ] `Progress` track `h-1.5 rounded-full bg-slate-100`, fill tone, `duration-500`
- [ ] BarBreakdown: label + amount + `w-9` percent + `Progress brand mt-1.5`
- [ ] Budget: Badge %, `{spent} dari {budget}`, status text, tone bar

### Analysis widgets
- [ ] 3× `grid gap-4 lg:grid-cols-2` pairs: Kategori/Dompet, Budget/Merchant, Tagihan/Hutang
- [ ] Widget = `Card` + `CardHeader` (icon `h-8 w-8 rounded-lg bg-brand-50`)
- [ ] Bills: day tile `h-10 w-10` + title/badge + meta + progress + amount/due, hairline list
- [ ] Debts: 2-cell hairline KPI strip (Hutang rose / Piutang emerald) + `border-t` footer

### Lists/tables
- [ ] Daftar Transaksi full-width Card, hairline `divide-y`, `TransactionRow` (`min-h-14`, icon chip 40px, truncate, tabular amounts, `CaretRight`)
- [ ] Right-aligned amounts; `shrink-0` right columns; `truncate` on identity

### Typography/colors/spacing/grid/radius/shadows/borders/icons
- [ ] Font `Plus Jakarta Sans`; `tabular-nums` on all amounts; `tracking-tight` on display numbers
- [ ] Semantic tokens (brand-600/emerald-600/rose-600/amber); `slate-200/80` borders, `slate-100` dividers
- [ ] Spacing scale `gap-3/gap-4/p-4 sm:p-5/mt-2/mt-1.5/py-3`
- [ ] Radius `rounded-xl` controls, `rounded-2xl` cards, `rounded-full` badges
- [ ] Shadows `shadow-card` (only)
- [ ] Phosphor icons, duotone headers, bold rows

### States
- [ ] Loading `LoadingState rows=6` in Card
- [ ] Per-widget `EmptyState`; Daftar Transaksi no-result EmptyState
- [ ] Error `ErrorState` `min-h-[40dvh]` + retry
- [ ] Hover/active/focus-visible/disabled per Button/Input conventions; `prefers-reduced-motion`

### Responsive
- [ ] Mobile (<sm): `px-4`, toolbar 2×2, KPI 2×2 hairline, widgets stacked
- [ ] Tablet (sm–lg): 2×2 toolbar + KPI, `px-6`
- [ ] Desktop (lg): `px-8 pt-8`, toolbar + KPI 4-across, analysis 2-across

### Reusable components / tokens
- [ ] Components: PageHeader, Card/CardHeader, Input, Select, Button, Badge, Progress, StatCell, BarBreakdown, BudgetComparisonCard, MerchantCard, BillsCard, DebtsCard, AiInsightCard, EmptyState, LoadingState/Skeleton, ErrorState, TransactionRow
- [ ] Tokens: `--color-brand-*`, `--shadow-card`, `--shadow-card-hover`, `--radius-card`, `--radius-chip`

---

*End of specification. Values are extracted verbatim from Catatin v2 source; items marked absent (SVG charts, pagination, per-category series colors) are intentionally omitted because they do not exist in v2.*
