# CATATIN V2 — TRANSACTION CONTENT AREA DESIGN SPECIFICATION

Extracted from the live Catatin v2 source (`src/features/transactions/**`, `src/components/ui/**`, `src/components/layout/**`). This document is the implementation-ready visual contract for the Catatin v3 **Transaction content area**. It covers visuals only — no business logic, data, state, routing, or shell.

> **Source stack:** React 19 + TypeScript, Tailwind CSS v4 (CSS-first `@theme` tokens), `@phosphor-icons/react` v2, `Plus Jakarta Sans Variable`. Dark mode is a `.dark` class variant (`@custom-variant dark`).

---

## 1. EXECUTIVE SUMMARY

- The transaction content area is **card-based, border-plus-soft-shadow, flat 2D** with hairline dividers. Elevation is expressed through a single reusable card token (`shadow-card`) rather than layered depth.
- Visual language is **calm, financial, "trust-first"**: near-monochrome slate neutrals, one blue brand accent, emerald (income/positive) and rose (expense/danger) used *only* as semantics.
- Layout is a **centered single column** (`max-w-5xl`). Desktop = multi-column filter grid + grouped card sections; mobile = stacked cards, full-bleed row list, bottom-sheet modal.
- Hierarchy is controlled by **weight + color, not raw scale**: amounts are `font-semibold/bold`, muted metadata is `text-xs text-slate-500`.
- Everything is **reusable**: `PageHeader`, `Card`/`CardHeader`, `Input`, `Select`, `Button`, `Badge`, `EmptyState`, `LoadingState`/`Skeleton`, `ErrorState`, `Modal`, plus transaction-specific `TransactionList`, `TransactionRow`, `TransactionFilters`.
- **Shape consistency lock:** cards = `rounded-2xl` (16px), small controls/icon chips = `rounded-xl` (12px), tiny icon chips = `rounded-lg` (8px), badges/avatar = pill (`rounded-full`), buttons = `rounded-xl` (12px).
- **Density:** medium-high for a finance ledger (compact 56px rows, `text-sm`/`text-xs` type), but airy at the page level (`gap-4` sections, `mb-5` header).

---

## 2. VISUAL PRINCIPLES

1. **One card surface, one elevation.** Cards are `bg-white + border-slate-200/80 + shadow-card`. Never mix two different card elevations in the content area. Hover uses `shadow-card-hover` only on *interactive* cards/links (e.g. AddActionPage option cards), not on list rows.
2. **Hairline dividers, not heavy borders.** Lists separate with `divide-y divide-slate-100` (1px, 8% slate). Groups separate from their header with `border-b border-slate-100`.
3. **Semantic color discipline.** Emerald = income/positive only; rose = expense/danger/errors only; blue (`brand`) = interactive/brand identity. Neutral slate carries 90% of the UI.
4. **Weight-led hierarchy.** Primary identity = `font-medium` (row title) / `font-semibold` (amount, group net); secondary = `text-xs text-slate-500`; tertiary = `text-xs text-slate-400`.
5. **Numbers are always tabular.** Every amount uses `tabular-nums`; large display amounts add `tracking-tight`. Signed amounts always carry an explicit `+`/`-` prefix.
6. **Two breakpoint behaviors are first-class citizens:** mobile (`< sm`) stacks the filter grid to 1 column, hides the header action button (moved to the bottom nav FAB), and renders the modal as a bottom sheet; `lg+` shows the fixed sidebar and 3-column filters.
7. **Reduced motion respected.** Global `prefers-reduced-motion` override collapses all animation/transition durations to ~0.01ms.

---

## 3. CONTENT AREA STRUCTURE

Page: `/transaksi` (`TransactionsPage.tsx`). Rendered inside `AppShell` main container.

```
AppShell main
└─ div (flex flex-col)                     TransactionsPage
   ├─ PageHeader                            title + subtitle + action (Tambah)
   ├─ TransactionFilters (Card)             search + type/category/date filters + footer
   └─ Body (one of three states):
      ├─ loading  → Card > LoadingState (rows=6)
      ├─ error    → ErrorState
      └─ ready    → TransactionList
          └─ flex flex-col gap-4
              └─ Group section (Card) ×N
                  ├─ header (label + net)   ← border-b hairline
                  └─ ul divide-y             TransactionRow ×M
```

| Level | Component | Layout | Container |
|---|---|---|---|
| Page | `TransactionsPage` | vertical stack, no wrapper card | — |
| Header | `PageHeader` | `mb-5 flex items-end justify-between gap-4` | — |
| Filters | `TransactionFilters` | `mb-4 rounded-2xl … p-4` | Card |
| Body states | `LoadingState`/`ErrorState`/`TransactionList` | stacked under filters | Card (loading/empty) or bare (list) |
| List | `TransactionList` | `flex flex-col gap-4` | — |
| Group | `section` | `overflow-hidden rounded-2xl …` | Card |
| Row | `TransactionRow` | `flex min-h-14 items-center gap-3 px-4 py-3` | `li` |

**Container (AppShell, context):** `mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8`. `pb-28` reserves space for the fixed mobile bottom nav; `pt-5` clears the sticky mobile header.

---

## 4. HEADER

Source: `PageHeader.tsx` + usage in `TransactionsPage.tsx`. It **is** a reusable page-header pattern (also used on Laporan/others).

**Structure**

```
div (mb-5 flex items-end justify-between gap-4)
├─ div
│  ├─ h1   "Transaksi"
│  └─ p    subtitle (dynamic)
└─ action  → <Link to="/transaksi/baru" className="hidden sm:block">
              <Button size="md" leadingIcon={<Plus size={18} weight="bold" />}>Tambah</Button>
            </Link>
```

| Property | Value |
|---|---|
| Wrapper | `mb-5`, `flex`, `items-end`, `justify-between`, `gap-4` |
| Title | `text-2xl font-bold tracking-tight text-slate-900 dark:text-white` |
| Subtitle | `mt-1 text-sm text-slate-500 dark:text-slate-400` (dynamic: `{count} transaksi ditemukan` or default copy) |
| Action | right-aligned; **hidden below `sm`** (`hidden sm:block`) — mobile uses the bottom-nav FAB instead |
| Header height (approx) | title 32px + mt-1 4px + subtitle 20px ≈ 56px + mb-5 20px |

**Responsive:** Title stays `text-2xl` on all breakpoints. Action button only exists ≥ `sm`. No stacking occurs because action is hidden on mobile.

