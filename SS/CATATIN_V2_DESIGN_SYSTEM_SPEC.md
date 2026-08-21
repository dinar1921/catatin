# CATATIN V2 DESIGN SYSTEM EXTRACTION

Design specification for implementing Catatin v3 / Freebuff with Catatin v2's visual language.

## 1. Executive Summary

Catatin v2 is a mobile-first, card-based financial tracker built on React 19 + React Router 7 + Tailwind CSS v4 (CSS-first `@theme` tokens, no JS config). Visually it is a **"calm financial UI"**: a single blue (brand) accent on a cool slate neutral system, generous whitespace, soft borders and very subtle elevation, strong tabular-numeric emphasis for money, and semantic color coding (emerald = income/success, rose = expense/error, amber = warning). The UI is organized entirely around rounded-2xl (16px) surface cards with a standardized card header pattern (tinted icon chip + title + subtitle). Layout is a fixed 256px sidebar on desktop (`lg+`), replaced by a sticky mobile header + bottom tab bar with a raised central FAB below `lg`. Pages are centered in a `max-w-5xl` (1024px) column. The density is **Moderate** — comfortable but not sparse. Typography is Plus Jakarta Sans Variable, with tabular numerals required for all monetary figures. Iconography uses Phosphor icons with `duotone` weight as the signature style.

Key source files: `src/index.css` (theme tokens), `src/components/ui/*` (12 shared components), `src/components/layout/*` (shell), `src/features/dashboard/*` (Beranda widgets), `src/features/transactions/*` (Transaksi), `src/features/reports/*` (Laporan).

## 2. Visual Design Language

The visual language is defined by five pillars, all verifiable in code:

1. **Single-accent neutral system.** One brand color family (blue) is used for actions, active states, links, and "info". Everything else is slate neutrals. No multi-color theming; category/wallet entities get semantic or single accent tints only.
2. **Soft surface cards.** Content lives in white (light) / slate-900 (dark) cards, `rounded-2xl`, 1px `slate-200/80` borders, and a two-layer soft shadow. Cards are the atomic unit of the whole UI.
3. **Semantic color grammar.** Emerald = income & success & piutang; Rose = expense & error & hutang; Amber = warning / near-limit; Brand-blue = primary/info/AI. These mappings are consistent across every page.
4. **Numeric emphasis.** Every monetary value uses `tabular-nums`, bold or semibold, and large amounts use `tracking-tight`. Money is the hero of every card.
5. **Mobile-first structure.** Bottom-sheet modals, bottom tab bar with FAB, sticky headers, and 1→2 column grids at `sm/lg` breakpoints. `prefers-reduced-motion` is globally respected.

## 3. Dashboard Layout (Beranda)

Layout structure (`src/features/dashboard/DashboardPage.tsx`):

- The page is a single vertical stack: `flex flex-col gap-5`.
- **Row 1 (full width):** `BalanceCard` — gradient hero card.
- **Row 2:** 2-up grid: `grid grid-cols-1 gap-5 lg:grid-cols-2` containing `SpendingCard` + `UpcomingBillsCard`.
- **Row 3 (full width):** `AiInsightCard` — AI insight card.
- **Row 4:** 2-up grid (same classes): `RecentTransactionsCard` + `BudgetStatusCard`.
- **Row 5 (top):** `GreetingHeader` with `mb-6`.

Vertical rhythm is uniform: every widget separated by `gap-5` (20px). Widgets are equal-height within a row (CSS grid stretch). All widgets are the same `Card` component; visual hierarchy comes from the hero card (gradient) and the AI card (brand tint), not from different card sizes.

Grid rules:
- Mobile: 1 column (everything stacks, gap-5).
- `lg` (≥1024px): paired cards go 2-up.
- No 3+ column layouts anywhere on Beranda.

The 4 stat widgets on Laporan use a different `grid-cols-2 lg:grid-cols-4` pattern (see section 16).

## 4. Responsive Layout

Global shell (`src/components/layout/AppShell.tsx`):

- Desktop (`lg+`): `Sidebar` (sticky, `w-64`, `hidden lg:flex`) + main column. `MobileHeader` and `MobileNav` are `lg:hidden`.
- Main column: `mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8`.
  - Page padding: `16px` mobile → `24px` (sm) → `32px` (lg).
  - Top padding: `20px` → `32px` (lg).
  - Bottom padding: `112px` on mobile (to clear the fixed bottom nav), `40px` on lg.

Mobile chrome:
- `MobileHeader`: sticky top, `h-16`, blurred translucent (`bg-white/90 backdrop-blur`), logo left, theme toggle + avatar right.
- `MobileNav`: fixed bottom, `border-t`, translucent blur, 5-column grid (`grid-cols-5`, `max-w-md` centered), 4 nav tabs + central FAB. FAB is a 56px (h-14 w-14) circle raised `-mt-5` above the bar, `bg-brand-600`, `shadow-lg shadow-brand-600/30`. Labels are `text-[11px]`. `pb-[env(safe-area-inset-bottom)]`.
- Bottom nav is `lg:hidden`; the sidebar is `hidden lg:flex`. Between `sm` and `lg` both the header "Tambah" button (`hidden sm:block`) and the FAB are visible (FAB until lg).

Back-navigation pattern: every detail/form page starts with a 40px-square back button (`h-10 w-10 rounded-xl`, `text-slate-500`, hover `bg-slate-100`).

Responsive breakpoint usage summary (source-verified): `lg:grid-cols-2` (9x), `sm:grid-cols-2` (8x), `sm:p-*` (9x), `lg:hidden` (2x), `lg:flex`, `sm:flex-row`, `sm:rounded-*`, `sm:max-w-md`, `sm:items-center`. No `md:` or `xl:` breakpoints are used anywhere. The only active breakpoints are `sm` (640px) and `lg` (1024px).

## 5. Color System

All values are from `src/index.css` `@theme` and Tailwind v4 default palette usage. The `brand` scale is defined explicitly; `slate/emerald/amber/rose/violet/cyan` are Tailwind defaults used by class name.

### Brand (primary) — `--color-brand-*` (defined in index.css; matches Tailwind blue)

