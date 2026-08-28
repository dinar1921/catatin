import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./migrate.js";
import { columnExists, indexExists } from "./migrate.js";
import { backfillStatementLinks } from "./backfill.js";
import { sv, nid } from "./sql.js";

/**
 * Kumpulan migrasi Catatin (incremental, additive).
 *
 * Setiap migrasi TIDAK boleh merombak tabel finansial secara destruktif.
 * Kolom/relasi yang membutuhkan rebuild tabel demi foreign key ditunda ke
 * Revision 02 (enforcement ownership di application layer).
 */

const migration001: Migration = {
  id: 1,
  name: "statement-credit-card-schema",
  up(db: DatabaseSync) {
    // ---- transactions ----
    if (!columnExists(db, "transactions", "statement_id")) {
      db.exec("ALTER TABLE transactions ADD COLUMN statement_id TEXT");
    }
    // transfer_type: disiapkan untuk model target Revision 02
    // (type=transfer + transfer_type=credit_card_payment). Belum dipakai di R01.
    if (!columnExists(db, "transactions", "transfer_type")) {
      db.exec("ALTER TABLE transactions ADD COLUMN transfer_type TEXT");
    }

    // ---- credit_cards: ownership (P1.1). status/current_outstanding TIDAK
    // ditambahkan — tidak ada usage saat ini; outstanding tetap derived. ----
    if (!columnExists(db, "credit_cards", "owner_profile_id")) {
      db.exec("ALTER TABLE credit_cards ADD COLUMN owner_profile_id TEXT");
    }
    if (!columnExists(db, "credit_cards", "scope")) {
      // Kartu lama tanpa owner dianggap shared (milik group) — aman & deterministik.
      db.exec("ALTER TABLE credit_cards ADD COLUMN scope TEXT NOT NULL DEFAULT 'shared' CHECK (scope IN ('personal','shared'))");
    }

    // ---- bills: relasi bill credit_card_statement -> statement eksak ----
    if (!columnExists(db, "bills", "statement_id")) {
      db.exec("ALTER TABLE bills ADD COLUMN statement_id TEXT");
    }

    // ---- Index pendukung lookup statement / kartu / group-profile ----
    const indexes: [string, string][] = [
      ["idx_transactions_statement", "CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement_id)"],
      ["idx_transactions_credit_card", "CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON transactions(credit_card_id)"],
      ["idx_transactions_profile", "CREATE INDEX IF NOT EXISTS idx_transactions_profile ON transactions(owner_profile_id)"],
      ["idx_statements_credit_card", "CREATE INDEX IF NOT EXISTS idx_statements_credit_card ON statements(credit_card_id)"],
      ["idx_bills_credit_card", "CREATE INDEX IF NOT EXISTS idx_bills_credit_card ON bills(credit_card_id)"],
      ["idx_bills_statement", "CREATE INDEX IF NOT EXISTS idx_bills_statement ON bills(statement_id)"],
    ];
    for (const [name, sql] of indexes) {
      if (!indexExists(db, name)) db.exec(sql);
    }

    // ---- Backfill deterministik relasi statement ----
    const backfill = backfillStatementLinks(db);
    if (backfill.linkedTransactions + backfill.linkedSettlements + backfill.linkedBills > 0) {
      console.log(
        `[migrate:1] backfill statement: ${backfill.linkedTransactions} tx, ${backfill.linkedSettlements} settlement, ${backfill.linkedBills} bill`,
      );
    }
    if (
      backfill.unresolvedTransactions + backfill.unresolvedSettlements + backfill.unresolvedBills > 0
    ) {
      console.warn(
        `[migrate:1] ${backfill.unresolvedTransactions + backfill.unresolvedSettlements + backfill.unresolvedBills} relasi statement ambigu/tidak dapat ditentukan (TIDAK ditebak). Jalankan \`npm run db:reconcile\` untuk detail.`,
      );
    }
  },
};