---

## 5. SEARCH & FILTER TOOLBAR

Source: `TransactionFilters.tsx`. Enclosed in one Card (`mb-4 rounded-2xl border … p-4`).

**Structure**

```
Card
├─ Search input (relative, leading MagnifyingGlass icon)
├─ grid gap-3 mt-3   grid-cols-1 → sm:grid-cols-3
│  ├─ Select  "Tipe"        (Semua tipe / Pemasukan / Pengeluaran)
│  ├─ Select  "Kategori"    (Semua kategori + list)
│  └─ div grid-cols-2 gap-3  → Input date "Dari" + Input date "Sampai"
└─ Footer (mt-3 flex items-center justify-between)
   ├─ Funnel icon + status text ("Filter aktif" / "Tanpa filter")
   └─ Reset filter button (disabled when no filters)
```

### 5.1 Search field

| Property | Value |
|---|---|
| Type | text input, `type="search"`, `role="searchbox"`, aria-label "Cari transaksi" |
| Placeholder | `Cari merchant atau deskripsi` |
| Height / width | `h-11` (44px) / `w-full` |
| Padding | `pl-10 pr-3` (40px left for icon) |
| Typography | `text-sm` text, `placeholder:text-slate-400` |
| Background / border | `bg-white border border-slate-200` → dark `bg-slate-900 border-slate-700` |
| Radius | `rounded-xl` (12px) |
| Leading icon | `MagnifyingGlass size={18}`, `absolute left-3 top-1/2 -translate-y-1/2`, `text-slate-400 dark:text-slate-500`, `pointer-events-none` |
| Focus | `focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/60` |
| Transition | `transition-colors` |
| Debounce | 300ms (visual behavior: value updates on input, query applies after debounce) |

### 5.2 Select controls (Tipe, Kategori)

| Property | Value |
|---|---|
| Type | native `<select>`, `appearance-none`, chevron via background SVG |
| Label | above, `text-sm font-medium text-slate-700 dark:text-slate-300`; wrapper `flex flex-col gap-1.5` |
| Height / width | `h-11` (44px) / `w-full` |
| Padding | `px-3 pr-9` (right 36px for chevron) |
| Typography | `text-sm text-slate-900 dark:text-white` |
| Radius | `rounded-xl` |
| Chevron | utility `.select-chevron`: inline SVG chevron-down, `16px`, color `#64748b` (slate-500), `background-position: right 0.75rem center`, `no-repeat` |
| Focus | `focus:border-brand-500 focus:ring-2 focus:ring-brand-500/60` |
| Grid | `grid grid-cols-1 gap-3 sm:grid-cols-3` |

### 5.3 Date range (Dari / Sampai)

| Property | Value |
|---|---|
| Type | `Input` `type="date"`, labeled |
| Group layout | `grid grid-cols-2 gap-3` (two equal date fields side by side even on mobile) |
| Height / radius | `h-11` / `rounded-xl` |
| Labels | "Dari", "Sampai", `text-sm font-medium` |

### 5.4 Filter footer

| Element | Value |
|---|---|
| Status row | `flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500`; icon `Funnel size={13} weight="duotone"` |
| Reset button | inline, `text-xs font-semibold`, `text-brand-600 hover:text-brand-700 dark:text-brand-400`, leading `X size={13} weight="bold"` |
| Reset disabled | `cursor-not-allowed text-slate-300 dark:text-slate-600`, `disabled={!hasFilters}` |

**Filter identification:** controls are **select dropdowns** (native) + **labeled date inputs** — no pills/chips/tabs/segmented in the transaction *list* filter bar. (Segmented type control exists only in the create form, see §16.)

**Responsive:** `grid-cols-1` mobile → `sm:grid-cols-3` desktop. Date pair remains 2-col at all sizes.

---

## 6. TRANSACTION LIST / TABLE

Source: `TransactionList.tsx`. **Type: hybrid list-of-cards (not a table).** Transactions are grouped by day; each day = one card section containing a stacked list.

| Property | Value |
|---|---|
| List wrapper | `flex flex-col gap-4` (24px between day sections) |
| Group container | `overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900` |
| Row container | `<ul class="divide-y divide-slate-100 dark:divide-slate-800">`, each row `<li>` |
| Group header | `flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800` |
| Density | row min-height 56px (`min-h-14`), `px-4 py-3` (48px/16px → 48px/12px) |
| Columns | none (flex layout, no table semantics) |
| Alignment | icon left, identity fills, amount+date right, chevron far right |
| Background | white; hover `hover:bg-slate-50 dark:hover:bg-slate-800/60` on each row |
| Empty | `Card` + `EmptyState` (icon MagnifyingGlass) |
| Grouping rule | by `occurred_at` date label, net sum shown in header |

**Responsive:** identical on mobile & desktop (rows already compact); the only change is horizontal budget (px-4 at all sizes). No desktop-specific column addition.

---

## 7. TRANSACTION GROUP (day header)

| Property | Value |
|---|---|
| Header row | `flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800` |
| Label | `text-sm font-semibold text-slate-700 dark:text-slate-300` (date, e.g. "20 Agu") |
| Net value | `text-xs font-semibold tabular-nums`; `+` net → `text-emerald-600 dark:text-emerald-400`; `-`/neutral → `text-slate-500 dark:text-slate-400`; prefix `+`/`-` |
| Divider | bottom hairline `border-slate-100` (1px) separates header from rows |
| Relationship | header is inside the same card; rows below in `divide-y` |
| Spacing | header `py-2.5` (10px vertical), row content begins immediately after divider |

---

## 8. TRANSACTION ROW

Source: `TransactionRow.tsx`. Full row is a `<Link>` to `/transaksi/:id`.

```
Link (flex min-h-14 items-center gap-3 px-4 py-3 …)
├─ Icon chip        h-10 w-10 rounded-xl (semantic bg)
├─ Identity         min-w-0 flex-1
│  ├─ merchant      text-sm font-medium (truncate)
│  └─ meta          text-xs (category · wallet)  (truncate)
└─ Amount block     flex shrink-0 items-center gap-1.5
   ├─ column items-end gap-0.5
   │  ├─ amount     text-sm font-semibold tabular-nums (±Rp…)
   │  └─ date       text-xs
   └─ CaretRight    size 14 (affordance)
```