| Token | Hex | Usage |
|---|---|---|
| brand-50 | `#eff6ff` | Active nav bg, icon chip tints, AI card gradient top |
| brand-100 | `#dbeafe` | Hero card labels, avatar bg |
| brand-200 | `#bfdbfe` | AI card border, hero secondary text |
| brand-300 | `#93c5fd` | Dark-mode accent text (active nav, icon chips) |
| brand-400 | `#60a5fa` | Dark-mode hover accents |
| brand-500 | `#3b82f6` | Progress bar, focus ring, link hover |
| brand-600 | `#2563eb` | **Primary actions, active mobile tab, logo mark, FAB** |
| brand-700 | `#1d4ed8` | Primary button hover, hero gradient start, accent text (light) |
| brand-800 | `#1e40af` | Hero gradient end |
| brand-900 | `#1e3a8a` | Avatar bg (dark), AI border dark |
| brand-950 | `#172554` | Icon chip bg (dark), active nav bg (dark) |

### Semantic / neutral (Tailwind defaults)

| Role | Light | Dark | Usage |
|---|---|---|---|
| Page background | `slate-50 #f8fafc` | `slate-950 #020617` | `body` bg |
| Surface / card | `white #ffffff` | `slate-900 #0f172a` | Card, modal, inputs |
| Elevated surface | white + `shadow-card` | slate-900 + border | Interactive cards, modals |
| Text primary | `slate-900 #0f172a` | `white`/`slate-100 #f1f5f9` | Titles, amounts |
| Text secondary | `slate-600 #475569` / `slate-700 #334155` | `slate-200/300` | Section headings, descriptions |
| Text muted | `slate-400 #94a3b8` / `slate-500 #64748b` | `slate-400/500` | Helpers, dates, metadata |
| Border/divider (outer) | `slate-200/80` | `slate-800 #1e293b` | Card borders, nav dividers |
| Border/divider (inner) | `slate-100 #f1f5f9` | `slate-800` | Row dividers inside cards |
| Success | `emerald-600 #059669` / 50 `#ecfdf5` | `emerald-400 #34d399` / 950 `#022c22` | Income, aman, piutang |
| Warning | `amber-600 #d97706` / 50 `#fffbeb` | `amber-400 #fbbf24` / 950 | Waspada, reminders, due-day |
| Error/Danger | `rose-600 #e11d48` / 50 `#fff1f2` | `rose-400 #fb7185` / 950 | Expense accents, lebih, hutang, destructive |
| Info | `brand-600` | `brand-400` | Links, filters active |
| Violet (secondary entity) | 50/600/950 | — | Savings wallet, cicilan settings icon |
| Cyan (chart) | Tailwind cyan (approx `#06b6d4`) | — | 2nd spending color |

### Chart color palette (`SPENDING_COLORS`, server `store.js:674` & mock `store.ts:620`)

`['brand', 'cyan', 'violet', 'amber', 'slate']` — assigned by rank order to top-spending categories. The UI maps them to progress-bar tones: brand→brand, cyan→brand (reuses blue), violet→emerald (mapped), amber→amber, slate→slate (`SpendingCard.tsx` toneByColor).

Note: category/wallet "identity" tints reuse the 50/600 (950/300 dark) chip convention rather than unique per-item colors.

## 6. Typography System

