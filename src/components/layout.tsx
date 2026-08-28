import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  House,
  ArrowsLeftRight,
  Receipt,
  Wallet as WalletIcon,
  CurrencyCircleDollar,
  ChartBar,
  CheckSquare,
  UserCircle,
  GearSix,
  Bell,
  FunnelSimple,
  Camera,
  PencilSimple,
  Moon,
  Sun,
  X,
  CaretDown,
  Check,
  Plus,
  List,
} from "@phosphor-icons/react";
import { useApp } from "../data/store";
import { memberById } from "../lib/derive";
import { Avatar, Button, Card, cn, Dropdown, EmptyState, Sheet } from "./ui";
import type { FilterState } from "../lib/types";
import { fmtPeriodLabel, todayISO } from "../lib/dates";

/* ================================================================== */
/*  ThemeSync                                                          */
/* ================================================================== */
export function ThemeSync() {
  const { theme } = useApp();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}

/* ================================================================== */
/*  Filter context                                                      */
/* ================================================================== */
const FilterCtx = createContext<{
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  openFilter: () => void;
} | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterState>({
    period: { preset: "month", start: null, end: null },
    profileId: "all",
    type: "all",
    categoryId: "",
    walletId: "",
  });
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  return (
    <FilterCtx.Provider value={{ filter, setFilter, openFilter: () => setOpen(true) }}>
      <FilterPanel open={open} onClose={() => setOpen(false)} value={filter} onChange={setFilter} />
      {children}
    </FilterCtx.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilter harus dipakai di dalam FilterProvider");
  return ctx;
}

/* ================================================================== */
/*  Nav definitions                                                     */
/* ================================================================== */
const navMain = [
  { to: "/dashboard", label: "Beranda", icon: House },
  { to: "/transactions", label: "Transaksi", icon: ArrowsLeftRight },
  { to: "/bills", label: "Tagihan", icon: Receipt },
  { to: "/wallets", label: "Wallet", icon: WalletIcon },
  { to: "/budget", label: "Budget", icon: CurrencyCircleDollar },
  { to: "/reports", label: "Laporan", icon: ChartBar },
  { to: "/approvals", label: "Persetujuan", icon: CheckSquare },
];

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
          isActive
            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
            : "text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800",
        )
      }
    >
      <Icon size={20} weight="duotone" />
      {label}
    </NavLink>
  );
}

/* ================================================================== */
/*  Sidebar — V2 spec §4: w-64, sticky, hidden below lg                 */
/* ================================================================== */
function Sidebar() {
  const { theme, toggleTheme, sessionProfileId, data } = useApp();
  const me = memberById(data, sessionProfileId);
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
      {/* Logo */}
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <img src="/logo-catatin.png" alt="Logo Catatin" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-lg font-extrabold tracking-tight text-ink">
            Cata<span className="text-brand-600">tin</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{data.group.name}</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navMain.map((n) => (
          <NavItem key={n.to} {...n} />
        ))}
        <div className="my-3 border-t border-slate-100 dark:border-slate-800" />
        <NavItem to="/profile" icon={UserCircle} label="Profile" />
        <NavItem to="/settings" icon={GearSix} label="Settings" />
        <NavItem to="/add?mode=manual" icon={Plus} label="Tambah Transaksi" />
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-200/80 p-3 dark:border-slate-800">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          {me && <Avatar name={me.name} color={me.color} size={32} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{me?.name}</p>
            <p className="truncate text-[11px] text-ink-muted">
              {me?.role === "admin" ? "Admin" : "Anggota"}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Ganti tema"
            className="rounded-lg p-2 text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ================================================================== */
/*  MobileNav — Beranda | Transaksi | + | Laporan | Setting            */
/* ================================================================== */
function TabLink({ tab }: { tab: { to: string; label: string; icon: React.ElementType } }) {
  return (
    <NavLink
      to={tab.to}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
          isActive ? "text-brand-600" : "text-ink-muted hover:text-ink",
        )
      }
    >
      <tab.icon size={22} weight="duotone" />
      <span>{tab.label}</span>
    </NavLink>
  );
}