| Region | Property | Value |
|---|---|---|
| Row | layout | `flex items-center gap-3 px-4 py-3`; min-height `min-h-14` (56px) |
| Row | hover | `hover:bg-slate-50 dark:hover:bg-slate-800/60` |
| Row | active | `active:bg-slate-100 dark:active:…` (same tint, one step darker) |
| Row | transition | `transition-colors` |
| Icon chip | container | `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl` |
| Icon chip | income | `bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400` |
| Icon chip | expense | `bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400` |
| Icon chip | icon | `ArrowUpRight`/`ArrowDownRight`, `size={18}`, `weight="bold"` |
| Merchant | text | `truncate text-sm font-medium text-slate-800 dark:text-slate-200` |
| Meta | text | `truncate text-xs text-slate-500 dark:text-slate-400`; format `{category} · {wallet}` (row) / `{category} · {wallet}` (dashboard) |
| Amount | text | `text-sm font-semibold tabular-nums`; income `text-emerald-600 dark:text-emerald-400`, expense `text-slate-900 dark:text-white`; prefix `+`/`-` |
| Date | text | `text-xs text-slate-400 dark:text-slate-500`, `formatDate()` (`id-ID` numeric day + short month, tz Asia/Jakarta) |
| Chevron | icon | `CaretRight size={14}`, `text-slate-300 dark:text-slate-600` |

**Column gaps:** icon↔identity `gap-3` (12px), identity↔amount via flex spacer, amount↔chevron `gap-1.5` (6px), amount↔date within column `gap-0.5` (2px).

---

## 9. AMOUNT SYSTEM

| Context | Font | Weight | Tracking | Color | Sign |
|---|---|---|---|---|---|
| Row amount | `text-sm` | `font-semibold` | — | income `emerald-600`/`emerald-400`; expense `slate-900`/`white` | `+` / `-` prefix |
| Group net | `text-xs` | `font-semibold` | — | ≥0 `emerald-600`/`emerald-400`; <0 `slate-500`/`slate-400` | `+` / `-` prefix |
| Detail hero amount | `text-4xl` | `font-bold` | `tracking-tight` | income `emerald-600`/`emerald-400`; expense `slate-900`/`white` | `+` / `-` prefix |
| Receipt item total | `text-sm` | `font-medium` | — | `slate-900`/`white` | none |
| Receipt grand total | `text-sm` | `font-semibold` | — | `slate-900`/`white` | none |

- **Currency treatment:** all amounts through `formatCurrency()` = `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })` → `"Rp 12.000"` (no decimals). Rendered with `tabular-nums`.
- **Emphasis rule:** amounts are the *second* strongest element per row (after merchant identity) and the *strongest* on the detail hero. Expense amounts stay neutral slate — **rose is reserved for danger/errors, not expenses** in the list.
- **Pending/neutral/transfer:** not present in the current list UI (no pending/transfer styling exists).

---

## 10. ICON SYSTEM

| Property | Value |
|---|---|
| Library | `@phosphor-icons/react` v2 (single family, no mixing) |
| Family/weight | mixed by role: **`bold`** for row/action icons & nav, **`duotone`** for decorative/section icons (CardHeader, empty/error state), default weight for tertiary icons |
| Sizes | 14 (chevron, row accents), 15 (detail merchant icon), 16 (CardHeader, ghost buttons, small), 18 (row type icon, button leading icons, search, filter icons), 20 (nav, back, modal close, back arrow), 22 (warning modal, mobile nav), 24 (empty state, form upload, add-page tiles), 26 (FAB), 28 (error state) |
| Icon chips | income: `h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600`; expense: `bg-slate-100 text-slate-500`; section header: `h-8 w-8 rounded-lg bg-brand-50 text-brand-600`; empty: `h-12 w-12 rounded-2xl bg-slate-100 text-slate-400`; error: `h-14 w-14 rounded-2xl bg-rose-50 text-rose-500`; danger modal: `h-10 w-10 rounded-xl bg-rose-50 text-rose-500`; add tiles: `h-12 w-12 rounded-2xl bg-brand-50 text-brand-600` |
| Recurring patterns | ArrowUpRight/ArrowDownRight = income/expense semantic; CaretRight = list navigation affordance; MagnifyingGlass = search; Funnel = filters; Plus = add; Receipt = receipt/transaction section; X = close/reset; WarningCircle = destructive; ArrowsClockwise = retry; ArrowLeft = back |
| Actual names used | `ArrowUpRight`, `ArrowDownRight`, `CaretRight`, `MagnifyingGlass`, `Funnel`, `X`, `Plus`, `Receipt`, `ArrowLeft`, `PencilSimple`, `Trash`, `ImageSquare`, `WarningCircle`, `ArrowsClockwise`, `Sun`, `Moon`, `House`, `ArrowsLeftRight`, `ChartBar`, `Gear`, `Camera`, `Keyboard` |

---

## 11. TYPOGRAPHY

Font family (all): `Plus Jakarta Sans Variable` (`--font-sans`), with `ui-sans-serif, system-ui…` fallbacks. Global `antialiased`.

| Role | Size | Weight | Line height | Tracking | Color (light/dark) |
|---|---|---|---|---|---|
| Page title (`h1`) | `text-2xl` (24px) | `font-bold` | default | `tracking-tight` | `slate-900` / `white` |
| Page subtitle | `text-sm` (14px) | normal | default | — | `slate-500` / `slate-400` |
| Section/group title | `text-sm` (14px) | `font-semibold` | — | — | `slate-700` / `slate-300` |
| Card header title (`h3`) | `text-sm` (14px) | `font-semibold` | — | — | `slate-900` / `white` |
| Card header subtitle | `text-xs` (12px) | normal | — | — | `slate-500` / `slate-400` |
| Input / select value | `text-sm` (14px) | normal | — | — | `slate-900` / `white` |
| Input label | `text-sm` (14px) | `font-medium` | — | — | `slate-700` / `slate-300` |
| Placeholder | `text-sm` (14px) | normal | — | — | `slate-400` / `slate-500` |
| Transaction title (merchant) | `text-sm` (14px) | `font-medium` | — | — | `slate-800` / `slate-200` |
| Row metadata | `text-xs` (12px) | normal | — | — | `slate-500` / `slate-400` |
| Row date / tertiary | `text-xs` (12px) | normal | — | — | `slate-400` / `slate-500` |
| Row amount | `text-sm` (14px) | `font-semibold` | — | — | income `emerald-600` / `emerald-400`; expense `slate-900` / `white` |
| Group net | `text-xs` (12px) | `font-semibold` | — | — | `emerald-600` / `emerald-400` or `slate-500` / `slate-400` |
| Detail hero amount | `text-4xl` (36px) | `font-bold` | — | `tracking-tight` | `emerald-600` / `emerald-400` or `slate-900` / `white` |
| Badge | `text-xs` (12px) | `font-semibold` | — | — | per variant |
| Filter footer / status | `text-xs` (12px) | normal | — | — | `slate-400` / `slate-500` |
| Empty title | `text-sm` (14px) | `font-semibold` | — | — | `slate-800` / `slate-200` |
| Empty description | `text-xs` (12px) | normal | `leading-relaxed` | — | `slate-500` / `slate-400` |
| Error title | `text-base` (16px) | `font-semibold` | — | — | `slate-900` / `white` |
| Error message | `text-sm` (14px) | normal | — | — | `slate-500` / `slate-400` |
| Button label | `text-sm` (14px) | `font-semibold` | — | — | white / white |
| Modal title | `text-base` (16px) | `font-semibold` | — | — | `slate-900` / `white` |
| Modal body | `text-sm` (14px) | normal | `leading-relaxed` | — | `slate-600` / `slate-300` |