Font family (`index.css`): `'Plus Jakarta Sans Variable'` (loaded via `@fontsource-variable/plus-jakarta-sans`), fallback `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. `-webkit-text-size-adjust: 100%` and `antialiased` on body.

Weights in use: 500 (medium), 600 (semibold), 700 (bold). No 400/800/900 usage in UI.

### Hierarchy (Tailwind classes = exact values)

| Role | Class | Size/Line-height | Weight | Notes |
|---|---|---|---|---|
| Page title | `text-2xl font-bold tracking-tight` | 24px / 32px | 700 | GreetingHeader, forms, scan pages |
| Hero amount | `text-4xl sm:text-5xl` | 36→48px | 700 | BalanceCard; `tracking-tight tabular-nums` |
| Wallet balance | `text-3xl font-bold` | 30px / 36px | 700 | Wallet hero, wallets total; `tracking-tight` |
| Stat KPI value | `text-lg font-bold tabular-nums` | 18px | 700 | Reports stat cards |
| Row amount | `text-sm font-semibold tabular-nums` | 14px / 20px | 600 | Transaction rows, bill rows |
| Card title | `text-sm font-semibold` | 14px | 600 | CardHeader title |
| Section heading | `text-sm font-semibold` (slate-700) | 14px | 600 | Day-group headers |
| Card subtitle | `text-xs` | 12px / 16px | 400 | CardHeader subtitle, muted |
| Body | `text-sm` | 14px | 400 | Descriptions, empty-state text |
| Secondary/meta | `text-xs` | 12px | 400 | category·wallet meta, dates |
| Micro-label | `text-[11px]` | 11px | 400/500 | Mobile nav labels, upload hints |
| Micro-label uppercase | `text-xs font-bold uppercase tracking-[0.14em]` | 12px | 700 | "INSIGHT AI", "REKOMENDASI" kickers |
| Form label | `text-sm font-medium` | 14px | 500 | Input/Select labels |
| Stat label | `text-xs font-medium` | 12px | 500 | Card stat labels |
| Badge label | `text-xs font-semibold` | 12px | 600 | Badges, percent chips |

Numeric conventions: **all amounts use `tabular-nums`**. Positive/income = `+`, expense = `-`, formatted via `Intl.NumberFormat('id-ID', {currency:'IDR', maximumFractionDigits:0})` → `Rp 8.900.000` (non-breaking space). Compact variant used in wallet list (`formatCurrencyCompact`, id-ID compact notation).

## 7. Spacing System

Base unit = **4px** (Tailwind default). Observed scale: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 64, 96, 112.

| Context | Value | Source |
|---|---|---|
| Page horizontal padding | `px-4`=16 / `sm:px-6`=24 / `lg:px-8`=32 | AppShell |
| Page top/bottom padding | `pt-5`=20 / `lg:pt-8`=32; `pb-28`=112 (mobile) / `lg:pb-10`=40 | AppShell |
| Vertical widget rhythm | `gap-5`=20 | Dashboard, reports |
| Grid gap (2-col) | `gap-5`=20 | Dashboard/reports grids |
| List gap between cards | `gap-3`=12 | Wallets, budgets, debts, installments |
| Day-group gap | `gap-4`=16 | TransactionList |
| Card padding | `p-4`=16 → `sm:p-5`=20 | Card default |
| Card padding (large) | `p-5`=20 → `sm:p-6`=24 | Forms, login, hero cards |
| Modal padding | `p-5`=20 | Modal |
| Card header bottom margin | `mb-4`=16 | CardHeader |
| Page header bottom margin | `mb-5`=20 | PageHeader |
| Form field stack gap | `gap-4`=16 | Forms, modals |
| Form 2-col gap | `gap-4`=16 (sm:grid-cols-2); modals `gap-3`=12 | Forms |
| Icon-to-text gap in rows | `gap-3`=12 | Rows, nav |
| Icon-to-text gap small | `gap-2`=8 / `gap-2.5`=10 | Buttons, headers |
| Row internal padding | `py-3`=12 | TransactionRow, bill rows, detail rows |
| Icon button size | `h-8 w-8`=32 / `h-9 w-9`=36 / `h-10 w-10`=40 | actions/back/avatar |
| Large icon chip | `h-11 w-11`=44 / `h-12 w-12`=48 | Wallet/feature cards |
| Progress bar | `h-1.5`=6 | Progress |
| Bar row gap | `gap-3.5`=14 | Bar breakdown items |
| Nav item height | `h-11`=44 | Sidebar |
| FAB | `h-14 w-14`=56 | MobileNav |

## 8. Grid System

- **Content container:** `max-w-5xl` (1024px), centered with `mx-auto`. Sidebar fixed 256px on `lg+`; total desktop viewport width = sidebar + centered 1024px content.
- **Columns used:** `grid-cols-1` (default mobile), `grid-cols-2` (stats, splits), `sm:grid-cols-2`, `lg:grid-cols-2`, `lg:grid-cols-4`, `grid-cols-5` (mobile nav), `grid-cols-3` (`sm:grid-cols-3` filters).
- **Breakpoints:** only `sm`=640 and `lg`=1024. No `md`/`xl`.
- **Alignment:** All page content left-aligned in the container; page headers use `flex items-end justify-between` (title left, action right). Hero/gradient cards are full-bleed within the container.
- **Vertical rhythm:** uniform 20px gaps; `mb-6` for greeting header; `mb-4`/`mb-5` for component-level spacing.

## 9. Card System

One core `Card` (`src/components/ui/Card.tsx`) with a shared `CardHeader`, plus gradient variants composed inline.

**Base Card:**
- Background: white / slate-900 (dark); border: 1px `slate-200/80` / `slate-800`; radius: `rounded-2xl` (16px); shadow: `shadow-card`; padding `p-4 sm:p-5`.
- Props: `interactive` (hover lift), `padded` (default true).

**CardHeader:**
- Layout: `flex items-start justify-between gap-3`, `mb-4`.
- Optional icon chip: `h-8 w-8 rounded-lg bg-brand-50 text-brand-600` (dark: `bg-brand-950 text-brand-300`), icon 16px `weight="duotone"`.
- Title: `text-sm font-semibold` slate-900/white. Subtitle: `text-xs` slate-500/400.
- Optional `action` slot (right-aligned) — used for total badges, etc.

**Variants (all `rounded-2xl`):**

1. **Default surface** — white/border/shadow. Used for ~90% of content.
2. **Brand gradient hero** — `bg-gradient-to-br from-brand-700 via-brand-700 to-brand-800`, white text, `p-5 sm:p-6`, decorative translucent circles (`bg-white/10`, `bg-brand-500/30`), `shadow-card`. Used for BalanceCard and wallet heroes. Variants by wallet type: brand (bank), violet-600→800 (savings), amber-500→700 (cash).
3. **AI insight card** — `bg-gradient-to-b from-brand-50 to-white` (dark `from-brand-950 to-slate-900`), `border-brand-200/70` (dark `border-brand-900`), with a separated footer band (`border-t border-brand-100 bg-white/70`).

**Dividers:** inside cards use `border-slate-100` (dark `slate-800`); row lists use `divide-y divide-slate-100`. Card borders use `slate-200/80`.

**States:**
- Hover (interactive cards): `hover:shadow-card-hover`, `active:scale-[0.995]`, `transition-all duration-150`.
- Press (touch): `active:scale-[0.995]`.
- Selected: `bg-brand-50 text-brand-700` (nav); segmented: `bg-white shadow-sm`.
- Disabled: `opacity-50 cursor-not-allowed`.

## 10. Border & Radius System

Tokens (index.css): `--radius-card: 1rem` (16px), `--radius-chip: 999px`.

Observed scale:

| Radius | Value | Usage |
|---|---|---|
| `rounded-lg` | 8px | Icon action buttons (h-8 w-8), segmented thumbs, image frames |
| `rounded-xl` | 12px | Icon chips (h-8/h-9/h-10/h-11), inputs, buttons, day-chip, upload dropzones, stat icon containers |
| `rounded-2xl` | 16px (`--radius-card`) | **All cards, modals (desktop), wallets, large icon chips (h-11/h-12)**, hero cards |
| `rounded-t-2xl` | 16px top only | Modal bottom-sheet on mobile |
| `rounded-full` | 999px (`--radius-chip`) | Badges, avatars, due-day chips, FAB, toggle knob, progress bars |

Border thickness: **1px** throughout (`border border-*`). Outer borders `slate-200/80`; inner `slate-100`; dark `slate-800`. Dashed variant used for upload dropzones (`border-dashed border-slate-300`, hover `border-brand-400`).

## 11. Shadow / Elevation System

Tokens (index.css):

| Token | Value | Usage |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)` | Default elevation for every card, filter bar, form container |
| `--shadow-card-hover` | `0 2px 4px rgb(15 23 42 / 0.06), 0 16px 40px -16px rgb(30 58 138 / 0.22)` | Interactive card hover (wallets, settings, AddAction) |

Plus framework shadows: `shadow-sm` (segmented selected thumb, logo mark, buttons), `shadow-lg shadow-brand-600/30` (mobile FAB glow), `shadow-xl` (modal). Dark mode: same shadows (slightly imperceptible on slate-900; cards rely more on border).

Elevation hierarchy: page bg (flat) → card (`shadow-card`) → interactive/hover (`shadow-card-hover`) → overlay/modal (`shadow-xl`) → FAB (`shadow-lg` + colored glow).

## 12. Iconography System

Library: **`@phosphor-icons/react` v2.1.7** (phosphor, 256px grid, rounded/soft geometry). This is the single icon source — the only non-Phosphor graphic is the logo SVG and the select chevron data-URI.