const migration002: Migration = {
  id: 2,
  name: "transfer-settlement-type",
  up(db: DatabaseSync) {
    // Rebuild tabel transactions untuk mengganti CHECK constraint type:
    // income | expense | credit_card_settlement → income | expense | transfer.
    // Data dipertahankan sepenuhnya (kolom, nilai, id, ownership).
    // DDL SQLite transaksional — kegagalan akan di-rollback bersama transaksi migrasi.
    db.exec("DROP TABLE IF EXISTS transactions_new");
    db.exec(`
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
        source TEXT NOT NULL DEFAULT 'manual',
        amount INTEGER NOT NULL,
        category_id TEXT,
        wallet_id TEXT,
        payment_method TEXT,
        credit_card_id TEXT,
        statement_id TEXT,
        transfer_type TEXT,
        occurred_at TEXT NOT NULL,
        merchant TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        owner_profile_id TEXT,
        created_by TEXT,
        bill_id TEXT,
        installment_id TEXT,
        attachment_json TEXT,
        items_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO transactions_new (
        id, group_id, type, source, amount, category_id, wallet_id, payment_method,
        credit_card_id, statement_id, transfer_type, occurred_at, merchant, description,
        owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at
      )
      SELECT
        id, group_id, type, source, amount, category_id, wallet_id, payment_method,
        credit_card_id, statement_id, transfer_type, occurred_at, merchant, description,
        owner_profile_id, created_by, bill_id, installment_id, attachment_json, items_json, created_at
      FROM transactions;
    `);
    db.exec("DROP TABLE transactions");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions");

    // Recreate semua index (DROP TABLE menghapus index otomatis).
    const indexes: [string, string][] = [
      ["idx_transactions_group", "CREATE INDEX IF NOT EXISTS idx_transactions_group ON transactions(group_id)"],
      ["idx_transactions_wallet", "CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id)"],
      ["idx_transactions_statement", "CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions(statement_id)"],
      ["idx_transactions_credit_card", "CREATE INDEX IF NOT EXISTS idx_transactions_credit_card ON transactions(credit_card_id)"],
      ["idx_transactions_profile", "CREATE INDEX IF NOT EXISTS idx_transactions_profile ON transactions(owner_profile_id)"],
    ];
    for (const [name, sql] of indexes) {
      if (!indexExists(db, name)) db.exec(sql);
    }

    // Migrasi data: credit_card_settlement → transfer + transfer_type=credit_card_payment.
    // Nominal, wallet_id, statement_id, occurred_at, dan ownership TIDAK diubah.
    db.exec("UPDATE transactions SET type = 'transfer', transfer_type = 'credit_card_payment' WHERE type = 'credit_card_settlement'");
  },
};

const migration003: Migration = {
  id: 3,
  name: "installment-paid-amount",
  up(db: DatabaseSync) {
    // paid_amount: kumulatif pembayaran parsial dalam periode cicilan.
    // Histori paid_count lama TIDAK diubah; paid_amount diinisialisasi 0.
    if (!columnExists(db, "installments", "paid_amount")) {
      db.exec("ALTER TABLE installments ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0");
    }
  },
};

const migration004: Migration = {
  id: 4,
  name: "credit-card-statement-items",
  up(db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credit_card_statement_items (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        statement_id TEXT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
        transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
        amount INTEGER NOT NULL,
        item_type TEXT NOT NULL CHECK (item_type IN ('purchase','installment','fee','interest','refund','adjustment')),
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(statement_id, transaction_id)
      );
    `);
    const indexes: [string, string][] = [
      ["idx_stmt_items_statement", "CREATE INDEX IF NOT EXISTS idx_stmt_items_statement ON credit_card_statement_items(statement_id)"],
      ["idx_stmt_items_transaction", "CREATE INDEX IF NOT EXISTS idx_stmt_items_transaction ON credit_card_statement_items(transaction_id)"],
      ["idx_stmt_items_group", "CREATE INDEX IF NOT EXISTS idx_stmt_items_group ON credit_card_statement_items(group_id)"],
    ];
    for (const [name, sql] of indexes) {
      if (!indexExists(db, name)) db.exec(sql);
    }
  },
};

const migration005: Migration = {
  id: 5,
  name: "backfill-statement-items",
  up(db: DatabaseSync) {
    // Backfill item_type='purchase' untuk semua transaksi CC expense historis yang memiliki statement_id
    const rows = db
      .prepare(
        `SELECT id, group_id, statement_id, amount, merchant, description
         FROM transactions
         WHERE type = 'expense' AND credit_card_id IS NOT NULL AND statement_id IS NOT NULL`,
      )
      .all() as { id: string; group_id: string; statement_id: string; amount: number; merchant: string; description: string }[];

    const ins = db.prepare(
      `INSERT OR IGNORE INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
       VALUES (?, ?, ?, ?, ?, 'purchase', ?, datetime('now'))`,
    );

    let count = 0;
    for (const r of rows) {
      const desc = r.merchant ? `${r.merchant}${r.description ? ` · ${r.description}` : ""}` : (r.description || "Belanja Kartu Kredit");
      const itemId = `csi-${r.id}`;
      ins.run(itemId, r.group_id, r.statement_id, r.id, r.amount, desc);
      count++;
    }
    if (count > 0) {
      console.log(`[migrate:5] Backfilled ${count} statement items`);
    }
  },
};

const migration006: Migration = {
  id: 6,
  name: "statement-official-amount",
  up(db: DatabaseSync) {
    if (!columnExists(db, "statements", "official_amount")) {
      db.exec("ALTER TABLE statements ADD COLUMN official_amount INTEGER");
    }
  },
};

/**
 * Helper: hitung billing cycle kartu kredit (salinan pure function dari statement-domain,
 * untuk menghindari circular dependency). */
function calculateBillingCycle(
  occurredAt: string,
  statementDay: number,
  dueDay: number,
): { periodStart: string; periodEnd: string; dueDate: string } {
  const d = new Date(occurredAt.slice(0, 10) + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  let endYear = year;
  let endMonth = month;

  if (day > statementDay) {
    endMonth += 1;
    if (endMonth > 11) { endMonth = 0; endYear += 1; }
  }

  const maxEndDays = new Date(endYear, endMonth + 1, 0).getDate();
  const actualEndDay = Math.min(statementDay, maxEndDays);
  const periodEnd = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-${String(actualEndDay).padStart(2, "0")}`;

  let startMonth = endMonth - 1;
  let startYear = endYear;
  if (startMonth < 0) { startMonth = 11; startYear -= 1; }
  const maxStartDays = new Date(startYear, startMonth + 1, 0).getDate();
  const prevEndDay = Math.min(statementDay, maxStartDays);
  const startDateObj = new Date(startYear, startMonth, prevEndDay + 1);
  const periodStart = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, "0")}-${String(startDateObj.getDate()).padStart(2, "0")}`;

  let dueMonth = endMonth + 1;
  let dueYear = endYear;
  if (dueMonth > 11) { dueMonth = 0; dueYear += 1; }
  const maxDueDays = new Date(dueYear, dueMonth + 1, 0).getDate();
  const actualDueDay = Math.min(dueDay, maxDueDays);
  const dueDate = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(actualDueDay).padStart(2, "0")}`;

  return { periodStart, periodEnd, dueDate };
}

