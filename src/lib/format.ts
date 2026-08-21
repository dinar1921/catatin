const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 1250000 -> "Rp1.250.000"; -2500000 -> "-Rp2.500.000" */
export function formatIDR(n: number): string {
  return (n < 0 ? "-" : "") + "Rp" + idr.format(Math.round(Math.abs(n)));
}

/** -402000 -> "−Rp 402.000"; 1378000 -> "+Rp 1.378.000"; 0 -> "Rp 0" (tanda tipografis + spasi) */
export function formatIDRSigned(n: number): string {
  if (n === 0) return "Rp " + idr.format(0);
  const sign = n < 0 ? "−" : "+";
  return `${sign}Rp ${idr.format(Math.round(Math.abs(n)))}`;
}

/** 1250000 -> "1,25 jt"; 350000 -> "350 rb" (untuk list mobile/compact) */
export function formatIDRShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} rb`;
  return sign + idr.format(abs);
}

function trim(x: number): string {
  return x.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const SATUAN: [number, string][] = [
  [1_000_000_000_000, "triliun"],
  [1_000_000_000, "miliar"],
  [1_000_000, "juta"],
  [1_000, "ribu"],
];

const ANGKA: [number, string][] = [
  [100, "seratus"],
  [90, "sembilan puluh"],
  [80, "delapan puluh"],
  [70, "tujuh puluh"],
  [60, "enam puluh"],
  [50, "lima puluh"],
  [40, "empat puluh"],
  [30, "tiga puluh"],
  [20, "dua puluh"],
  [19, "sembilan belas"],
  [18, "delapan belas"],
  [17, "tujuh belas"],
  [16, "enam belas"],
  [15, "lima belas"],
  [14, "empat belas"],
  [13, "tiga belas"],
  [12, "dua belas"],
  [11, "sebelas"],
  [10, "sepuluh"],
  [9, "sembilan"],
  [8, "delapan"],
  [7, "tujuh"],
  [6, "enam"],
  [5, "lima"],
  [4, "empat"],
  [3, "tiga"],
  [2, "dua"],
  [1, "satu"],
];

function kata(n: number): string {
  if (n === 0) return "nol";
  let s = "";
  let x = n;
  if (x >= 100) {
    const r = Math.floor(x / 100);
    s += r === 1 ? "seratus" : ANGKA.find(([v]) => v === r)?.[1] + " ratus";
    x %= 100;
    if (x > 0) s += " ";
  }
  for (const [v, t] of ANGKA) {
    if (x >= v) {
      s += t;
      x -= v;
      if (x > 0) s += " ";
    }
  }
  return s;
}

/** 1250000 -> "satu juta dua ratus lima puluh ribu rupiah" */
export function terbilang(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs === 0) return "nol rupiah";
  let s = "";
  let x = abs;
  for (const [v, t] of SATUAN) {
    if (x >= v) {
      const q = Math.floor(x / v);
      s += (q === 1 ? "se" + t : kata(q) + " " + t) + " ";
      x %= v;
    }
  }
  if (x > 0) s += kata(x) + " ";
  return s.trim() + " rupiah";
}