Weights (signature of the product):
- **`weight="duotone"`** — the defining style. Used for: nav icons (sidebar + mobile), all CardHeader icons, wallet/feature entity icons, empty-state icons, error/destructive icons, filters/funnel, stat card icons. Duotone is the product's visual identity.
- **`weight="bold"`** — arrows for financial deltas, income/expense directional icons, FAB `Plus`, segmented-control icons.
- **default (regular)** — utility icons (search, eye, X, carets, gear, sun/moon, edit/trash at small sizes).
- **`weight="fill"`** — single use: `Sparkle` in the AI card badge.

Stroke style: consistent 256px duotone (two-tone), rounded terminals, uniform optical weight per size.

### Size scale (verified by pixel use)

| Size | Usage |
|---|---|
| 16px | CardHeader icons, small icon buttons, toggle carets, meta icons |
| 18px | Button leading icons, input icons, stat icons, primary button `Plus` |
| 20px | Sidebar nav, back buttons, mobile header toggles, modal close, hero `Wallet`, dashboard `ArrowUpRight/Down` |
| 22px | Mobile nav tabs, wallet icon chips, delete confirm icons |
| 24px | Empty states, AddAction/settings feature icons, upload dropzone icon, budget `Scales` |
| 26px | FAB `Plus` |
| 28px | ErrorState `WarningCircle` |
| 40px | Scan upload hero icon |

### Color rules
- Content icons (headers/nav/features): `text-brand-600` on `bg-brand-50` chips; dark `text-brand-300` on `bg-brand-950`.
- Entity icons: semantic tints — emerald (income), rose (expense/danger), amber (reminder/cash), violet (savings/cicilan), slate (inactive).
- Muted utility icons: `text-slate-400`/`text-slate-500`, hover `text-slate-700`/`text-slate-800` or `text-brand-600`/`text-rose-600`.
- Income/expense directional arrows: emerald / slate-rose.

### Icon containers
- `h-8 w-8 rounded-lg` (CardHeader), `h-9 w-9 rounded-full` (due-day chip), `h-10 w-10 rounded-xl` (rows, transaction icon), `h-11 w-11 rounded-2xl` (budget/reminder rows), `h-12 w-12 rounded-2xl` (feature cards, AddAction/Settings), `h-14 w-14 rounded-2xl` (error state).

### Domain mapping (which icons define the product)
- Navigation: `House`, `ArrowsLeftRight`, `ChartBar`, `Gear`, `Plus`
- Transactions: `ArrowUpRight`/`ArrowDownRight`, `Receipt`, `MagnifyingGlass`, `Funnel`, `X`
- Wallets: `Bank`, `PiggyBank`, `Coins`, `Wallet`
- Budget: `Scales`, `Wallet`
- Bills/reminders: `CalendarCheck`, `BellRinging`, `Repeat`
- Debt: `HandCoins`, `TrendUp`/`TrendDown`
- Analytics: `ChartBar`, `ChartPieSlice`, `Storefront`
- AI: `Sparkle` (fill), `Lightbulb`, `ListChecks`, `CaretDown`
- Status/actions: `PencilSimple`, `TrashSimple`, `Trash`, `CaretRight`, `X`, `Check`, `WarningCircle`, `ArrowsClockwise`

## 13. Common Components

### Buttons (`Button.tsx`)
- Rounded: `rounded-xl`. Base: `inline-flex items-center justify-center font-semibold`, `active:-translate-y-px active:scale-[0.98]`.
- Variants: primary (`bg-brand-600` hover `brand-700`, white text), secondary (1px `slate-200` border, white bg, slate-700 text), ghost (transparent, slate-600 text, hover bg-slate-100), danger (`bg-rose-600`).
- Sizes: `sm` h-9 (36px), `md` h-11 (44px), `lg` h-12 (48px). `fullWidth` supported. Loading replaces leading icon with a 16px border-2 spinner. Disabled = `opacity-50 cursor-not-allowed`.

### Inputs & Selects
- `Input`: `h-11 w-full rounded-xl border bg-white px-3 text-sm`; focus `border-brand-500 ring-2 ring-brand-500/60`; error state `border-rose-400 ring-rose-400/60`; label `text-sm font-medium`; leading icon at `left-3`; placeholder `text-slate-400`. Date inputs used as-is.
- `Select`: identical shell + custom chevron (data-URI SVG, `right-0.75rem center`, color `#64748b` slate-500).
- `textarea`: `rounded-xl border px-3 py-2.5 text-sm`, same focus ring.

### Badges
- `rounded-full`, `px-2.5 py-0.5`, `min-h-6`, `text-xs font-semibold`, `inline-flex items-center gap-1`.
- Variants: default (brand-50/brand-700), income (emerald), expense (rose), warning (amber), danger (rose-100 stronger), neutral (slate-100).

### Modal
- Overlay: `fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm`, click-to-close, Escape-to-close, body scroll lock.
- Panel: **mobile = bottom sheet** (`items-end`, `rounded-t-2xl`, no horizontal padding); **`sm+` = centered dialog** (`sm:items-center sm:p-4`, `sm:max-w-md sm:rounded-2xl`). Panel `max-h-[88dvh] overflow-y-auto p-5 bg-white dark:bg-slate-900 shadow-xl`.
- Header: title `text-base font-semibold` + 36px close button (`h-9 w-9 rounded-lg`, `X` 20px). Footer: `mt-5 flex gap-3` with two `fullWidth` buttons.

### Segmented control (type toggle)
- Track: `grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1` (dark `bg-slate-800`).
- Thumb: `h-11 rounded-lg bg-white shadow-sm` (dark `bg-slate-900`), text color semantic (rose for expense, emerald for income) when active; inactive `text-slate-500`.

### Progress
- `h-1.5 w-full rounded-full bg-slate-100` (dark `bg-slate-800`); fill tones brand/emerald/amber/rose/slate; width = clamped percent; `transition-all duration-500`. `role="progressbar"` with `aria-valuenow/min/max`.

### Toggle switch (reminders)
- Track `h-6 w-11 rounded-full` (brand-600 on / slate-200 off); knob `h-5 w-5 rounded-full bg-white shadow` positioned `left-0.5` / `left-[22px]`; `role="switch"`.

### States
- **Loading:** `LoadingState` skeleton rows (avatar block `h-10 w-10 rounded-xl` + two bars) + page-specific `animate-pulse` placeholder cards; all `bg-slate-200/80 dark:bg-slate-800`.
- **Empty:** `EmptyState` — 48px icon in `h-12 w-12 rounded-2xl bg-slate-100` chip, title `text-sm font-semibold`, description `text-xs max-w-[30ch]`, optional CTA. Used inside a Card.
- **Error:** `ErrorState` — `min-h-[40dvh]` centered, `h-14 w-14 rounded-2xl bg-rose-50 text-rose-500` icon (WarningCircle 28 duotone), title `text-base font-semibold`, message `text-sm max-w-[36ch]`, "Coba lagi" secondary button.
- **Nav tabs (debt page):** `rounded-xl bg-slate-100 p-1`, flex tabs `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold`; active `bg-white text-brand-600 shadow-sm`.

