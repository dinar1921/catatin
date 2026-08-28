import type { Transaction } from "./types";

/**
 * Logika transfer wallet (presentation layer) — TIDAK mengubah ledger.
 *
 * Backend sengaja membuat DUA baris ledger untuk satu transfer wallet:
 *   transfer_out (expense, wallet asal) + transfer_in (income, wallet tujuan).
 * Helper di file ini memetakan dua baris tersebut menjadi SATU transaksi logis
 * agar UI (list, count, pagination, detail) memperlakukannya sebagai satu
 * pergerakan uang — tanpa mengubah skema database atau semantik finansial.
 */

export interface TransferPair {
  kind: "wallet_transfer";
  outgoing: Transaction; // transfer_out
  incoming: Transaction; // transfer_in
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  occurredAt: string;
  groupId: string;
  createdBy: string;
}

export function isWalletTransfer(t: { source?: string }): boolean {
  return t.source === "transfer_out" || t.source === "transfer_in";
}

/**
 * Deteksi pasangan transfer wallet secara DETERMINISTIK.
 *
 * Dua baris dipasangkan HANYA bila seluruh kondisi terpenuhi:
 * - satu baris transfer_out + satu baris transfer_in
 * - group_id sama
 * - created_by sama
 * - amount sama
 * - occurred_at sama
 * - relasi merchant/description saling melengkapi
 *   (out.description = "Transfer ke <merchant_in>",
 *    in.description  = "Transfer dari <merchant_out>")
 *
 * Jika kandidat lebih dari satu atau tidak ada → TIDAK dipasangkan (tidak menebak).
 */
export function identifyTransferPairs(transactions: Transaction[]): Map<string, TransferPair> {
  const outs = transactions.filter((t) => t.source === "transfer_out");
  const ins = transactions.filter((t) => t.source === "transfer_in");
  const pairs = new Map<string, TransferPair>();

  const matches = (out: Transaction, incoming: Transaction): boolean => {
    if (out.amount !== incoming.amount) return false;
    if (out.occurredAt !== incoming.occurredAt) return false;
    if ((out.groupId ?? "") !== (incoming.groupId ?? "")) return false;
    if ((out.createdBy ?? "") !== (incoming.createdBy ?? "")) return false;
    // Relasi saling melengkapi: deskripsi merujuk merchant pasangan.
    const outRef = stripPrefix(out.description, "Transfer ke");
    const inRef = stripPrefix(incoming.description, "Transfer dari");
    const matchesOutRef = outRef !== "" && outRef === incoming.merchant;
    const matchesInRef = inRef !== "" && inRef === out.merchant;
    return matchesOutRef && matchesInRef;
  };

  // Kandidat per transfer_out
  const outCandidates = new Map<string, Transaction[]>();
  for (const out of outs) {
    outCandidates.set(out.id, ins.filter((incoming) => matches(out, incoming)));
  }

  // Jumlah transfer_out yang mengklaim tiap transfer_in — harus tepat 1 agar tidak ambigu.
  const inClaimCount = new Map<string, number>();
  for (const cands of outCandidates.values()) {
    if (cands.length !== 1) continue;
    const inId = cands[0].id;
    inClaimCount.set(inId, (inClaimCount.get(inId) ?? 0) + 1);
  }

  for (const out of outs) {
    const cands = outCandidates.get(out.id) ?? [];
    if (cands.length !== 1) continue; // 0 atau >1 kandidat → jangan dipasangkan
    const incoming = cands[0];
    if ((inClaimCount.get(incoming.id) ?? 0) !== 1) continue; // diklaim out lain → ambigu

    const pair: TransferPair = {
      kind: "wallet_transfer",
      outgoing: out,
      incoming,
      sourceWalletId: out.walletId,
      destinationWalletId: incoming.walletId,
      amount: out.amount,
      occurredAt: out.occurredAt,
      groupId: out.groupId ?? incoming.groupId ?? "",
      createdBy: out.createdBy ?? incoming.createdBy ?? "",
    };
    pairs.set(out.id, pair);
    pairs.set(incoming.id, pair);
  }

  return pairs;
}

function stripPrefix(desc: string, prefix: string): string {
  return desc.replace(new RegExp(`^${prefix}\\s*`, "i"), "").split(" · ")[0].trim();
}

/**
 * Transformasi daftar baris ledger → daftar baris LOGIS untuk ditampilkan.
 *
 * Aturan:
 * - Bukan transfer → tetap tampil.
 * - Pasangan transfer: tampilkan SATU baris (sisi transfer_out sebagai wakil);
 *   sisi transfer_in disembunyikan BILA sisi transfer_out juga ada di daftar
 *   (mis. list global / filter tanggal).
 * - Hanya satu sisi yang lolos filter (mis. filter wallet tujuan hanya
 *   menyisakan transfer_in) → sisi tersebut yang tampil sebagai wakil.
 */
export function buildLogicalTransferRows(
  transactions: Transaction[],
  pairs: Map<string, TransferPair>,
): Transaction[] {
  const ids = new Set(transactions.map((t) => t.id));
  return transactions.filter((t) => {
    const pair = pairs.get(t.id);
    if (!pair) return true;
    if (t.source === "transfer_in" && ids.has(pair.outgoing.id)) return false;
    return true;
  });
}
