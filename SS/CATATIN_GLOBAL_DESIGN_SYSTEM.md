# CATATIN GLOBAL DESIGN SYSTEM
## Visual Foundation & AI Design Rules

**Version:** 1.0  
**Scope:** Global application-wide design foundation  
**Platform:** Desktop + Mobile  
**Theme:** Light + Dark  
**Primary source:** CATATIN v2 visual language and extracted design specifications

---

# 1. Purpose

CATATIN Global Design System adalah sumber aturan visual utama yang digunakan oleh seluruh aplikasi.

Dokumen ini mendefinisikan fondasi visual yang harus konsisten di semua halaman:

- visual language
- color system
- semantic color
- typography
- spacing
- radius
- border
- elevation
- iconography
- component sizing baseline
- responsive principles
- light/dark mode
- interaction principles
- numeric formatting
- AI implementation rules

Dokumen ini **tidak mendefinisikan layout atau style khusus satu menu**.

Arsitektur dokumentasi CATATIN:

```text
Global Design System
        ↓
Shared Component System
        ↓
Page Design Specifications
        ↓
Feature / Product Specifications
```

Global Design System adalah sumber kebenaran tertinggi untuk keputusan visual lintas aplikasi.

---

# 2. Design Philosophy

CATATIN mempertahankan karakter visual v2 dengan penyempurnaan terbatas, bukan redesign total.

### Core character

- Modern
- Minimal
- Calm
- Trustworthy
- Practical
- Consistent
- Moderate density

### Visual character

CATATIN menggunakan hierarchy terutama melalui:

1. typography weight
2. text contrast
3. spacing
4. surface treatment

Bukan melalui:

- excessive decoration
- excessive gradients
- excessive shadows
- excessive colors
- excessive border styles

Interface harus terasa tenang, jelas, mudah dipindai, dan tetap konsisten ketika jumlah halaman bertambah.

---

# 3. Core Visual Principles

## 3.1 Neutral First

Neutral slate adalah bahasa visual utama.

Brand color digunakan terutama untuk:

- primary action
- active state
- interactive identity
- informational emphasis

Semantic colors hanya digunakan ketika memiliki makna.

## 3.2 One Visual Language

Desktop dan mobile adalah bagian dari satu sistem.

Layout boleh berubah berdasarkan viewport, tetapi karakter berikut harus tetap konsisten:

- typography
- color
- spacing
- radius
- iconography
- component character

## 3.3 Flat + Soft Elevation

Gunakan flat 2D surfaces dengan border tipis dan soft shadow.

Hindari banyak level elevation yang membuat interface terasa berat.

## 3.4 Hierarchy Through Weight

Prioritas informasi ditentukan terutama melalui kombinasi:

- size
- weight
- color
- spacing

Jangan memperbesar semua elemen hanya untuk membuat hierarchy.

## 3.5 Controlled Color

Jangan memperkenalkan warna baru hanya untuk dekorasi.

Gunakan token brand, neutral, dan semantic yang sudah tersedia.

## 3.6 Reuse Before Reinvent

Sebelum membuat treatment baru, cari token atau shared component yang sudah ada.

---

# 4. Design Token Architecture

Semua keputusan visual penting harus berasal dari token.

Token dibagi menjadi:

1. **Primitive tokens** — nilai dasar seperti brand-600 atau slate-900.
2. **Semantic tokens** — fungsi seperti `text.primary`, `background.surface`, `status.success.text`.

Primitive menjelaskan **apa warnanya**.

Semantic menjelaskan **untuk apa warnanya**.

Komponen sebaiknya menggunakan semantic token ketika memungkinkan.

---

# 5. Color System

## 5.1 Brand Palette

CATATIN mempertahankan blue sebagai arah brand utama.

Baseline dari v2:

| Token | Hex | Primary role |
|---|---|---|
| brand-50 | `#eff6ff` | light brand surface |
| brand-100 | `#dbeafe` | light tint / secondary surface |
| brand-200 | `#bfdbfe` | light border / accent tint |
| brand-300 | `#93c5fd` | dark-mode accent text |
| brand-400 | `#60a5fa` | dark-mode hover / accent |
| brand-500 | `#3b82f6` | progress / focus / secondary action |
| brand-600 | `#2563eb` | primary action / active / brand |
| brand-700 | `#1d4ed8` | hover / stronger accent |
| brand-800 | `#1e40af` | strong hero accent |
| brand-900 | `#1e3a8a` | dark supporting accent |
| brand-950 | `#172554` | dark brand surface |