## 14. Beranda Widget Specifications

### 14.1 GreetingHeader
Full-width block, `mb-6`, stack `gap-1.5`. Greeting line `text-sm text-slate-500` ("Selamat pagi, Dinar"). Title `text-2xl font-bold tracking-tight` = month name (e.g., "Agustus 2026"). Sub-line `text-sm text-slate-500`.

### 14.2 BalanceCard (hero / total saldo)
Full-width gradient card (spec in section 9 variant 2). Content:
- Top row: label `text-sm text-brand-100` with `Wallet` 16 bold icon + "Total uangmu saat ini"; right link "Lihat dompet" `text-xs font-semibold text-brand-200` + `CaretRight`.
- Hero value: `text-4xl sm:text-5xl font-bold tracking-tight tabular-nums` white.
- Footer split: `mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-4`; each cell: label `text-xs text-brand-100`, value `text-base sm:text-lg font-semibold tabular-nums`, delta chip `text-xs font-semibold` (`text-emerald-300` up / `text-rose-300` down) with 14px bold arrow. Expense delta is inverted (expense increase = red).
- Whole card is a `Link` to `/wallet`; `active:scale-[0.995]`.
- Decorative: two blurred circles, `-right-10 -top-12 h-40 w-40 bg-white/10` and `-bottom-16 right-16 h-32 w-32 bg-brand-500/30` — soft depth motif.

### 14.3 SpendingCard ("Spending utama")
Standard Card + CardHeader (`ChartPieSlice` 16 duotone; title "Spending utama"; subtitle "Pengeluaran per kategori bulan ini"). Body: `ul gap-4`; each row: label `text-sm font-medium` slate-700 + amount `text-sm font-semibold tabular-nums` on one baseline (`items-baseline justify-between`); percent `text-xs font-semibold` (rose if ≥50% else slate-400); `Progress` (tone from `toneByColor`). Row spacing `gap-4`, label-to-bar gap `mb-1.5`.

### 14.4 UpcomingBillsCard ("Tagihan & cicilan")
Standard Card. Header: `CalendarCheck` icon; title "Tagihan & cicilan"; subtitle "Yang perlu dibayar bulan ini"; **action = Badge** `variant="default"` showing total amount. Body rows (`border-b border-slate-100` divider between, `py-3` each):
- Due-day avatar: `h-9 w-9 rounded-full bg-brand-50 text-xs font-bold text-brand-700` (dark 950/300) showing the day number.
- Title `text-sm font-medium` truncated; meta line `text-xs text-slate-500` = category + installment progress `paid/total`.
- Right: Badge `due_label` (warning for installment, neutral for recurring) + amount `text-sm font-semibold tabular-nums`.
- Empty state: `py-6 text-center text-sm text-slate-500` ("Tidak ada tagihan bulan ini.").

### 14.5 AiInsightCard ("Insight AI")
Full-width gradient brand card (section 9 variant 3). Header kicker: 28px circular `bg-brand-600` chip with `Sparkle fill` 15px white + uppercase `text-xs font-bold tracking-[0.14em] text-brand-700` "INSIGHT AI". Title `text-base font-bold`; summary `text-sm leading-relaxed`. "Lihat penjelasan" toggle (brand-700, `Lightbulb` duotone 15 + `CaretDown` rotating 180 deg); expanded `<dl>` panel `rounded-xl border border-brand-100 bg-white p-4` with 4 definition rows ("Angka saat ini", "Pembanding", "Penyebab utama", "Perhitungan singkat") — label `font-semibold` slate-700, value `text-sm` slate-600. Footer band: `border-t border-brand-100 bg-white/70 px-5 py-4` with `ListChecks` 15 + uppercase kicker "REKOMENDASI", then title `text-sm font-semibold` and summary `text-sm`.

### 14.6 RecentTransactionsCard ("Transaksi terbaru")
Standard Card. Header: `Receipt` icon; subtitle "8 transaksi terakhir". Rows (`py-3`, divider between, `gap-3`):
- Icon chip `h-10 w-10 rounded-xl`: income `bg-emerald-50 text-emerald-600` with `ArrowUpRight 18 bold`; expense `bg-slate-100 text-slate-500` with `ArrowDownRight`.
- Merchant `text-sm font-medium` truncated; meta `text-xs` = `category · wallet`.
- Amount `text-sm font-semibold tabular-nums` (+ emerald / - slate-900) + date `text-xs` slate-400.
- Empty state uses `EmptyState` (title "Belum ada transaksi").

### 14.7 BudgetStatusCard ("Status budget")
Standard Card. Header: `Wallet` icon; subtitle "Budget kategori bulan ini". Rows `gap-4`: line 1 = category `text-sm font-medium` + status Badge (Aman=income/Waspada=warning/Lebih=danger); line 2 `text-xs` = "`amount` dari `budget`" (`tabular-nums` slate-500) + percent `text-xs font-semibold` (rose if >100, amber if waspada, else slate-500); `Progress` tone emerald/amber/rose, clamped to 100.

## 15. Transaksi List Specifications

Page structure (`TransactionsPage.tsx`):
- `PageHeader` (title "Transaksi", dynamic subtitle with count, right action = primary "Tambah" button, `hidden sm:block`).
- **Filter bar** (`TransactionFilters.tsx`): a Card (`rounded-2xl border bg-white p-4 shadow-card`, `mb-4`).
  - Search field: 44px rounded-xl with `MagnifyingGlass 18` leading at left-3.
  - Second row: `grid grid-cols-1 gap-3 sm:grid-cols-3` — Tipe select, Kategori select, and a `grid-cols-2 gap-3` pair of date inputs (Dari/Sampai).
  - Footer row: `mt-3 flex items-center justify-between` — left caption `text-xs text-slate-400` with `Funnel 13 duotone` ("Filter aktif"/"Tanpa filter"); right "Reset filter" text-button `text-xs font-semibold text-brand-600` with `X 13 bold` (disabled = slate-300).