**Primary vs secondary hierarchy:** primary = `slate-800/900` + `font-medium/semibold/bold`; secondary = `slate-500`; tertiary = `slate-400`. Semantic values use `emerald-600`/`rose-600` only where meaning matters. All amounts `tabular-nums`.

---

## 12. COLOR SYSTEM

Preserved source token names. Brand palette is defined in `src/index.css` `@theme`; slate/emerald/rose/amber are Tailwind v4 default scales (no custom tokens).

### 12.1 Brand (accent — from `@theme`)
| Token | HEX | Usage |
|---|---|---|
| `--color-brand-50` | `#eff6ff` | active nav bg, icon chip bg, badge bg |
| `--color-brand-100` | `#dbeafe` | avatar bg |
| `--color-brand-300` | `#93c5fd` | dark icon-on-brand, dark badge text |
| `--color-brand-400` | `#60a5fa` | dark hover text/borders |
| `--color-brand-500` | `#3b82f6` | focus border, progress fill, FAB hover border |
| `--color-brand-600` | `#2563eb` | primary buttons, active text, FAB, links, focus ring |
| `--color-brand-700` | `#1d4ed8` | primary button hover, badge text, avatar text |
| `--color-brand-800` | `#1e40af` | primary button active |
| `--color-brand-900` | `#1e3a8a` | dark avatar bg |
| `--color-brand-950` | `#172554` | dark chip/badge bg |

### 12.2 Neutral (slate — Tailwind default)
| Token | HEX | Usage |
|---|---|---|
| `slate-50` | `#f8fafc` | **page background** (light body), row hover bg, income chip bg |
| `slate-100` | `#f1f5f9` | hairlines/dividers, expense chip bg, segmented-track bg, empty icon bg |
| `slate-200` | `#e2e8f0` | borders (`border-slate-200/80` = 80% alpha over bg) |
| `slate-300` | `#cbd5e1` | disabled text, chevron affordance, dashed border |
| `slate-400` | `#94a3b8` | tertiary text (dates, placeholders, filter status) |
| `slate-500` | `#64748b` | secondary text, select chevron SVG color |
| `slate-600` | `#475569` | ghost button text, neutral modal body text |
| `slate-700` | `#334155` | section titles, input labels, secondary button text |
| `slate-800` | `#1e293b` | primary list text (merchant), dark card surfaces, hover tint |
| `slate-900` | `#0f172a` | primary text light mode, card bg dark, expense amount dark |
| `slate-950` | `#020617` | **page background (dark)** |

### 12.3 Semantic
| Token | HEX | Usage |
|---|---|---|
| `emerald-50` | `#ecfdf5` | income chip bg (light) |
| `emerald-400` | `#34d399` | income text (dark) |
| `emerald-500` | `#10b981` | progress fill |
| `emerald-600` | `#059669` | income amounts, income text (light), income icons |
| `emerald-700` | `#047857` | income badge text (light) |
| `emerald-950` | `#022c22` | income chip bg (dark) |
| `rose-50` | `#fff1f2` | danger/expense icon chips, error icon bg |
| `rose-100` | `#ffe4e6` | danger badge bg (light) |
| `rose-400` | `#fb7185` | income-form active text (dark), rose icons dark |
| `rose-500` | `#f43f5e` | error icon, delete-chip icon |
| `rose-600` | `#e11d48` | danger buttons, error text |
| `rose-700` | `#be123c` | danger button hover, expense badge text |
| `rose-800` | `#9f1239` | danger badge text (light, `bg-rose-100` variant) |
| `rose-900` | `#881337` | danger badge bg (dark) |
| `rose-950` | `#4c0519` | rose icon-chip bg (dark) |
| `amber-500` | `#f59e0b` | progress warning fill |
| `amber-700` | `#b45309` | warning badge text |
| `amber-50` | `#fffbeb` | warning badge bg |
| `amber-950` | `#451a03` | warning badge bg (dark) |

### 12.4 Page-level
| Token | HEX / alpha | Usage |
|---|---|---|
| Page bg light | `slate-50` | `body @apply bg-slate-50` |
| Page bg dark | `slate-950` | `dark:bg-slate-950` |
| Body text | `slate-900` / `slate-100` | `body @apply text-slate-900` / `dark:text-slate-100` |
| Card surface | `white` / `slate-900` | Card, Inputs, Selects, Modal |
| Card border | `slate-200/80` (light) / `slate-800` (dark) | borders |
| Divider | `slate-100` / `slate-800` | divide-y, border-b |
| Row hover | `slate-50` / `slate-800/60` | row hover |
| Row active | `slate-100` / `slate-800` | row press |
| Selection | `brand-600` bg + white text | `::selection` |
| Modal scrim | `slate-950/50` + `backdrop-blur-sm` | overlay |
| Focus ring | `brand-500/60` (2px ring) | inputs/selects |
| FAB shadow | `shadow-brand-600/30` | mobile add FAB |
| Text selection | `bg-brand-600 text-white` | — |

---

## 13. SPACING & DIMENSIONS

Local spacing scale (Tailwind v4 default spacing = 0.25rem × n):