`brand-600` adalah default primary action.

## 5.2 Neutral Palette

Neutral system menggunakan slate.

### Light

| Role | Default |
|---|---|
| Page background | `slate-50 #f8fafc` |
| Surface | `white #ffffff` |
| Primary text | `slate-900 #0f172a` |
| Secondary text | `slate-600 #475569` / `slate-700 #334155` |
| Muted text | `slate-400 #94a3b8` / `slate-500 #64748b` |
| Outer border | `slate-200` |
| Inner divider | `slate-100 #f1f5f9` |

### Dark

| Role | Default |
|---|---|
| Page background | `slate-950 #020617` |
| Surface | `slate-900 #0f172a` |
| Primary text | `white` / `slate-100` |
| Secondary text | `slate-200` / `slate-300` |
| Muted text | `slate-400` / `slate-500` |
| Border | `slate-800 #1e293b` |
| Divider | `slate-800` |

## 5.3 Semantic Palette

| Semantic | Light | Dark | Meaning |
|---|---|---|---|
| Success | emerald-600 / emerald-50 | emerald-400 / emerald-950 | income, success, positive |
| Warning | amber-600 / amber-50 | amber-400 / amber-950 | warning, reminder, approaching limit |
| Danger | rose-600 / rose-50 | rose-400 / rose-950 | error, destructive, danger |
| Info | brand-600 / brand-50 | brand-400 / brand-950 | information, active, interactive |

Semantic mapping must remain stable across the application.

### Financial semantic rule

- Income / positive → emerald
- Warning → amber
- Danger / destructive → rose
- Primary / informational → brand
- Neutral information → slate

Do not color every financial amount red or green automatically. Color must communicate meaning.

---

# 6. Semantic Color Tokens

Use role-based semantic tokens:

```text
background.page
background.surface
background.surface-muted
background.elevated

text.primary
text.secondary
text.muted
text.inverse

border.default
border.subtle
border.focus

action.primary
action.primary-hover
action.primary-active

action.secondary
action.secondary-hover

status.success.text
status.success.surface
status.success.border

status.warning.text
status.warning.surface
status.warning.border

status.danger.text
status.danger.surface
status.danger.border

status.info.text
status.info.surface
status.info.border
```

Set Light and Dark values explicitly.

Do not rely on raw hex values inside page-specific implementations when a semantic token already exists.

---

# 7. Typography System

## 7.1 Font Family

Primary font:

**Plus Jakarta Sans Variable**

Fallback:

```text
ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
"Helvetica Neue", Arial, sans-serif
```

Global text rendering uses antialiasing.

## 7.2 Type Scale

| Token | Size | Typical use |
|---|---:|---|
| micro | 11px | tiny helper / mobile nav label |
| xs | 12px | metadata / labels |
| sm | 14px | body / control / row text |
| md | 16px | larger body / emphasis |
| lg | 18px | secondary display / KPI |
| xl | 20px | KPI / strong section value |
| 2xl | 24px | page title |
| display-sm | 30px | large value |
| display-md | 36px | hero amount |
| display-lg | 48px | large desktop hero amount |

Use the scale consistently. Small exceptions are allowed when a component genuinely requires them.

## 7.3 Weight Scale

| Weight | Use |
|---|---|
| 400 | body / secondary |
| 500 | labels / medium emphasis |
| 600 | strong UI text / amounts / card titles |
| 700 | headings / major display values |

## 7.4 Global Typography Roles

### Page title

- 24px
- 700
- tracking-tight

### Section / card title

- 14px
- 600

### Body

- 14px
- 400

### Secondary / metadata

- 12px
- 400

### Label

- 12–14px
- 500

### Display amount

- 30–48px
- 700
- tracking-tight
- tabular-nums

### Numeric rule

All monetary figures use `tabular-nums`.

Large monetary figures use `tracking-tight`.

Signed monetary values use explicit `+` or `-` where semantic context requires it.

---

# 8. Typography Usage Rules

Hierarchy should generally follow:

1. display
2. page title
3. section/card title
4. primary content
5. secondary content
6. metadata
7. micro information

Do not use color alone as the only method of hierarchy.

Use combinations of size, weight, contrast, and spacing.

Avoid arbitrary font sizes when an existing token satisfies the need.