- **List** (`TransactionList.tsx`): day-grouped. Each day = a Card section (`rounded-2xl border bg-white shadow-card overflow-hidden`):
  - Section header: `px-4 py-2.5 border-b border-slate-100` — date `text-sm font-semibold` slate-700 + net amount `text-xs font-semibold tabular-nums` (emerald if ≥0, slate-500 if negative).
  - Rows: `divide-y divide-slate-100`.
- **TransactionRow** (reused on Beranda, Laporan, wallet detail): `Link` `min-h-14 flex items-center gap-3 px-4 py-3`, hover `bg-slate-50`. Icon chip `h-10 w-10 rounded-xl` (income emerald/up, expense slate/down). Center: merchant `text-sm font-medium` + meta `text-xs` (`category · wallet`). Right: amount `text-sm font-semibold tabular-nums` (income `text-emerald-600`, expense `text-slate-900`; dark: emerald-400 / white) + date `text-xs` slate-400; trailing `CaretRight 14` slate-300.
- **Detail page** (`TransactionDetailPage.tsx`): amount hero card (Badge + `text-4xl font-bold tabular-nums`, income emerald / expense slate-900, + merchant + date) followed by a "Detail transaksi" Card using `DetailRow`s (`flex justify-between border-b border-slate-100 py-3 last:border-0`, label `text-sm slate-500`, value `text-sm font-medium slate-800` with `CaretRight` for links, hover `bg-slate-50`), then optional ReceiptPreview card, then a 2-button action row (`Edit` secondary + `Hapus` danger, `flex gap-3`, each `flex-1`).
- **Form** (`TransactionForm`): Card container `rounded-2xl border bg-white p-5 sm:p-6 shadow-card`; type segmented control; fields stacked `gap-4`; amount input with "Rp" leading slot; 2-col grids `sm:grid-cols-2 gap-4`; full-width `size="lg"` submit at `mt-6`; helper caption `text-xs text-center text-slate-400`. Upload dropzone: `min-h-24 rounded-xl border-dashed border-slate-300`, hover `border-brand-400 text-brand-600`, `ImageSquare 24 duotone`, `text-xs font-medium`.

## 16. Laporan Widget Specifications