| Token | Value | Used for |
|---|---|---|
| `gap-0.5` | 2px | amount↔date column |
| `gap-1` | 4px | nav items, small gaps |
| `gap-1.5` | 6px | icon↔label in rows, button icon gaps, filter status row |
| `gap-2` | 8px | button icon gap, mobile header actions, segmented buttons |
| `gap-3` | 12px | filter grid gaps, row icon↔identity, modal footer, action buttons |
| `gap-4` | 16px | page sections, form field stack, list gap, grid card gaps |
| `gap-5` | 20px | CardHeader internal, form groups, modal padding |
| `mb-4` / `mb-5` | 16px / 20px | filters below header, header below content, detail cards |
| `mt-1` / `mt-2` | 4px / 8px | subtitle under title, hero elements under each other |
| `mt-3` | 12px | filter sub-grid below search, footer below grid |
| `p-4` | 16px | filter card, row px, empty state px |
| `p-5` | 20px | default card padding, form card, modal |
| `py-2.5` | 10px | group header |
| `py-3` | 12px | row vertical padding |
| `py-10` | 40px | empty state vertical |
| `px-3`/`px-4`/`px-5` | 12/16/20px | control / card / button padding |

**Dimensions:**

| Item | Value |
|---|---|
| Control height (input/select/button md) | `h-11` = 44px |
| Button sizes | sm `h-9` (36px), md `h-11` (44px), lg `h-12` (48px) |
| Row min-height | `min-h-14` = 56px (min) |
| Row icon chip | `h-10 w-10` = 40px |
| CardHeader icon chip | `h-8 w-8` = 32px |
| Empty icon chip | `h-12 w-12` = 48px |
| Error icon chip | `h-14 w-14` = 56px |
| Back button | `h-10 w-10` = 40px |
| Mobile FAB | `h-14 w-14` = 56px |
| Page container | `max-w-5xl` (1024px), px-4/sm:px-6/lg:px-8 |
| Modal width (sm+) | `max-w-md` (448px) |

---

## 14. BORDER / RADIUS / SHADOW

### 14.1 Borders & dividers
| Token | Width | Color (light/dark) | Usage |
|---|---|---|---|
| Card border | 1px | `slate-200/80` / `slate-800` | cards, inputs, selects |
| Divider | 1px | `slate-100` / `slate-800` | `divide-y`, `border-b` group headers |
| Dashed | 1px dashed | `slate-300` → hover `brand-400` | receipt upload dropzone |
| Image border | 1px | `slate-200` / `slate-800` | receipt preview |

### 14.2 Radius
| Token | Value | Usage |
|---|---|---|
| `rounded-lg` | 8px | small icon chips, close button, segmented buttons |
| `rounded-xl` | 12px | buttons, inputs, selects, row icon chips, back button, search |
| `rounded-2xl` | 16px (`--radius-card: 1rem`) | **all cards**, empty/error icon chips, add tiles, modal (desktop) |
| `rounded-t-2xl` | 16px top | modal (mobile bottom sheet) |
| `rounded-full` | 999px (`--radius-chip`) | badges, avatar, FAB, progress track |

