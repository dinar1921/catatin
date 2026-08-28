import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, WarningCircle, Info, CaretLeft, CaretRight, CaretDown } from "@phosphor-icons/react";
import { formatIDR, terbilang } from "../lib/format";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ================================================================== */
/*  Button — V2 spec §13: rounded-xl, brand-600 primary, active press  */
/* ================================================================== */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";

const btnStyles: Record<BtnVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98] shadow-sm",
  secondary:
    "bg-white text-ink border border-slate-200 hover:border-brand-500/50 hover:text-brand-700 active:scale-[0.98] dark:bg-slate-900 dark:border-slate-800",
  ghost: "text-ink-muted hover:text-ink hover:bg-slate-100 active:scale-[0.98] dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:scale-[0.98] dark:bg-brand-950 dark:text-brand-300",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}) {
  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none",
        btnStyles[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
    />
  );
}

/* ================================================================== */
/*  Form fields — V2 spec §13: rounded-xl, brand focus ring            */
/* ================================================================== */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white",
          className,
        )}
      >
        {children}
      </select>
      <CaretDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
    </div>
  );
}

/* ================================================================== */
/*  AmountInput — IDR + terbilang                                      */
/* ================================================================== */
export function AmountInput({
  value,
  onChange,
  placeholder = "0",
  showTerbilang = true,
  compact,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  showTerbilang?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Simpan digit mentah di state lokal agar caret tidak "lompat" ke akhir
  // setiap kali format ulang (mis. "1000" -> "1.000") — perbaikan bug input nominal.
  const [digits, setDigits] = useState(value === 0 ? "" : String(value));

  // Sinkronkan dari luar (reset/reset form) hanya saat field tidak sedang difokus.
  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setDigits(value === 0 ? "" : String(value));
    }
  }, [value]);

  const display = digits === "" ? "" : Number(digits).toLocaleString("id-ID");

  const commit = (raw: string) => {
    const el = ref.current;
    const caretInRaw = el?.selectionStart ?? raw.length;
    const d = raw.replace(/\D/g, "").slice(0, 15); // batasi panjang digit (hindari presisi hilang)

    setDigits(d);
    onChange(d ? parseInt(d, 10) : 0);

    // Pulihkan posisi kursor setelah reformat (hitung ulang dari prefix digit).
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      const prefixDigits = d.slice(0, caretInRaw);
      const formattedPrefix = prefixDigits === "" ? "" : Number(prefixDigits).toLocaleString("id-ID");
      const pos = formattedPrefix.length;
      node.setSelectionRange(pos, pos);
    });
  };

  return (
    <div>
      <div className="relative">
        <span className={cn("absolute left-3 top-1/2 -translate-y-1/2 font-bold text-ink-muted", compact ? "text-sm" : "text-lg")}>Rp</span>
        <input
          ref={ref}
          inputMode="numeric"
          value={display}
          onChange={(e) => commit(e.target.value)}
          onFocus={() => setDigits(value === 0 ? "" : String(value))}
          placeholder={placeholder}
          className={cn(
            "tnum w-full rounded-xl border border-slate-200 bg-white font-bold text-ink placeholder:font-normal placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white",
            compact ? "h-11 pl-9 pr-3 text-sm" : "h-14 pl-12 pr-3 text-xl",
          )}
        />
      </div>
      {showTerbilang && value > 0 && value <= Number.MAX_SAFE_INTEGER && (
        <p className="mt-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">{terbilang(value)}</p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Card + CardHeader — V2 spec §9: shadow-card, rounded-2xl           */
/* ================================================================== */
export function Card({
  className,
  children,
  onClick,
  padded = true,
  interactive,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  padded?: boolean;
  interactive?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  const isInteractive = interactive ?? !!onClick;
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white text-left dark:border-slate-800 dark:bg-slate-900",
        padded && "p-4 sm:p-5",
        isInteractive &&
          "transition-all duration-150 hover:shadow-card-hover active:scale-[0.995] cursor-pointer",
        !isInteractive && "shadow-card",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-ink dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ================================================================== */
/*  Badge — V2 spec §13: rounded-full, semantic variants               */
/* ================================================================== */
type BadgeVariant = "default" | "income" | "expense" | "warning" | "danger" | "neutral";

const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
  income: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function Badge({
  variant = "neutral",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 min-h-6 text-xs font-semibold",
        badgeStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ================================================================== */
/*  Skeleton & EmptyState & ErrorState & LoadingState — V2 spec §13    */
/* ================================================================== */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800", className)} />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-faint dark:bg-slate-800">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="max-w-[30ch] text-xs text-ink-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  icon,
  title,
  message,
  onRetry,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950 dark:text-rose-400">
        {icon ?? <WarningCircle size={28} weight="duotone" />}
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-[36ch] text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  ProgressBar — V2 spec §13: h-1.5 (6px), rounded-full              */
/* ================================================================== */
export function ProgressBar({
  pct,
  tone = "brand",
  className,
}: {
  pct: number;
  tone?: "brand" | "income" | "expense" | "warn" | "neutral";
  className?: string;
}) {
  const toneCls =
    tone === "income"
      ? "bg-emerald-600"
      : tone === "expense"
        ? "bg-rose-600"
        : tone === "warn"
          ? "bg-amber-500"
          : tone === "neutral"
            ? "bg-slate-400"
            : "bg-brand-600";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", toneCls)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/* ================================================================== */
/*  Tabs / Segmented control — V2 spec §13                             */
/* ================================================================== */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-all",
            value === t.id
              ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Sheet — bottom-sheet mobile, centered dialog sm+ (V2 spec §13)     */
/* ================================================================== */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  fullScreen,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  dismissable?: boolean;
}) {
  const [mobile, setMobile] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setMobile(mq.matches);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // R07-C: initial focus + focus trap + focus restoration.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      // Fokus elemen pertama setelah panel dirender (sedikit delay untuk layout).
      window.setTimeout(() => first?.focus(), 30);
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const p = panelRef.current;
      if (!p) return;
      const focusables = p.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleTab);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleTab);
      document.removeEventListener("keydown", handleEscape);
      // Fokus kembali ke elemen pemicu setelah tutup.
      triggerRef.current?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const panel = (
    <>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {dismissable && (
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
      {footer && (
        <div className="mt-5 flex gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          {footer}
        </div>
      )}
    </>
  );

  if (mobile) {
    // Mobile: bottom sheet / full-height sheet (flowchart rule).
    return (
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <div
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          onClick={dismissable ? onClose : undefined}
        />
        <div
          ref={panelRef}
          className={cn(
            "absolute inset-x-0 bottom-0 mx-auto flex w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900",
            fullScreen ? "h-[92dvh]" : "max-h-[88dvh]",
          )}
        >
          {panel}
        </div>
      </div>
    );
  }

  // Desktop / tablet: centered modal.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900",
          fullScreen ? "h-[88dvh]" : "max-h-[88dvh]",
        )}
      >
        {panel}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Dropdown — anchored popover for header menus (filter-style)        */
/* ================================================================== */
export function Dropdown({
  open,
  onClose,
  anchorRef,
  title,
  children,
  footer,
  width = 360,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelW = panelRef.current?.offsetWidth ?? width;
    let left = align === "right" ? rect.right - panelW : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    setPos({ top: rect.bottom + 8, left });
  }, [anchorRef, align, width]);

  useEffect(() => {
    if (!open || mobile) return;
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, mobile, measure, onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  if (mobile) {
    return createPortal(
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
        <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900">
          {title && (
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-base font-semibold text-ink dark:text-white">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && (
            <div className="mt-5 flex gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              {footer}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width: Math.min(width, window.innerWidth - 16),
        }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-ink dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
        {footer && (
          <div className="border-t border-slate-100 p-3 dark:border-slate-800">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Hapus",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-ink-muted">{body}</p>
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Batal
        </Button>
        <Button variant={danger ? "danger" : "primary"} fullWidth onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

/* ================================================================== */
/*  Avatar                                                              */
/* ================================================================== */
export function Avatar({
  name,
  color,
  size = 36,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ================================================================== */
/*  Toast — V2 spec: success=emerald, error=rose, info=brand           */
/* ================================================================== */
type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{
  push: (kind: ToastKind, message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-70 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-ink shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="status"
          >
            {t.kind === "success" && <CheckCircle size={18} className="shrink-0 text-emerald-600" weight="fill" />}
            {t.kind === "error" && <WarningCircle size={18} className="shrink-0 text-rose-600" weight="fill" />}
            {t.kind === "info" && <Info size={18} className="shrink-0 text-brand-600" weight="fill" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}

/* ================================================================== */
/*  Money — formatted amount                                           */
/* ================================================================== */
export function Money({
  value,
  className,
  sign,
}: {
  value: number;
  className?: string;
  sign?: boolean;
}) {
  return (
    <span className={cn("tnum", className)}>
      {sign && value > 0 ? "+" : ""}
      {formatIDR(value)}
    </span>
  );
}

/* ================================================================== */
/*  Pagination — usePagination hook + pager UI                         */
/* ================================================================== */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    total,
    totalPages,
    setPage,
  };
}

export function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const set = new Set<number>([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1]);
    [...set]
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b)
      .forEach((p, idx, arr) => {
        if (idx > 0 && p - arr[idx - 1] > 1) pages.push("…");
        pages.push(p);
      });
  }

  const baseBtn =
    "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors";

  return (
    <nav
      aria-label="Paginasi"
      className={cn("mt-4 flex flex-wrap items-center justify-center gap-1", className)}
    >
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className={cn(
          baseBtn,
          "gap-1 text-ink-muted hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800",
        )}
      >
        <CaretLeft size={14} weight="bold" />
        <span className="hidden sm:inline">Sebelumnya</span>
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="flex h-9 items-center px-1 text-sm text-ink-faint">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              baseBtn,
              p === page
                ? "bg-brand-600 text-white shadow-sm"
                : "text-ink-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800",
            )}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className={cn(
          baseBtn,
          "gap-1 text-ink-muted hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800",
        )}
      >
        <span className="hidden sm:inline">Berikutnya</span>
        <CaretRight size={14} weight="bold" />
      </button>
    </nav>
  );
}