---

# 9. Spacing System

Base unit: **4px**.

Official scale:

| Token | Value |
|---|---:|
| 0.5 | 2px |
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 5 | 20px |
| 6 | 24px |
| 8 | 32px |
| 10 | 40px |
| 14 | 56px |
| 16 | 64px |
| 24 | 96px |
| 28 | 112px |

2px exists as a micro-spacing exception.

## Typical usage

| Context | Default |
|---|---:|
| Small icon ↔ text | 8px |
| Standard icon ↔ text | 12px |
| Compact row internal gap | 12px |
| Card internal spacing | 16–20px |
| Large card padding | 20–24px |
| Section spacing | 16–20px |
| Page spacing | 20–32px |

Use the nearest existing token instead of inventing values.

---

# 10. Radius System

| Token | Value | Typical usage |
|---|---:|---|
| radius-sm | 8px | small icon button / compact element |
| radius-md | 12px | input / button / icon chip |
| radius-lg | 16px | card / modal / major surface |
| radius-pill | 999px | badge / avatar / pill |

Default rules:

- cards → 16px
- modals → 16px
- buttons → 12px
- inputs/selects → 12px
- standard icon chips → 12px
- compact icon chips → 8px
- badges → pill

Do not introduce arbitrary radius values without a clear shared use case.

---

# 11. Border System

Default border thickness: **1px**.

### Light

- outer border → `slate-200` / `slate-200/80`
- inner divider → `slate-100`

### Dark

- outer border → `slate-800`
- inner divider → `slate-800`

Use hairline dividers for lists and internal sections.

Avoid heavy outlines unless a component explicitly requires stronger separation.

---

# 12. Elevation / Shadow System

CATATIN uses soft elevation.

### Primary elevation

`shadow-card`

Current v2 baseline:

```css
0 1px 2px rgb(15 23 42 / 0.04),
0 8px 24px -12px rgb(15 23 42 / 0.12)
```

### Interactive elevation

`shadow-card-hover`

Current v2 baseline:

```css
0 2px 4px rgb(15 23 42 / 0.06),
0 16px 40px -16px rgb(30 58 138 / 0.22)
```

Rules:

- default card → `shadow-card`
- interactive elevated card → `shadow-card-hover`
- do not stack multiple strong shadows
- list rows generally do not need elevation

---

# 13. Icon System

## 13.1 Library

Primary icon library:

**Phosphor Icons**

Do not mix icon families by default.

## 13.2 Weight by Role

| Role | Preferred weight |
|---|---|
| Action / row icon | bold |
| Navigation | bold |
| Section / decorative | duotone |
| Tertiary / utility | regular/default |

Weight is contextual rather than mechanically fixed.

## 13.3 Icon Size Scale

| Token | Size |
|---|---:|
| xs | 14px |
| sm | 16px |
| md | 18px |
| lg | 20px |
| xl | 24px |
| 2xl | 26px |
| display | 28px |

Do not randomly mix sizes inside the same interaction group.

## 13.4 Icon Containers

Typical container sizes:

| Container | Size | Use |
|---|---:|---|
| small | 32px | compact action |
| standard | 40px | row / status |
| large | 44–48px | feature / section |
| FAB | 56px | primary mobile action |

---

# 14. Component Sizing Baseline

Global sizing baseline:

| Element | Default |
|---|---:|
| Small icon button | 32–36px |
| Standard icon button | 40px |
| Input / Select | 44px |
| Standard button | 36–44px |
| Large button | 48px |
| Standard list row | ≥56px |
| FAB | 56px |

Component-specific specifications may refine these values, but should remain visually consistent with the global baseline.

---

# 15. Responsive System

Global breakpoints:

| Breakpoint | Width | Role |
|---|---:|---|
| mobile | <640px | compact/mobile layout |
| sm | ≥640px | intermediate / tablet-ish transition |
| lg | ≥1024px | desktop layout |

The current v2 visual system primarily uses `sm` and `lg`; no global `md` breakpoint is required unless a future shared component introduces a genuine need.

## Mobile

Prioritize:

- touch usability
- readable hierarchy
- stacking
- controlled horizontal padding
- compact but comfortable density

## sm+

Allow:

- multi-column controls
- wider content
- desktop-oriented actions when appropriate

## lg+

Allow:

- desktop navigation
- multi-column content
- increased horizontal page padding
- denser information layouts