### 14.3 Shadows
| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)` | all cards, inputs elevation default |
| `--shadow-card-hover` | `0 2px 4px rgb(15 23 42 / 0.06), 0 16px 40px -16px rgb(30 58 138 / 0.22)` | interactive cards on hover (AddAction tiles) |
| `shadow-sm` | Tailwind default | primary/danger buttons |
| `shadow-lg` + `shadow-brand-600/30` | Tailwind default + tint | mobile FAB |
| `shadow-xl` | Tailwind default | modal |

**Design determination: flat + border-based, with a single soft elevation token.** No layered depth, no gradient surfaces in the transaction list (gradients exist only on wallet hero cards outside this area). Hover states use background tint (`slate-50`) + hairline borders, never shadow change (except interactive option cards).

---

## 15. RESPONSIVE SYSTEM

Breakpoints used: `sm` 640px, `md` 768px, `lg` 1024px.

### 15.1 Desktop (`lg+`)
| Aspect | Behavior |
|---|---|
| Shell | fixed sidebar `w-64`; content `max-w-5xl mx-auto px-8 pt-8 pb-10` |
| Header | title + subtitle left, "Tambah" button right |
| Filters | search full width; selects 3-across (`sm:grid-cols-3`) |
| List | day-cards stacked with `gap-4`; rows unchanged (56px) |
| Modal | centered `sm:items-center`, `sm:max-w-md`, `sm:rounded-2xl`, `sm:p-4` scrim padding |

### 15.2 Tablet (`sm–lg`)
| Aspect | Behavior |
|---|---|
| Shell | no sidebar (hidden until lg); mobile header + bottom nav present |
| Filters | selects wrap to 3 columns from `sm` |
| Date pair | always 2-col |
| Content | `px-6 pt-5 pb-28` (bottom nav space) |

### 15.3 Mobile (`< sm`)
| Aspect | Behavior |
|---|---|
| Shell | mobile header `h-16 sticky`, bottom nav `fixed`; content `px-4 pt-5 pb-28` |
| Header | **"Tambah" action hidden** (`hidden sm:block`) — add via bottom-nav FAB |
| Filters | 1-column: search → Tipe → Kategori → Dari/Sampai (2-col pair); stacked card `p-4` |
| List | full-bleed cards `rounded-2xl`, rows `px-4`, min-h 56px |
| Modal | **bottom sheet**: `items-end`, `rounded-t-2xl`, `max-h-[88dvh]`, full-width `p-5`, scrim over content with `backdrop-blur-sm`; safe-area inset on bottom nav via `pb-[env(safe-area-inset-bottom)]` |
| Mobile nav | 5-slot grid, FAB `-mt-5` floating above bar, `text-[11px]` labels |

**Mobile is a deliberate layout:** bottom-sheet modals, FAB-centric add flow, 1-col filters, and a compact nav — not a scaled-down desktop.

---

## 16. STATES

Only states that exist in the source:

| State | Where | Visual |
|---|---|---|
| Default | row | white bg, `slate-800` merchant, `slate-500` meta |
| Hover | row (`Link`) | `hover:bg-slate-50 dark:hover:bg-slate-800/60`, `transition-colors` |
| Active / press | row, button | `active:bg-slate-100`; buttons `active:-translate-y-px active:scale-[0.98]`; FAB `active:scale-95` |
| Hover | interactive card (AddAction) | `hover:shadow-card-hover`, chevron `group-hover:text-brand-500` |
| Focus-visible | buttons | `focus-visible:outline-2 outline-offset-2`, outline `brand-700` (primary) / `slate-400` (secondary/ghost) |
| Focus | inputs/selects | `focus:border-brand-500 focus:ring-2 focus:ring-brand-500/60`, `focus:outline-none` |
| Disabled | button, reset | `cursor-not-allowed opacity-50`; reset additionally `text-slate-300` |
| Error | inputs | `border-rose-400 focus:ring-rose-400/60`, message `text-xs font-medium text-rose-600` |
| Loading | list/detail/form | `LoadingState` skeletons: `animate-pulse bg-slate-200/80 dark:bg-slate-800`, shapes: 40px icon + `h-3.5 w-2/5` + `h-3 w-3/5` row pattern; detail/form also show a 36px circular back-button skeleton |
| Empty | list | `EmptyState` centered, `py-10`, icon chip 48px + title + `max-w-[30ch]` description |
| No-results | list (filters active) | same EmptyState, title "Tidak ada hasil", icon `MagnifyingGlass` |
| Error (page) | list/detail/form | `ErrorState`: `min-h-[40dvh]` centered, rose icon 56px, `WarningCircle size 28 duotone`, title + `max-w-[36ch]` msg, secondary retry button `ArrowsClockwise size 18` |
| Loading button | submit/delete | `Spinner` 16px `animate-spin border-2 border-current border-t-transparent`, button `opacity-50 cursor-not-allowed` |

---

## 17. REUSABLE COMPONENTS

| Component | Source | Structure / tokens | Variants | Responsive |
|---|---|---|---|---|
| `PageHeader` | `ui/PageHeader` | `mb-5 flex items-end justify-between gap-4`; h1 `text-2xl font-bold tracking-tight`, p `mt-1 text-sm text-slate-500`; `action?: ReactNode` | — | action hidden <sm by caller |
| `Card` | `ui/Card` | `rounded-2xl border border-slate-200/80 bg-white shadow-card p-4 sm:p-5`; props `interactive`, `padded`; dark `border-slate-800 bg-slate-900` | interactive adds `hover:shadow-card-hover active:scale-[0.995]` | padding `p-4 sm:p-5` |
| `CardHeader` | `ui/Card` | `mb-4 flex items-start justify-between gap-3`; optional icon chip `h-8 w-8 rounded-lg bg-brand-50 text-brand-600`; title `text-sm font-semibold`; subtitle `text-xs text-slate-500` | — | — |
| `Input` | `ui/Input` | label `text-sm font-medium`; `h-11 rounded-xl border`; `leadingIcon` (left-3, pl-10); `error`/`helper`; focus ring | leading-icon, error, helper | full width |
| `Select` | `ui/Select` | label; `h-11 rounded-xl appearance-none px-3 pr-9`; `.select-chevron` bg; error | error | full width |
| `Button` | `ui/Button` | variants primary/secondary/ghost/danger; sizes sm `h-9`, md `h-11`, lg `h-12`; `rounded-xl font-semibold`; `leadingIcon`; `loading` (Spinner); `fullWidth`; press `active:-translate-y-px scale-[0.98]` | 4 variants × 3 sizes | fullWidth opt |
| `Badge` | `ui/Badge` | `min-h-6 rounded-full px-2.5 py-0.5 text-xs font-semibold` | default/income/expense/warning/danger/neutral | — |
| `EmptyState` | `ui/EmptyState` | centered col `gap-2 px-4 py-10`; icon chip 48px; title `text-sm font-semibold`; desc `max-w-[30ch] text-xs`; action | icon optional | — |
| `LoadingState`/`Skeleton` | `ui/LoadingState` | `Skeleton` = `animate-pulse rounded-lg bg-slate-200/80`; row pattern: 40px icon + 2 bars; `rows` prop | rows count | — |
| `ErrorState` | `ui/ErrorState` | `min-h-[40dvh]` centered; rose 56px chip; title/msg; retry secondary button | — | — |
| `Modal` | `ui/Modal` | overlay `bg-slate-950/50 backdrop-blur-sm`; panel bottom-sheet on mobile (`items-end rounded-t-2xl max-h-[88dvh] p-5`), centered `sm:max-w-md sm:rounded-2xl`; header + close `h-9 w-9`; `footer` `mt-5 flex gap-3` | — | bottom-sheet → centered |
| `TransactionFilters` | feature | §5 (Card + search + 2 Select + 2 date + footer) | — | 1-col → 3-col |
| `TransactionList` | feature | §6/§7 (day groups as cards) | empty/no-result states | — |
| `TransactionRow` | feature | §8 (Link row) | income/expense | — |
| `ReceiptPreview` | feature | Card + CardHeader "Struk"; image (zoom toggle `scale-125`), item list `divide-y`, total row; `grid gap-4 sm:grid-cols-2` | image/items presence | 1-col → 2-col |
| `DeleteTransactionModal` | feature | Modal + rose warning chip 40px + copy | — | — |
| Back-button pattern | detail/form | `mb-4 h-10 w-10 rounded-xl` icon-button, `ArrowLeft size 20` | — | — |
| Segmented type control | `TransactionForm` | `grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1`; buttons `h-11 rounded-lg text-sm font-semibold`; active = `bg-white shadow-sm` + semantic color (`rose-600`/`emerald-600`), inactive `text-slate-500` | expense/income | full width |

---

## 18. DESIGN TOKENS (consolidated)

### 18.1 Colors
| Group | Light | Dark | Role |
|---|---|---|---|
| `background` | `slate-50` `#f8fafc` | `slate-950` `#020617` | page |
| `surface` | `white` | `slate-900` | cards/inputs/modal |
| `surface-muted` | `slate-100` | `slate-800` | chips, tracks |
| `surface-hover` | `slate-50` | `slate-800/60` | row hover |
| `text-primary` | `slate-900`/`slate-800` | `white`/`slate-200` | titles, amounts |
| `text-secondary` | `slate-700`/`slate-500` | `slate-300`/`slate-400` | labels, meta |
| `text-muted` | `slate-400` | `slate-500` | dates, placeholders |
| `text-disabled` | `slate-300` | `slate-600` | disabled |
| `border` | `slate-200/80` | `slate-800` | surfaces |
| `divider` | `slate-100` | `slate-800` | hairlines |
| `accent` | `brand-600` `#2563eb` | `brand-400` `#60a5fa` | interactive/active |
| `income` | `emerald-600` `#059669` | `emerald-400` `#34d399` | amounts/icons |
| `expense` | `slate-900` (neutral!) | `white` | list amounts |
| `danger` | `rose-600` `#e11d48` | `rose-400` `#fb7185` | errors, delete |
| `warning` | `amber-700`/`amber-500` | `amber-300`/`amber-500` | warning badge/progress |
| `success` | `emerald-600` | `emerald-400` | positive net |

