import type { SQLInputValue } from "node:sqlite";

/** Konversi nilai unknown/undefined menjadi nilai yang diterima node:sqlite. */
export function sv(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

/** Konversi array parameter. */
export function svs(arr: readonly unknown[]): SQLInputValue[] {
  return arr.map(sv);
}

/** Generate ID unik (tahan restart server, tanpa counter). */
export function nid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