function MobileNav() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const tabs = [
    { to: "/dashboard", label: "Beranda", icon: House },
    { to: "/transactions", label: "Transaksi", icon: ArrowsLeftRight },
    { to: "/bills", label: "Tagihan", icon: Receipt },
    { to: "/settings", label: "Lainnya", icon: GearSix },
  ];

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-slate-800 dark:bg-slate-900/90 dark:supports-[backdrop-filter]:bg-slate-900/80 lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {tabs.slice(0, 2).map((t) => (
            <TabLink key={t.to} tab={t} />
          ))}
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Tambah transaksi"
              className="absolute -top-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-fab ring-2 ring-white transition-transform active:scale-95 dark:ring-slate-900"
            >
              <Plus size={26} weight="bold" />
            </button>
          </div>
          {tabs.slice(2).map((t) => (
            <TabLink key={t.to} tab={t} />
          ))}
        </div>
      </nav>

      {/* Add action sheet */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Transaksi">
        <div className="grid gap-3">
          <Card
            onClick={() => {
              setAddOpen(false);
              navigate("/scan");
            }}
            interactive
            className="flex items-center gap-4"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
              <Camera size={24} weight="duotone" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Scan Struk</p>
              <p className="text-xs text-ink-muted">Foto struk, biar AI yang mencatat</p>
            </div>
          </Card>
          <Card
            onClick={() => {
              setAddOpen(false);
              navigate("/add?mode=manual");
            }}
            interactive
            className="flex items-center gap-4"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              <PencilSimple size={24} weight="duotone" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Input Manual</p>
              <p className="text-xs text-ink-muted">Catat pemasukan atau pengeluaran</p>
            </div>
          </Card>
        </div>
      </Sheet>
    </>
  );
}

/* ================================================================== */
/*  MobileMenu — left slide-in drawer                                  */
/* ================================================================== */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme, sessionProfileId, data } = useApp();
  const me = memberById(data, sessionProfileId);

  const items = [
    { to: "/bills", label: "Tagihan", icon: Receipt },
    { to: "/wallets", label: "Wallet", icon: WalletIcon },
    { to: "/budget", label: "Budget", icon: CurrencyCircleDollar },
    { to: "/reports", label: "Laporan", icon: ChartBar },
    { to: "/approvals", label: "Persetujuan", icon: CheckSquare },
    { to: "/profile", label: "Profile", icon: UserCircle },
  ];

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="rounded-xl border border-slate-200 bg-white p-2.5 text-ink-muted dark:border-slate-700 dark:bg-slate-900 dark:hover:text-ink"
      >
        <List size={20} weight="bold" />
      </button>

      {createPortal(
        <div
          className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")}
          aria-hidden={!open}
          role="dialog"
          aria-modal={open}
          aria-label="Menu navigasi"
        >
          <div
            className={cn(
              "absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300",
              open ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ease-out dark:bg-slate-900",
              open ? "translate-x-0" : "-translate-x-full",
            )}
          >
            {/* Header — logo + group + close */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-4 pt-6 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <img src="/logo-catatin.png" alt="Logo Catatin" className="h-8 w-8 rounded-lg object-cover" />
                <div>
                  <span className="text-lg font-extrabold tracking-tight text-ink">
                    Cata<span className="text-brand-600">tin</span>
                  </span>
                  <p className="text-[11px] text-ink-muted">{data.group.name}</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      isActive
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                        : "text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800",
                    )
                  }
                >
                  <it.icon size={20} weight="duotone" />
                  {it.label}
                </NavLink>
              ))}
            </nav>

            {/* Footer — user, theme toggle */}
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                {me && <Avatar name={me.name} color={me.color} size={32} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{me?.name}</p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {me?.role === "admin" ? "Admin" : "Anggota"}
                  </p>
                </div>
                <button
                  onClick={toggleTheme}
                  aria-label="Ganti tema"
                  className="rounded-lg p-2 text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ================================================================== */
/*  Group / Profile selector                                            */
/* ================================================================== */
export function GroupProfileSelector({ className }: { className?: string }) {
  const { data, activeProfileId, setActiveProfile } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const active =
    activeProfileId === "all"
      ? "Semua Anggota"
      : memberById(data, activeProfileId)?.name ?? "Semua Anggota";

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
          className,
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600 text-[11px] font-bold text-white">
          {data.group.name.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[120px] truncate text-[11px] leading-tight text-ink-muted">
            {data.group.name}
          </span>
          <span className="block text-sm font-bold leading-tight text-ink">{active}</span>
        </span>
        <CaretDown size={14} className="text-ink-faint" />
      </button>

      <Dropdown
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        title="Konteks tampilan"
        align="left"
        width={340}
      >
        <p className="mb-3 px-1 text-sm text-ink-muted">
          Pilih data yang ditampilkan: semua anggota atau satu profile. Berlaku untuk dashboard,
          transaksi, tagihan, dan laporan.
        </p>
        <div className="grid gap-1.5">
          <button
            onClick={() => {
              setActiveProfile("all");
              setOpen(false);
            }}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              activeProfileId === "all"
                ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
                : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {data.group.name.slice(0, 1)}
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-ink">Semua Anggota</p>
              <p className="text-xs text-ink-muted">
                Gabungan {data.members.length} profile
              </p>
            </div>
            {activeProfileId === "all" && (
              <Check size={18} className="text-brand-600" weight="bold" />
            )}
          </button>
          {data.members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setActiveProfile(m.id);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                activeProfileId === m.id
                  ? "border-brand-600 bg-brand-50 dark:bg-brand-950"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
              )}
            >
              <Avatar name={m.name} color={m.color} size={36} />
              <div className="flex-1">
                <p className="text-sm font-bold text-ink">{m.name}</p>
                <p className="text-xs text-ink-muted">
                  {m.role === "admin" ? "Admin" : "Anggota"}
                </p>
              </div>
              {activeProfileId === m.id && (
                <Check size={18} className="text-brand-600" weight="bold" />
              )}
            </button>
          ))}
        </div>
      </Dropdown>
    </>
  );
}