### 18.2 Typography
| Token | Value |
|---|---|
| Font family | `Plus Jakarta Sans Variable` + system fallbacks |
| Sizes | 11px (`text-[11px]`, modal hints), 12px (`text-xs`), 14px (`text-sm`), 16px (`text-base`), 24px (`text-2xl`), 36px (`text-4xl`) |
| Weights | normal(400), medium(500), semibold(600), bold(700) |
| Tracking | default; `tracking-tight` on display amounts + page titles |
| Line height | default; `leading-relaxed` on descriptions/body copy |

### 18.3 Spacing
| Token | Value |
|---|---|
| `xs` | 2px (`gap-0.5`) |
| `sm` | 4px (`gap-1`) / 6px (`gap-1.5`) |
| `md` | 8px (`gap-2`) / 12px (`gap-3`) |
| `lg` | 16px (`gap-4`/`p-4`) / 20px (`gap-5`/`p-5`) |
| `xl` | 24px (`gap-6`/`sm:p-6`) |
| `2xl` | 32px (`lg:px-8`, `pb-8`)/ 40px (`py-10`)/ 48px (`px-8`) |

### 18.4 Radius
| Token | Value |
|---|---|
| `xs` | 8px (`rounded-lg`) |
| `sm` | 12px (`rounded-xl`) |
| `md` | 16px (`rounded-2xl`, `--radius-card`) |
| `lg` | — (not used in content area) |
| `xl` | — |
| `pill` | 999px (`rounded-full`, `--radius-chip`) |

### 18.5 Shadows
| Token | Value | Use |
|---|---|---|
| `card` | `0 1px 2px rgb(15 23 42/0.04), 0 8px 24px -12px rgb(15 23 42/0.12)` | all surfaces |
| `card-hover` | `0 2px 4px rgb(15 23 42/0.06), 0 16px 40px -16px rgb(30 58 138/0.22)` | interactive cards |
| `sm` | default | buttons |
| `lg`/`xl` | default | FAB / modal |

### 18.6 Dimensions
| Token | Value |
|---|---|
| Control height | 44px (`h-11`) |
| Button heights | 36/44/48px (sm/md/lg) |
| Row height | ≥56px (`min-h-14`) |
| Row icon chip | 40px (`h-10 w-10`, radius 12px) |
| Card padding | 16px / 20px (`p-4 sm:p-5`) |
| Modal | max-width 448px (`sm:max-w-md`), `p-5`, `max-h-[88dvh]` |
| Icon sizes | 14/15/16/18/20/22/24/26/28 |
| Group header | `px-4 py-2.5` |

---

## 19. GENERIC TRANSACTION TEMPLATE

Blueprint for a Catatin v3 transaction content area.

```
Transaction Page
├─ PageHeader              mb-5; h1 text-2xl font-bold tracking-tight; subtitle text-sm text-slate-500; action right (hidden <sm)
├─ Search/Filter Card      mb-4 rounded-2xl p-4; search h-11 pl-10 + 2 Selects + 2 dates (1→3 cols); footer status + reset
├─ List Container          flex flex-col gap-4
│  └─ Group Card           rounded-2xl border bg-white shadow-card overflow-hidden
│     ├─ Group Header      flex justify-between px-4 py-2.5 border-b; title text-sm font-semibold; net text-xs semibold tabular ±
│     └─ Row List          divide-y divide-slate-100
│        └─ Row (Link)     flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-slate-50
│           ├─ Icon chip   40px rounded-xl (income emerald-50/expense slate-100)
│           ├─ Identity    min-w-0 flex-1: merchant text-sm font-medium + meta text-xs
│           └─ Amount      shrink-0 col items-end: ±Rp text-sm font-semibold tabular + date text-xs + CaretRight 14
└─ Footer/Pagination       (not present in v2; see §20 note)
```

| Level | Component | Dimensions | Spacing | Responsive |
|---|---|---|---|---|
| Page header | `PageHeader` | — | `mb-5` | action hidden <sm |
| Search/filter | `TransactionFilters` | card `p-4` | `mb-4`, `mt-3` inner | 1-col → 3-col |
| List | `TransactionList` | — | `gap-4` | stack |
| Group | `section` card | `rounded-2xl` | header `py-2.5` | full width |
| Row | `TransactionRow` | min-h 56px | `px-4 py-3` | full width |
| Amount | — | `text-sm` semibold tabular | `gap-0.5` col | — |
| Footer | n/a in v2 | — | — | — |

> **Note:** Catatin v2 has **no pagination / load-more** in the transaction list — the list renders all matching transactions grouped by day. Do not invent one; keep the same scope unless Catatin v3 product adds it.

---

## 20. V2 → V3 TRANSLATION RULES

### COPY DIRECTLY
- Spacing philosophy: 16px card padding, 12–16px section gaps, 6px icon↔label, 2px amount-column gap, `mb-5` header.
- Typography hierarchy: `text-2xl bold tracking-tight` title / `text-sm` secondary / `text-xs` tertiary; `text-sm semibold tabular-nums` amounts; `text-xs semibold tabular-nums` group net.
- Row structure: `flex min-h-14 gap-3 px-4 py-3`, icon chip 40px `rounded-xl`, merchant `text-sm font-medium` + meta `text-xs`, right-aligned amount column + `CaretRight 14`.
- Card/surface construction: `rounded-2xl border bg-white shadow-card`, `p-4 sm:p-5`, hairlines `slate-100`.
- Icon treatment: Phosphor family, `bold` in rows/actions, `duotone` decorative, income/expense = ArrowUpRight/ArrowDownRight, semantic chip colors.
- Filter bar: one Card, search with left icon `h-11 rounded-xl pl-10`, labeled selects, 2-col date pair, footer with status + reset.
- Responsive philosophy: 1-col filters <sm; bottom-sheet modal on mobile; FAB add flow; day-grouped card list; 56px rows everywhere.
- Density: medium-high compact ledger; `tabular-nums` on all numbers.
- Border/radius/shadow: `--radius-card 16px`, `rounded-xl 12px` controls, `shadow-card` + `shadow-card-hover` tokens; flat + hairline.
- States: hover `slate-50`, active `slate-100`, focus ring `brand-500/60`, disabled `opacity-50`, `prefers-reduced-motion` override.

