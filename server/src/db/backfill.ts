import type { DatabaseSync } from "node:sqlite";

export interface BackfillResult {
  linkedTransactions: number;
  unresolvedTransactions: number;
  ambiguousTransactionIds: string[];
  linkedSettlements: number;
  unresolvedSettlements: number;
  ambiguousSettlementIds: string[];
  linkedBills: number;
  unresolvedBills: number;
  ambiguousBillIds: string[];
}

function emptyResult(): BackfillResult {
  return {
    linkedTransactions: 0,
    unresolvedTransactions: 0,
    ambiguousTransactionIds: [],
    linkedSettlements: 0,
    unresolvedSettlements: 0,
    ambiguousSettlementIds: [],
    linkedBills: 0,
    unresolvedBills: 0,
    ambiguousBillIds: [],
  };
}

/**
 * Backfill DETERMINISTIK relasi transaction/bill -> statement.
 *
 * Hanya mengisi `statement_id` bila target dapat dibuktikan tanpa ambiguitas:
 *
 * 1. Transaksi kartu kredit (credit_card_id terisi, bukan settlement):
 *    - persis SATU statement berstatus open/issued pada kartu tersebut yang
 *      period_end-nya >= tanggal transaksi (aturan cutoff: occurred_at <= period_end).
 *    - 0 atau >1 statement yang cocok => TIDAK diisi (dilaporkan untuk rekonsiliasi).
 *
 * 2. Transaksi settlement (type=credit_card_settlement):
 *    - persis SATU statement total untuk kartu+group tersebut.
 *    - selain itu => TIDAK diisi (tidak boleh menebak statement mana yang dibayar).
 *
 * 3. Bill type=credit_card_statement:
 *    - persis SATU statement open/issued untuk kartu tersebut.
 *    - selain itu => TIDAK diisi.
 *
 * Data historis yang ambigu TIDAK pernah ditebak; hanya dihitung dan dilaporkan.
 */
export function backfillStatementLinks(db: DatabaseSync): BackfillResult {
  const result = emptyResult();

  // 1. Transaksi pembelian/hutang/cicilan via kartu kredit.
  const txRows = db
    .prepare(
      `SELECT id, group_id, credit_card_id, occurred_at
       FROM transactions
       WHERE type = 'expense' AND credit_card_id IS NOT NULL AND statement_id IS NULL`,
    )
    .all() as { id: string; group_id: string; credit_card_id: string; occurred_at: string }[];

  for (const t of txRows) {
    const date = String(t.occurred_at ?? "").slice(0, 10);
    const cands = db
      .prepare(
        `SELECT id FROM statements
         WHERE group_id = ? AND credit_card_id = ?
           AND status IN ('open','issued')
           AND period_end >= ?
         ORDER BY period_start ASC`,
      )
      .all(t.group_id, t.credit_card_id, date) as { id: string }[];
    if (cands.length === 1) {
      db.prepare("UPDATE transactions SET statement_id = ? WHERE id = ? AND group_id = ?").run(cands[0].id, t.id, t.group_id);
      result.linkedTransactions += 1;
    } else {
      result.unresolvedTransactions += 1;
      result.ambiguousTransactionIds.push(t.id);
    }
  }

  // 2. Transaksi settlement kartu kredit.
  const stmtTxRows = db
    .prepare(
      `SELECT id, group_id, credit_card_id
       FROM transactions
       WHERE type = 'credit_card_settlement' AND credit_card_id IS NOT NULL AND statement_id IS NULL`,
    )
    .all() as { id: string; group_id: string; credit_card_id: string }[];

  for (const t of stmtTxRows) {
    const all = db
      .prepare("SELECT id FROM statements WHERE group_id = ? AND credit_card_id = ?")
      .all(t.group_id, t.credit_card_id) as { id: string }[];
    if (all.length === 1) {
      db.prepare("UPDATE transactions SET statement_id = ? WHERE id = ? AND group_id = ?").run(all[0].id, t.id, t.group_id);
      result.linkedSettlements += 1;
    } else {
      result.unresolvedSettlements += 1;
      result.ambiguousSettlementIds.push(t.id);
    }
  }

  // 3. Bill type=credit_card_statement.
  const billRows = db
    .prepare(
      `SELECT id, group_id, credit_card_id
       FROM bills
       WHERE type = 'credit_card_statement' AND credit_card_id IS NOT NULL AND statement_id IS NULL`,
    )
    .all() as { id: string; group_id: string; credit_card_id: string }[];

  for (const b of billRows) {
    const cands = db
      .prepare(
        `SELECT id FROM statements
         WHERE group_id = ? AND credit_card_id = ? AND status IN ('open','issued')`,
      )
      .all(b.group_id, b.credit_card_id) as { id: string }[];
    if (cands.length === 1) {
      db.prepare("UPDATE bills SET statement_id = ? WHERE id = ? AND group_id = ?").run(cands[0].id, b.id, b.group_id);
      result.linkedBills += 1;
    } else {
      result.unresolvedBills += 1;
      result.ambiguousBillIds.push(b.id);
    }
  }

  return result;
}