/* ================================================================== */
/*  NotificationBell                                                    */
/* ================================================================== */
export function NotificationBell() {
  const { data, markNotifAllRead } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const unread = data.notifications.filter((n) => !n.read).length;
  const navigate = useNavigate();

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-label="Notifikasi"
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-ink-muted hover:text-ink dark:border-slate-700 dark:bg-slate-900"
      >
        <Bell size={20} weight="duotone" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} title="Notifikasi" width={380}>
        {data.notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={40} />}
            title="Tidak ada notifikasi"
            body="Tagihan dan draft yang menunggu akan muncul di sini."
          />
        ) : (
          <div className="grid gap-2">
            {data.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  navigate(n.linkTo);
                  setOpen(false);
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  n.read
                    ? "border-slate-100 bg-white opacity-70 dark:border-slate-800 dark:bg-slate-900"
                    : "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/50",
                )}
              >
                <p className="text-sm font-bold text-ink">{n.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>
              </button>
            ))}
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markNotifAllRead} className="self-end">
                Tandai semua dibaca
              </Button>
            )}
          </div>
        )}
      </Dropdown>
    </>
  );
}

/* ================================================================== */
/*  FilterPanel                                                         */
/* ================================================================== */
export function FilterPanel({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const { data } = useApp();
  const [draft, setDraft] = useState<FilterState>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = (patch: Partial<FilterState>) => setDraft((d) => ({ ...d, ...patch }));

  const presets: { id: FilterState["period"]["preset"]; label: string }[] = [
    { id: "today", label: "Hari ini" },
    { id: "7d", label: "7 hari terakhir" },
    { id: "month", label: "Bulan ini" },
    { id: "custom", label: "Tanggal spesifik" },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setDraft({
                period: { preset: "month", start: null, end: null },
                profileId: "all",
                type: "all",
                categoryId: "",
                walletId: "",
              });
            }}
          >
            Reset
          </Button>
          <Button
            fullWidth
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Terapkan
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Periode</p>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => set({ period: { preset: p.id, start: null, end: null } })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  draft.period.preset === p.id
                    ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-200 text-ink-muted hover:border-slate-300 dark:border-slate-700",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {draft.period.preset === "custom" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-ink-muted">
                Dari
                <input
                  type="date"
                  value={draft.period.start ?? todayISO()}
                  onChange={(e) =>
                    set({ period: { preset: "custom", start: e.target.value, end: draft.period.end } })
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="block text-xs font-semibold text-ink-muted">
                Sampai
                <input
                  type="date"
                  value={draft.period.end ?? todayISO()}
                  onChange={(e) =>
                    set({ period: { preset: "custom", start: draft.period.start, end: e.target.value } })
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <label className="block text-xs font-semibold text-ink-muted">
            Anggota / Profile
            <select
              value={draft.profileId}
              onChange={(e) => set({ profileId: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">Semua anggota</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-muted">
            Tipe
            <select
              value={draft.type}
              onChange={(e) => set({ type: e.target.value as FilterState["type"] })}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">Pemasukan & pengeluaran</option>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-muted">
            Kategori
            <select
              value={draft.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Semua kategori</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink-muted">
            Wallet
            <select
              value={draft.walletId}
              onChange={(e) => set({ walletId: e.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Semua wallet</option>
              {data.wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/*  FilterChip                                                          */
/* ================================================================== */
export function FilterChip({ filter, onClick }: { filter: FilterState; onClick: () => void }) {
  const { data } = useApp();
  const parts: string[] = [fmtPeriodLabel(filter.period)];
  if (filter.profileId !== "all") parts.push(memberById(data, filter.profileId)?.name ?? "");
  if (filter.type === "income") parts.push("Pemasukan");
  if (filter.type === "expense") parts.push("Pengeluaran");
  const label = parts.filter(Boolean).join(" · ");
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
    >
      <FunnelSimple size={13} weight="fill" />
      {label}
    </button>
  );
}

/* ================================================================== */
/*  PageHeader                                                          */
/* ================================================================== */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="tnum mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ================================================================== */
/*  AppShell — V2 spec §4: sidebar + max-w-5xl + mobile chrome          */
/* ================================================================== */
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, activeProfileId } = useApp();
  const { openFilter } = useFilter();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const hasFilter = ["/dashboard", "/transactions", "/bills", "/reports"].includes(location.pathname);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <ThemeSync />
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header — V2 spec: hidden below lg */}
        <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-slate-200/80 bg-canvas/90 px-6 py-3 backdrop-blur lg:flex dark:border-slate-800 dark:bg-canvas/90">
          <GroupProfileSelector />
          <div className="flex-1" />
          {hasFilter && (
            <button
              onClick={openFilter}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
            >
              <FunnelSimple size={17} />
              Filter
            </button>
          )}
          <NotificationBell />
        </header>

        {/* Mobile header — V2 spec: sticky h-16, blurred translucent */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden dark:border-slate-800 dark:bg-slate-900/90 dark:supports-[backdrop-filter]:bg-slate-900/80">
          <MobileMenu />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink">
              {
                {
                  "/dashboard": "Beranda",
                  "/transactions": "Transaksi",
                  "/bills": "Tagihan",
                  "/wallets": "Wallet",
                  "/budget": "Budget",
                  "/reports": "Laporan",
                  "/approvals": "Persetujuan",
                  "/notifications": "Notifikasi",
                  "/profile": "Profile",
                  "/settings": "Settings",
                }[location.pathname] ?? "Catatin"
              }
            </p>
            <p className="truncate text-[11px] text-ink-muted">
              {data.group.name} · {activeProfileLabel(data, activeProfileId)}
            </p>
          </div>
          {hasFilter && (
            <button
              onClick={openFilter}
              aria-label="Filter"
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-ink-muted dark:border-slate-700 dark:bg-slate-900"
            >
              <FunnelSimple size={19} />
            </button>
          )}
          <NotificationBell />
        </header>

        {/* Main column — V2 spec §4: max-w-5xl, responsive padding */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

function activeProfileLabel(
  data: { members: { id: string; name: string }[] },
  active?: string,
) {
  const a = active ?? "";
  const m = data.members.find((x) => x.id === a);
  return m ? m.name : "Semua Anggota";
}