### ADAPT (Catatin v3-specific)
- Brand colors: swap `--color-brand-*` blue scale for Catatin v3 brand (keep 50–950 10-step scale and usage roles).
- Semantic colors: keep emerald/rose/amber roles but re-map to brand palette if needed; **decide whether list expenses stay neutral slate or adopt a semantic color** (v2 deliberately keeps them neutral).
- Font: keep a geometric grotesk with `tabular-nums` support; swap `Plus Jakarta Sans` only if the v3 brand specifies another.
- New components: pagination/load-more (if added), transfer/neutral amount styling, category-specific icons (v2 uses type-only icons in rows).
- Content-specific styling: receipt preview, day-group net labels, dynamic subtitle copy.

### DO NOT COPY
- Business logic, API/backend, database schema, state management, routing, auth, calculations (e.g., `groupByDay` net math), OCR/scan flow, Telegram/WhatsApp ingestion, mock data, or product logic.

---

## 21. IMPLEMENTATION CHECKLIST

### Page structure
- [ ] `AppShell` container: `max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 lg:pt-8 pb-28 lg:pb-10`
- [ ] Vertical stack: PageHeader → Filters → List/state component

### Header
- [ ] `PageHeader` reusable component; title `text-2xl font-bold tracking-tight`, subtitle `mt-1 text-sm text-slate-500`
- [ ] Action "Tambah" button `hidden sm:block`, `Button size="md"` + `Plus size 18 bold`

### Search
- [ ] Search in filter card: `h-11 w-full rounded-xl border pl-10 pr-3 text-sm`, leading `MagnifyingGlass 18`
- [ ] Focus: `border-brand-500 ring-2 ring-brand-500/60`
- [ ] Placeholder `text-slate-400`, value `text-slate-900`

### Filters
- [ ] 2 Selects (Tipe, Kategori): `h-11 rounded-xl appearance-none px-3 pr-9`, chevron SVG right 12px, labels above `text-sm font-medium`
- [ ] 2 date Inputs in `grid grid-cols-2 gap-3`
- [ ] Grid `grid-cols-1 gap-3 sm:grid-cols-3`
- [ ] Footer: `Funnel 13` + status `text-xs` + reset `text-brand-600` (disabled `text-slate-300`)

### List / grouping
- [ ] `flex flex-col gap-4` of day-group cards
- [ ] Group card `overflow-hidden rounded-2xl border bg-white shadow-card`
- [ ] Group header `px-4 py-2.5 border-b` + title `text-sm font-semibold text-slate-700` + net `text-xs semibold tabular ±`
- [ ] Rows in `ul divide-y divide-slate-100`

### Row
- [ ] `Link` `flex min-h-14 items-center gap-3 px-4 py-3` + `hover:bg-slate-50 active:bg-slate-100`
- [ ] Icon chip 40px `rounded-xl` (income emerald-50/emerald-600, expense slate-100/slate-500) + `ArrowUpRight/DownRight 18 bold`
- [ ] Identity `min-w-0 flex-1 truncate` (merchant `text-sm font-medium slate-800`, meta `text-xs slate-500` "category · wallet")
- [ ] Amount column `shrink-0 items-end gap-0.5`: amount `text-sm font-semibold tabular ±` (emerald/slate-900) + date `text-xs slate-400`
- [ ] `CaretRight 14 text-slate-300`

### Amount
- [ ] `formatCurrency` = IDR no-decimal (`id-ID`)
- [ ] `tabular-nums` everywhere; `tracking-tight` on hero `text-4xl font-bold`

### Icons
- [ ] Phosphor family only; `bold` in rows/actions, `duotone` decorative
- [ ] Semantic: ArrowUpRight/ArrowDownRight income/expense, CaretRight nav, MagnifyingGlass search, Funnel filter, Plus add, X close/reset, WarningCircle danger, ArrowsClockwise retry, ArrowLeft back

### Typography / colors / spacing / radius / shadows / borders
- [ ] Font: `Plus Jakarta Sans Variable`; antialiased; `tabular-nums` on numbers
- [ ] Semantic tokens: brand-600 primary, emerald-600 income, rose-600 danger, slate scale for neutrals; `border-slate-200/80`, `divide-slate-100`
- [ ] Spacing: p-4/sm:p-5 cards, gap-3 rows, gap-4 sections, mb-5 header
- [ ] Radius: cards 16px, controls 12px, chips 8px, badge pill
- [ ] Shadows: `shadow-card`, `shadow-card-hover`, `shadow-sm` buttons, `shadow-xl` modal
- [ ] Dark mode: `.dark` variant everywhere (`slate-900` surfaces, `slate-800` borders, `slate-400` meta)

### States
- [ ] Loading: `LoadingState` skeletons `animate-pulse bg-slate-200/80` (icon 40px + 2 bars), detail back-button skeleton
- [ ] Empty / no-results: `EmptyState` centered `py-10` + icon chip 48px
- [ ] Error: `ErrorState` `min-h-[40dvh]` + rose 56px chip + retry secondary button
- [ ] Focus-visible outlines, disabled `opacity-50`, hover/active tints, `prefers-reduced-motion`

### Responsive
- [ ] <sm: 1-col filters, hidden header action, bottom-sheet modal, FAB add
- [ ] ≥sm: 3-col filters
- [ ] ≥lg: sidebar + `px-8 pt-8 pb-10`

### Reusable components / tokens
- [ ] Components: PageHeader, Card/CardHeader, Input, Select, Button, Badge, EmptyState, LoadingState/Skeleton, ErrorState, Modal, TransactionFilters, TransactionList, TransactionRow
- [ ] Tokens: `--color-brand-*`, `--shadow-card`, `--shadow-card-hover`, `--radius-card`, `--radius-chip`

---

*End of specification. All values are extracted verbatim from Catatin v2 source; anything marked as absent (pagination, transfer styling) is intentionally omitted because it does not exist in v2.*