const migration007: Migration = {
  id: 7,
  name: "backfill-orphan-cc-statements",
  up(db: DatabaseSync) {
    // Cari semua transaksi CC yang belum terasosiasi ke statement mana pun.
    const orphans = db
      .prepare(
        `SELECT t.id, t.group_id, t.credit_card_id, t.amount, t.occurred_at, t.merchant, t.description
         FROM transactions t
         WHERE t.type = 'expense' AND t.credit_card_id IS NOT NULL AND t.statement_id IS NULL`,
      )
      .all() as { id: string; group_id: string; credit_card_id: string; amount: number; occurred_at: string; merchant: string; description: string }[];

    let created = 0;
    let linked = 0;

    for (const tx of orphans) {
      const card = db
        .prepare("SELECT statement_day, due_day FROM credit_cards WHERE id = ? AND group_id = ?")
        .get(tx.credit_card_id, tx.group_id) as { statement_day: number; due_day: number } | undefined;
      if (!card) continue;

      const { periodStart, periodEnd, dueDate } = calculateBillingCycle(tx.occurred_at, card.statement_day, card.due_day);

      // Cari statement eksak untuk periode ini; buat bila belum ada.
      let stmt = db
        .prepare(
          "SELECT id FROM statements WHERE group_id = ? AND credit_card_id = ? AND period_start = ? AND period_end = ?",
        )
        .get(tx.group_id, tx.credit_card_id, periodStart, periodEnd) as { id: string } | undefined;

      if (!stmt) {
        const stmtId = nid("st");
        db.prepare(
          "INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'open')",
        ).run(sv(stmtId), sv(tx.group_id), sv(tx.credit_card_id), sv(periodStart), sv(periodEnd), sv(dueDate));
        stmt = { id: stmtId };
        created++;
      }

      // Set statement_id pada transaksi
      db.prepare("UPDATE transactions SET statement_id = ? WHERE id = ? AND group_id = ?").run(sv(stmt.id), sv(tx.id), sv(tx.group_id));

      // Insert statement item (dengan INSERT OR IGNORE untuk idempotensi)
      const itemId = `csi-${tx.id}`;
      const desc = tx.merchant ? `${tx.merchant}${tx.description ? ` · ${tx.description}` : ""}` : (tx.description || "Belanja Kartu Kredit");
      db.prepare(
        `INSERT OR IGNORE INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
         VALUES (?, ?, ?, ?, ?, 'purchase', ?, datetime('now'))`,
      ).run(sv(itemId), sv(tx.group_id), sv(stmt.id), sv(tx.id), sv(tx.amount), sv(desc));
      linked++;
    }

    if (created > 0 || linked > 0) {
      console.log(`[migrate:7] Orphan CC: ${linked} transaksi terhubung ke ${created} statement baru`);
    }
  },
};

export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
];