Responsive behavior may differ by component, but the visual language must remain the same.

---

# 16. Responsive Typography

Typography generally remains stable across breakpoints.

Only display-scale elements may grow on larger viewports.

Example:

```text
Hero amount: 36px → 48px
```

Normal body, control, metadata, and card text should generally remain stable.

---

# 17. Light Mode

Light mode character:

- cool
- clean
- calm
- readable
- neutral-first
- soft separation

Default:

```text
page background → slate-50
surface → white
primary text → slate-900
border → slate-200
muted → slate-400/500
```

Avoid excessive white-on-white nesting without clear hierarchy.

---

# 18. Dark Mode

Dark mode is a first-class theme, not a simple inversion.

Maintain the same:

- semantic meaning
- typography hierarchy
- shape
- spacing
- component structure
- brand identity

Default:

```text
page background → slate-950
surface → slate-900
border → slate-800
primary text → white/slate-100
secondary → slate-200/300
muted → slate-400/500
```

Dark-mode semantic colors must use explicit dark values rather than arbitrary inversion.

---

# 19. Interaction States

Global interaction sequence:

```text
Default
  ↓
Hover
  ↓
Active
  ↓
Focus
  ↓
Disabled
```

Use subtle visual transitions.

Typical behavior:

- hover → background/text/elevation change
- active → slightly stronger tint or pressed treatment
- focus → visible brand focus ring
- disabled → reduced opacity and unavailable interaction

Interaction should feel responsive but restrained.

---

# 20. Motion Principles

Motion should be:

- subtle
- useful
- short
- non-distracting

Use animation for:

- expansion/collapse
- navigation feedback
- state transition
- hover/press feedback

Do not use animation only for decoration.

Respect `prefers-reduced-motion` globally.

---

# 21. Accessibility Baseline

The system targets a basic accessibility baseline.

Global expectations:

- maintain readable contrast
- preserve visible focus states
- use sufficiently large touch targets
- do not rely on color alone for meaning
- preserve semantic distinction with text, icon, label, or structure
- respect reduced-motion preferences

Page-specific specifications may require stronger accessibility treatment.

---

# 22. Numeric & Financial Display

All monetary values:

- use tabular numerals
- use IDR formatting
- use no unnecessary decimal digits
- preserve alignment
- use explicit sign when the context requires it

Baseline examples:

```text
+Rp 8.900.000
-Rp 450.000
Rp 12.000
```

Existing v2 uses Indonesian locale formatting with IDR and zero decimal places.

---

# 23. Financial Semantic Rules

### Income

- semantic: success
- default color: emerald
- may use `+` sign when context requires

### Expense

Expense does **not automatically mean danger**.

Use neutral slate when the amount is simply an expense value.

Use rose only when the UI intends to communicate:

- danger
- error
- destructive action
- negative state

### Warning

Use amber for:

- approaching limit
- due state
- reminder
- caution

### Primary information

Use brand blue for:

- primary action
- informational emphasis
- active state
- interactive identity

---

# 24. Shared Component Relationship

Global Design System does not replace component specifications.

Shared components should inherit global tokens.

Examples of shared components:

- PageHeader
- Card / CardHeader
- Button
- Input
- Select
- Badge
- Progress
- IconButton
- Modal
- EmptyState
- LoadingState / Skeleton
- ErrorState
- Navigation

The component specification defines behavior and exact composition.

The Global Design System defines the visual rules the component must inherit.

---

# 25. Page-Specific Relationship

Page specifications may define:

- information hierarchy
- page layout
- grid composition
- specific widget arrangement
- menu-specific components
- page-specific responsive behavior

Page specifications must **not silently redefine**:

- brand identity
- primary font
- global color meaning
- radius language
- spacing philosophy
- icon family
- elevation philosophy

If a page requires a new visual treatment, it should either:

1. use an existing global token/component, or
2. create a reusable shared rule, or
3. explicitly request a new global rule.

---

# 26. Do / Don't

## DO

- use official tokens
- reuse semantic colors
- reuse global radius
- use Plus Jakarta Sans
- use Phosphor Icons
- preserve the v2 character
- use restrained color
- use soft elevation
- keep mobile and desktop visually related
- reuse shared components
- keep hierarchy clear

## DON'T

