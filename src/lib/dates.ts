import type { PeriodFilter } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

export function endOfMonthISO(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toISO(last);
}

export function previousMonthISO(): string {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${pad(p.getMonth() + 1)}-01`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function periodRange(f: PeriodFilter): { start: string; end: string } {
  switch (f.preset) {
    case "today": {
      const t = todayISO();
      return { start: t, end: t };
    }
    case "7d":
      return { start: addDaysISO(todayISO(), -6), end: todayISO() };
    case "custom":
      return {
        start: f.start ?? startOfMonthISO(),
        end: f.end ?? todayISO(),
      };
    case "month":
    default:
      return { start: startOfMonthISO(), end: todayISO() };
  }
}

export function inRange(iso: string, start: string, end: string): boolean {
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

export const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]}`;
}

export function fmtDateID(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function fmtFullDateID(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d.getDay()];
  return `${hari}, ${fmtDateID(iso)}`;
}

export function fmtPeriodLabel(f: PeriodFilter): string {
  switch (f.preset) {
    case "today":
      return "Hari ini";
    case "7d":
      return "7 hari terakhir";
    case "month":
      return "Bulan ini";
    case "custom":
      return `${fmtDayMonth(f.start ?? "")} – ${fmtDayMonth(f.end ?? "")}`;
  }
}

export function dueLabel(dueDay: number | null, dueDate: string | null): string {
  if (dueDate) return `Jatuh tempo ${fmtDateID(dueDate)}`;
  if (dueDay != null) return `Jatuh tempo tgl ${dueDay}`;
  return "";
}