Page structure (`ReportsPage.tsx`, `report.ts`, `useReport.ts`):
- Back button + `PageHeader` (title "Laporan", subtitle, action = secondary "Ekspor CSV" button with `DownloadSimple 18`).
- **Filter bar Card** (`mb-4`): `grid grid-cols-2 gap-3 lg:grid-cols-4` — Dari/Sampai date inputs + Tipe select + Kategori select; second row `mt-3 flex gap-2` — search Input (`flex-1`, `MagnifyingGlass` leading) + "Cari" secondary button + "Atur ulang" ghost button with `ArrowClockwise`.
- **Row 1:** stat grid `grid grid-cols-2 gap-3 lg:grid-cols-4` (note: `gap-3`, tighter than dashboard's `gap-5`). Each `StatCard`: label `text-xs font-medium` slate-500; value `text-lg font-bold tabular-nums` truncated; sub `text-xs` slate-400; icon chip `h-10 w-10 rounded-xl` (emerald/rose/brand tints, 20px duotone arrows/trends). The four: Pemasukan (emerald up-arrow), Pengeluaran (rose down-arrow), Arus kas bersih (emerald/rose trend, +/-), Rata-rata pengeluaran (brand `Receipt`).
- **Row 2:** full-width `AiInsightCard` (same component as Beranda).
- **Row 3:** `grid gap-4 lg:grid-cols-2` — `BarBreakdown` "Pengeluaran per Kategori" (`ChartBar`) + "Pengeluaran per Dompet" (`Wallet`). Each row: label `text-sm font-medium` + amount `font-semibold tabular-nums` + percent `text-xs w-9 tabular-nums` right-aligned; `Progress` brand, `mt-1.5`. Row gap `gap-3.5`.
- **Row 4:** `grid gap-4 lg:grid-cols-2` — `BudgetComparisonCard` (rows: category + percent Badge danger/warning/income; `text-xs` "spent dari budget" + status word; Progress rose/amber/emerald) + `MerchantCard` (rows: merchant + `count transaksi`; amount + percent).
- **Row 5:** `grid gap-4 lg:grid-cols-2` — `BillsCard` ("Tagihan Berjalan", `Repeat` icon; rows with due-day chip `h-10 w-10 rounded-xl` amber(recurring)/brand(cicilan), Badge "Rutin"/"Cicilan", mini `Progress w-24` for installments with `paid/total` caption) + `DebtsCard` ("Hutang & Piutang", `HandCoins`; two stat boxes `grid grid-cols-2 gap-3` — rose hutang / emerald piutang with `TrendDown`/`TrendUp`, value `text-base font-bold`, "dari total" caption; footer `text-xs` count).
- **Row 6:** full-width "Daftar Transaksi" Card using `TransactionRow` list (`divide-y`), negative-margin flush list (`-mx-4 -mb-4`).
- Footer caption: centered `text-xs text-slate-400` with `CalendarDots 14`.

Note: Laporan uses `gap-4` between section grids (dashboard uses `gap-5`) and `gap-3` within the stat grid — slightly tighter density for analytics.

## 17. Responsive Component Rules

| Component | Desktop (lg+) | Tablet (sm-lg) | Mobile (<640) |
|---|---|---|---|
| Shell | Sidebar 256px + centered 1024px main | Mobile header + bottom nav (main still centered) | Same as tablet |
| Dashboard grids | 2-col pairs (`lg:grid-cols-2`) | 1-col | 1-col |
| Reports stat grid | 4-col | 2-col | 2-col |
| Reports paired sections | 2-col | 1-col | 1-col |
| Filter selects (transaksi) | 3-col | 3-col (`sm:grid-cols-3`) | 1-col stacked |
| Filter fields (laporan) | 4-col | 2-col | 2-col |
| Forms | 2-col pairs | 2-col | 1-col stacked |
| Modal | Centered dialog `sm:max-w-md` | Centered dialog | Bottom sheet `rounded-t-2xl` full-width |
| Balance hero amount | `text-5xl` | `text-4xl` (sm-) | `text-4xl` |
| Card padding | `p-5`/`sm:p-6` | `p-5` | `p-4` |
| Hero/action buttons row | `flex-row` | `flex-row` | `flex-col` (installment actions, receipt actions) |
| Page bottom padding | `pb-10` | `pb-28` (FAB clearance) | `pb-28` |
| "Tambah" header button | visible | visible (sm+) | hidden (FAB instead) |
| AddAction/Settings feature grids | `sm:grid-cols-2` | 2-col | 1-col |
| Scrollable areas | — | — | Modal body; transaction rows truncate |

Nothing "disappears" except the sidebar/header-button; order never changes; all grids collapse to single column below `sm`/`lg`.

## 18. Component Patterns

Recurring patterns (the reusable DNA):

1. **KPI/Stat card** — label (`text-xs font-medium` muted) + value (`font-bold tabular-nums`) + optional sub (`text-xs` muted) + tinted icon chip. Used: reports stats, wallet income/expense, debts boxes.
2. **Chart/progress bar card** — CardHeader + stacked rows of `label ↔ amount` baseline + percent + 6px Progress bar. Used: Spending, BudgetStatus, BudgetComparison, BarBreakdown.
3. **Insight card** — gradient brand surface, Sparkle chip + uppercase kicker, collapsible explanation, separate recommendation footer.
4. **List card** — CardHeader + `divide-y` rows of `icon chip + (title + meta) + right-aligned amount/meta + caret`. Used: transactions, bills, recent transactions, wallet list.
5. **Transaction row** — the canonical list item (10x10 rounded icon, dual-line text, right-aligned signed amount + date, caret). Reused across Beranda/Laporan/wallet detail.
6. **Entity row card** — full Card per entity with `h-11 w-11 rounded-2xl` tinted icon + title/status Badge + progress + inline actions (budgets, reminders, installments, debts).
7. **Feature link card** — icon chip `h-12 w-12 rounded-2xl`, title + description, right `CaretRight`, interactive hover (AddAction, Settings).
8. **Section header** — CardHeader (icon chip + title + subtitle + optional action) OR bare `text-sm font-semibold slate-700` (day groups, section titles).
9. **Financial amount** — always `tabular-nums`, signed, semibold/bold, sized to hierarchy (text-sm rows → text-lg/4xl/5xl KPIs), income emerald / expense slate-900.
10. **Status indicator** — Badge (semantic variants) + optional color-coded Progress.

## 19. Design Tokens

### Colors (token → value → confidence)

| Token | Value | Confidence |
|---|---|---|
| `brand.50` | `#eff6ff` | Exact |
| `brand.100` | `#dbeafe` | Exact |
| `brand.200` | `#bfdbfe` | Exact |
| `brand.500` | `#3b82f6` | Exact |
| `brand.600` | `#2563eb` | Exact |
| `brand.700` | `#1d4ed8` | Exact |
| `brand.800` | `#1e40af` | Exact |
| `brand.900` | `#1e3a8a` | Exact |
| `brand.950` | `#172554` | Exact |
| `bg.canvas` | `slate-50 #f8fafc` / dark `slate-950 #020617` | Exact |
| `surface` | `#ffffff` / `slate-900 #0f172a` | Exact |
| `border.subtle` | `slate-200/80` / `slate-800` | Exact |
| `border.inner` | `slate-100` / `slate-800` | Exact |
| `text.primary` | `slate-900` / `white` | Exact |
| `text.secondary` | `slate-600`-`700` | Exact |
| `text.muted` | `slate-400`-`500` | Exact |
| `semantic.success/income` | `emerald-600 #059669` (50 `#ecfdf5`, 950 `#022c22`) | Exact |
| `semantic.warning` | `amber-600 #d97706` (50 `#fffbeb`, 950 `#451a03`) | Exact (amber-950 approx. by Tailwind default) |
| `semantic.danger/expense` | `rose-600 #e11d48` (50 `#fff1f2`, 950 `#4c0519`) | Exact |
| `chart.palette` | brand, cyan, violet, amber, slate | Exact |

### Typography (token → value → confidence)

| Token | Value | Confidence |
|---|---|---|
| `font.family` | `'Plus Jakarta Sans Variable'` + system fallback | Exact |
| `type.display` | 48px/700 (`sm:text-5xl`), tracking-tight, tabular | Exact |
| `type.titlePage` | 24px/700, tracking-tight | Exact |
| `type.kpi` | 18px/700 tabular | Exact |
| `type.cardTitle` | 14px/600 | Exact |
| `type.body` | 14px/400 (lh 20px) | Exact |
| `type.caption` | 12px/400 (lh 16px) | Exact |
| `type.micro` | 11px | Exact |
| `type.amountRow` | 14px/600 tabular | Exact |
| `type.kicker` | 12px/700 uppercase, tracking `0.14em` | Exact |

### Spacing (all Exact, Tailwind)

`space.1`=4, `space.2`=8, `space.3`=12, `space.3.5`=14, `space.4`=16, `space.5`=20, `space.6`=24, `space.8`=32, `space.10`=40, `space.14`=56, `space.28`=112.
Key: `cardPadding`=`p-4 sm:p-5`, `pagePaddingX`=`px-4 sm:px-6 lg:px-8`, `widgetGap`=20, `cardListGap`=12.

### Radius (Exact)

`radius.sm`=8 `rounded-lg`, `radius.md`=12 `rounded-xl`, `radius.lg`=16 `rounded-2xl` (`--radius-card`), `radius.pill`=999 `rounded-full` (`--radius-chip`), `radius.input`=12, `radius.button`=12.

### Shadows (Exact)

`shadow.card`=`0 1px 2px rgb(15 23 42/.04), 0 8px 24px -12px rgb(15 23 42/.12)`; `shadow.cardHover`=`0 2px 4px rgb(15 23 42/.06), 0 16px 40px -16px rgb(30 58 138/.22)`; `shadow.overlay`=`shadow-xl`; `shadow.fab`=`shadow-lg` + `shadow-brand-600/30`.

### Component dimensions (Exact)

`control.height`=44 (`h-11`), `button.sm`=36, `button.lg`=48, `row.minH`=56 (`min-h-14`), `iconChip.xs`=32 (h-8 w-8), `iconChip.sm`=40 (h-10 w-10), `iconChip.md`=44 (h-11 w-11), `iconChip.lg`=48 (h-12 w-12), `progress.height`=6, `toggle`=24x44, `fab`=56, `sidebar.w`=256, `content.maxW`=1024, `modal.maxH`=88dvh, `mobileNav.h`≈64 + safe-area.

### Breakpoints / grid (Exact)

`bp.sm`=640, `bp.lg`=1024 (only two used). `grid.pair`=`grid-cols-1 lg:grid-cols-2`; `grid.stats`=`grid-cols-2 lg:grid-cols-4`; `grid.features`=`grid-cols-1 sm:grid-cols-2`; `grid.filters3`=`grid-cols-1 sm:grid-cols-3`.

## 20. Catatin V3 Adaptation Rules

### COPY DIRECTLY (reusable visual rules)

1. The full spacing scale, radius scale, and shadow tokens (sections 7, 10, 11).
2. Card system + CardHeader pattern (tinted 32px icon chip + 14px/600 title + 12px subtitle + optional action).
3. Numeric treatment: `tabular-nums` on all money, income emerald `+` / expense slate `-`, tracking-tight large values.
4. Semantic grammar: emerald=success/income, rose=error/expense, amber=warning, brand=primary/info.
5. Iconography: Phosphor, `duotone` for content/headers/features, `bold` for directional arrows, 16-28px size ladder, 50/600 (950/300 dark) tinted chips.
6. Component recipes: Button/Input/Select/Badge/Modal(bottom-sheet-to-dialog)/Segmented control/Progress/Empty/Error/Loading states (section 13).
7. The 6px progress bar row pattern for any "spend vs limit" metric.
8. Layout shell pattern: max-w-5xl centered column, 2-col pair grids at lg, `gap-5` rhythm, sticky sidebar to bottom nav + FAB swap at lg.
9. Two breakpoints only (sm, lg); mobile-first bottom-sheet modals; 112px bottom clearance for FAB.
10. The AI insight card anatomy (gradient brand surface + Sparkle + uppercase kicker + collapsible explanation + recommendation footer) — as a *format*, restyled.

### ADAPT (tune for V3)

1. **Brand color** — keep the single-accent model but swap the blue for V3's own accent; keep the 50→950 ramp structure and 600-as-primary convention.
2. **AI identity** — replace the blue-tint AI gradient with V3's accent or a distinct accent; keep the kicker/expandable/recommendation anatomy.
3. **Hero card** — keep the gradient-hero + decorative-circle motif but with V3 brand ramp; consider replacing the two circles with V3's own depth motif.
4. **Density** — Laporan's tighter `gap-3`/`gap-4` is a proven analytics density; V3 can adopt per-context density levels (browse=20px, analytics=14-16px).
5. **Typography** — keep the hierarchy/sizes/weights, but evaluate swapping Plus Jakarta Sans for V3's typeface if the product voice differs; preserve `tabular-nums`.
6. **Entity tints** — the wallet-type color coding (brand/violet/amber) is a good convention to keep but re-map hues to V3's palette.

### KEEP UNIQUE (belongs to V3)

1. V3's own logo and brand mark (do not reuse the "Catatin" receipt-list logotype).
2. V3 product name/copy voice (Indonesian friendly tone, greeting + emoji style is a copy decision to re-evaluate).
3. V3's hero/gradient illustration or imagery if any.
4. V3's product-specific empty-state illustrations and onboarding visuals.
5. V3's distinct accent/background pair.

### DO NOT COPY (product-specific)

1. The "Catatin" wordmark and its blue rounded-square + white list-lines glyph.
2. The exact brand blue ramp (`#eff6ff`-`#172554`) as a *brand* (it is Tailwind default blue; fine as a neutral, but not as V3's identity).
3. BalanceCard copy ("Total uangmu saat ini", "Lihat dompet"), greeting emoji, demo credentials copy.
4. Any mock data, seed transactions, or domain copy (Indonesian is a market decision, not a design language).
5. The `monkeycode-ai.live` allowed-hosts / reverse-proxy config (environment-specific).

The goal state: V3 shares the **structural DNA** (soft cards, single accent, semantic grammar, numeric emphasis, mobile-first bottom-sheet) while carrying its **own brand**, so a user of V2 immediately feels at home without mistaking V3 for a reskin.

## 21. AI Implementation Guidance

For the implementing agent, the fastest correct path:

1. **Start from tokens, not pixels.** Define the token sheet in section 19 first (CSS `@theme` or equivalent), then build `Card`/`CardHeader`/`Button`/`Input`/`Select`/`Badge`/`Progress`/`Modal`/`Empty`/`Error`/`Loading` exactly per section 13 — these cover ~80% of the UI.
2. **Rebuild the shell second:** sidebar (w-64, `hidden lg:flex`, brand-50 active state), mobile header (sticky h-16 blur), bottom nav (5-col grid + 56px raised FAB, `pb-safe`), main column (`max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 lg:pb-10`).
3. **Compose pages from patterns, not bespoke layouts.** Beranda = GreetingHeader + hero + two `lg:grid-cols-2` pairs + AI card (section 14). Laporan = stat grid + AI card + three 2-col pairs + full-width list (section 16). Transaksi = filter card + day-grouped card sections (section 15).
4. **Apply the numeric rule everywhere:** every amount = `tabular-nums`; income `+`/emerald, expense `-`/slate-900 (expense never red in lists — red is reserved for warnings/errors); large values `tracking-tight`.
5. **Use Phosphor `duotone`** for all header/nav/feature icons and `bold` for directional arrows; respect the 16/18/20/22/24/26/28 size ladder and 50/600-950/300 chip tints.
6. **Implement exactly two breakpoints** (sm=640, lg=1024). Modal = bottom sheet <sm, centered `sm:max-w-md` ≥sm.
7. **Do not invent new colors** — stay within brand ramp + slate + emerald/amber/rose/violet/cyan. Dark mode = swap surfaces to slate-950/900, borders to slate-800, and use 950/300 tint chips.
8. **Preserve empty/loading/error states** as first-class: every data region needs skeleton (`bg-slate-200/80 animate-pulse`), `EmptyState` (48px slate chip + title + `max-w-[30ch]`), and `ErrorState` (rose 56px chip + retry).
9. **Keep interactions consistent:** interactive cards `hover:shadow-card-hover active:scale-[0.995] transition-all duration-150`; buttons `active:scale-[0.98]`; touch targets ≥44px.

---

*Source basis: all values extracted from `src/index.css`, `src/components/ui/*`, `src/components/layout/*`, `src/features/{dashboard,transactions,reports,wallets,settings,budget,reminders,installments,debts,scan}/*`, `src/lib/format.ts`, `server/src/store.js`, `src/mocks/*`. No source values were invented; Tailwind default palette hex values (slate/emerald/amber/rose/violet/cyan) are standard library values and are marked accordingly. Confidence: token definitions = Exact; inferred semantic roles = Strongly Inferred; any non-sourced estimate = Approximate (none required).*