- invent random colors
- invent arbitrary font sizes
- introduce another icon family without approval
- create arbitrary shadows
- mix unrelated radius values
- add gradients only for decoration
- use multiple unrelated visual languages
- create page-specific styling that conflicts with global rules
- silently add new tokens

---

# 27. AI IMPLEMENTATION RULES

This section is mandatory when an AI agent creates or modifies CATATIN UI.

## Rule 1 — Follow the system first

Always use this document before inventing a new visual treatment.

## Rule 2 — Reuse tokens

Prefer existing tokens over raw values.

## Rule 3 — Reuse components

Prefer existing shared components over custom recreations.

## Rule 4 — Preserve global semantics

Never change the meaning of brand, success, warning, danger, info, or neutral colors for a single page without explicit approval.

## Rule 5 — Page customization is allowed

A page may have its own layout and information architecture while inheriting the global visual language.

## Rule 6 — No silent system expansion

Do not silently introduce a new:

- color
- font
- radius
- spacing value
- icon family
- shadow
- breakpoint

when an existing rule is adequate.

## Rule 7 — Ask before new visual rules

When a required design decision is not covered by this document and cannot reasonably use an existing rule, **ask the user before creating a new visual rule**.

## Rule 8 — New tokens need a reusable reason

A new token is justified only when:

- it represents a recurring pattern
- it will likely be reused
- the current system cannot express the requirement cleanly

## Rule 9 — Do not overdesign

When uncertain, prefer the simpler treatment that matches v2.

## Rule 10 — Preserve consistency over novelty

A new page should look like it belongs to CATATIN before it looks visually different.

---

# 28. AI Decision Order

When generating UI, use this decision order:

1. Check whether an existing shared component can be reused.
2. Check whether an existing global token solves the visual requirement.
3. Check whether the page specification already defines the behavior.
4. Combine existing rules rather than inventing a new one.
5. If no suitable rule exists, ask before expanding the system.

When two rules conflict, prioritize:

1. accessibility
2. semantic meaning
3. global design tokens
4. shared components
5. page-specific layout
6. decorative treatment

---

# 29. Design System Health Check

Before finalizing a UI implementation, verify:

- [ ] Font belongs to the global typography system.
- [ ] Font size uses an existing type token.
- [ ] Font weight uses the approved weight scale.
- [ ] Brand/semantic colors follow global meaning.
- [ ] Light and dark values are both defined.
- [ ] Radius uses the approved scale.
- [ ] Spacing uses the approved scale.
- [ ] Borders remain subtle and 1px.
- [ ] Elevation uses the approved shadow system.
- [ ] Icons use Phosphor and an appropriate role-based weight.
- [ ] Mobile and desktop remain visually related.
- [ ] Monetary values use tabular numerals.
- [ ] Existing shared components were reused when possible.
- [ ] No silent new visual token was introduced.

---

# 30. Global CATATIN Visual Signature

CATATIN is defined by:

**Plus Jakarta Sans**  
+
**Phosphor Icons**  
+
**Slate Neutral**  
+
**Blue Brand**  
+
**Emerald / Amber / Rose Semantic Colors**  
+
**4px Spacing Base**  
+
**8 / 12 / 16 / Pill Radius**  
+
**Soft Card Elevation**  
+
**Hairline Borders**  
+
**Moderate Density**  
+
**Unified Mobile + Desktop Language**  
+
**First-class Light + Dark Themes**

The goal is not to make every page visually impressive in isolation.

The goal is to make every page unmistakably belong to the same CATATIN product.

---

# 31. Relationship to Current CATATIN v2 Specs

The current v2 specifications already establish recurring global patterns such as:

- Plus Jakarta Sans Variable
- Phosphor Icons
- one blue brand accent
- slate neutral system
- emerald / rose / amber semantic usage
- 4px-based spacing
- 8px / 12px / 16px / pill radius hierarchy
- soft card elevation
- tabular numerals
- mobile-first responsive behavior

Those recurring values belong at the global layer.

Transaction-specific patterns such as transaction rows, day grouping, and transaction filters remain in the Transaction Content Design Specification.

Report-specific patterns such as KPI strips, BarBreakdown, MerchantCard, BillsCard, and report ordering remain in the Report Content Design Specification.

The global file therefore acts as the visual foundation rather than replacing page-specific design documents.

---

# 32. Final Rule

**When in doubt, preserve CATATIN's existing visual language rather than inventing a new one.**

Consistency across the application is more important than visual novelty on a single screen.
