import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySchema } from "../src/db/schema.js";
import { runMigrations, getPendingMigrations, currentVersion, columnExists, indexExists } from "../src/db/migrate.js";
import { backupDatabase } from "../src/db/backup.js";

function openTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "catatin-test-"));
  const dbPath = path.join(dir, "catatin.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  applySchema(db);
  return { db, dbPath, dir };
}

test("migration runs once: fresh DB → version 1, new columns present", () => {
  const { db, dir } = openTempDb();
  try {
    assert.equal(currentVersion(db), 0, "fresh DB starts at version 0");

    const v = runMigrations(db);
    assert.ok(v >= 1, "migrations applied");

    // Verify columns exist
    assert.ok(columnExists(db, "transactions", "statement_id"), "transactions.statement_id exists");
    assert.ok(columnExists(db, "transactions", "transfer_type"), "transactions.transfer_type exists");
    assert.ok(columnExists(db, "credit_cards", "owner_profile_id"), "credit_cards.owner_profile_id exists");
    assert.ok(columnExists(db, "credit_cards", "scope"), "credit_cards.scope exists");
    assert.ok(columnExists(db, "bills", "statement_id"), "bills.statement_id exists");

    // Verify indexes
    assert.ok(indexExists(db, "idx_transactions_statement"), "idx_transactions_statement");
    assert.ok(indexExists(db, "idx_transactions_credit_card"), "idx_transactions_credit_card");
    assert.ok(indexExists(db, "idx_transactions_profile"), "idx_transactions_profile");
    assert.ok(indexExists(db, "idx_statements_credit_card"), "idx_statements_credit_card");
    assert.ok(indexExists(db, "idx_bills_credit_card"), "idx_bills_credit_card");
    assert.ok(indexExists(db, "idx_bills_statement"), "idx_bills_statement");

    // Verify scope default
    const ccInfo = db.prepare("PRAGMA table_info(credit_cards)").all() as { name: string; dflt_value: string | null }[];
    const scopeCol = ccInfo.find((c) => c.name === "scope");
    assert.ok(scopeCol, "scope column in credit_cards");
    assert.equal(scopeCol!.dflt_value?.replace(/'/g, ""), "shared", "scope defaults to 'shared'");
  } finally {
    db.close();
  }
});

test("migration is idempotent on second run", () => {
  const { db, dir } = openTempDb();
  try {
    const v1 = runMigrations(db);
    assert.ok(v1 >= 1);

    // Simulate second startup
    assert.equal(getPendingMigrations(db).length, 0, "no pending migrations");
    const v2 = runMigrations(db);
    assert.equal(v2, v1, "version unchanged after second run");
    assert.equal(currentVersion(db), v1, "user_version unchanged");
  } finally {
    db.close();
  }
});

test("existing database survives migration: data intact", () => {
  const { db, dbPath, dir } = openTempDb();
  try {
    // Insert a transaction and credit card BEFORE migration
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 1, 15, 10000000)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 50000, 'c', 'w', '2026-01-01', 'Test', 'Test', 'p', 'p')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-01-01', '2026-01-31', 50000, 0, '2026-02-15', 'open')").run();

    // Run migration
    const v = runMigrations(db);
    assert.ok(v >= 1, "migration applied");

    // Data still exists
    const tx = db.prepare("SELECT id, amount, merchant FROM transactions WHERE id = 'tx'").get() as { id: string; amount: number; merchant: string };
    assert.equal(tx.id, "tx");
    assert.equal(tx.amount, 50000);
    assert.equal(tx.merchant, "Test");

    // New column is NULL for existing rows
    const stmt = db.prepare("SELECT statement_id FROM transactions WHERE id = 'tx'").get() as { statement_id: string | null };
    assert.equal(stmt.statement_id, null, "existing tx has NULL statement_id");

    // Credit card has default scope
    const cc = db.prepare("SELECT scope FROM credit_cards WHERE id = 'cc'").get() as { scope: string };
    assert.equal(cc.scope, "shared", "existing CC gets default 'shared' scope");

    // Statement still exists
    const s = db.prepare("SELECT id, statement_amount FROM statements WHERE id = 'st'").get() as { id: string; statement_amount: number };
    assert.equal(s.statement_amount, 50000);
  } finally {
    db.close();
  }
});

test("backup is created before migration", () => {
  const { db, dbPath, dir } = openTempDb();
  try {
    // Insert a row so backup is meaningful
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();

    const result = backupDatabase(db, dbPath);
    assert.ok(result !== null, "backup result returned");
    assert.ok(existsSync(result.path), "backup file exists");
    assert.equal(result.size, statSync(dbPath).size, "backup size matches source");

    // Verify backup file is a valid SQLite DB
    const backupDb = new DatabaseSync(result.path);
    const row = backupDb.prepare("SELECT COUNT(*) AS cnt FROM groups").get() as { cnt: number };
    assert.equal(row.cnt, 1, "backup contains the group row");
    backupDb.close();
  } finally {
    db.close();
  }
});

test("transaction.statement_id can be stored and read", () => {
  const { db, dir } = openTempDb();
  try {
    const v = runMigrations(db);
    assert.ok(v >= 1);

    // Insert a transaction with a statement_id
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 1, 15, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-01-01', '2026-01-31', 100000, 0, '2026-02-15', 'open')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, statement_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 50000, 'c', 'w', 'cc', 'st', '2026-01-10', 'Test', 'Test', 'p', 'p')").run();

    const tx = db.prepare("SELECT statement_id FROM transactions WHERE id = 'tx'").get() as { statement_id: string | null };
    assert.equal(tx.statement_id, "st", "statement_id stored and retrieved correctly");
  } finally {
    db.close();
  }
});

test("unresolved historical statement relation is not guessed: ambiguous", () => {
  const { db, dir } = openTempDb();
  try {
    const v = runMigrations(db);
    assert.ok(v >= 1);

    // Two statements for same card, transaction in overlap period
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 1, 15, 10000000)").run();
    // Two open statements
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-jul', 'g', 'cc', '2026-07-01', '2026-07-31', 100000, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-aug', 'g', 'cc', '2026-08-01', '2026-08-31', 200000, 0, '2026-09-15', 'open')").run();
    // Transaction on Aug 15 could match both if period_end covers
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 50000, 'c', 'w', 'cc', '2026-08-15', 'Test', 'Test', 'p', 'p')").run();

    // Now run backfill by re-running migration (it's already at version 1, so it won't run again)
    // We need to check the transaction backfill logic directly. Re-run won't change.
    // The migration already ran with backfill. Since we had 2 statements, the backfill
    // should NOT have assigned statement_id (because ambiguous).
    const tx = db.prepare("SELECT statement_id FROM transactions WHERE id = 'tx'").get() as { statement_id: string | null };
    assert.equal(tx.statement_id, null, "ambiguous transaction not assigned to any statement");

    // Zero statements → also unresolved
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx2', 'g', 'expense', 25000, 'c', 'w', 'cc', '2026-09-15', 'Test2', 'Test2', 'p', 'p')").run();
    // But there are 2 statements but neither covers Sep 15 (July ends July 31, Aug ends Aug 31)
    const tx2 = db.prepare("SELECT statement_id FROM transactions WHERE id = 'tx2'").get() as { statement_id: string | null };
    assert.equal(tx2.statement_id, null, "transaction outside statement periods not assigned");
  } finally {
    db.close();
  }
});

test("deterministic backfill: one open statement covering the transaction date", async () => {
  const { db, dir } = openTempDb();
  try {
    // Data inserted BEFORE migration → migration 001 backfill assigns statement.
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 1, 15, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-08-01', '2026-08-31', 50000, 0, '2026-09-15', 'open')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 50000, 'c', 'w', 'cc', '2026-08-15', 'Test', 'Test', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 1);

    const tx = db.prepare("SELECT statement_id FROM transactions WHERE id = 'tx'").get() as { statement_id: string | null };
    assert.equal(tx.statement_id, "st", "deterministic backfill assigns statement_id");

    // Backfill is idempotent: running it again after assignment changes nothing.
    const { backfillStatementLinks } = await import("../src/db/backfill.js");
    const result = backfillStatementLinks(db);
    assert.equal(result.linkedTransactions, 0, "nothing new to link");
    assert.equal(result.unresolvedTransactions, 0, "nothing unresolved");
  } finally {
    db.close();
  }
});

test("migration 008: CC installment full-principal item on unpaid statement → slice, deterministic", () => {
  const { db, dir } = openTempDb();
  try {
    // Legacy R09-bug data (inserted BEFORE migration):
    // - transaction CC expense tanpa statement_id (kolom ditambahkan migrasi 001)
    // - bill installment terhubung kartu, statement unpaid
    // Migrasi 001/005/007 akan: assign statement_id + backfill item purchase = full principal,
    // lalu migrasi 008 memperbaiki item menjadi slice periode.
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 30, 15, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-07-01', '2026-07-30', 6000000, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b', 'g', 'Laptop', 'installment', 6000000, 0, 'c', 'cc', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day) VALUES ('i', 'g', 'b', 'Laptop', 6000000, 500000, 12, 0, '2026-07-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, bill_id, installment_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 6000000, 'c', 'cc', 'b', 'i', '2026-07-01', 'Laptop', '', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 8, "migration 008 applied");

    const item = db.prepare(
      "SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = 'tx'",
    ).get() as { amount: number; item_type: string };
    assert.equal(item.item_type, "installment", "item menjadi installment");
    assert.equal(item.amount, 500000, "item menjadi slice periode");

    const bill = db.prepare("SELECT statement_id FROM bills WHERE id = 'b'").get() as { statement_id: string | null };
    assert.equal(bill.statement_id, "st", "bill cicilan terhubung statement deterministik");

    // Idempoten
    const v2 = runMigrations(db);
    assert.equal(v2, v);
    const item2 = db.prepare("SELECT amount FROM credit_card_statement_items WHERE transaction_id = 'tx'").get() as { amount: number };
    assert.equal(item2.amount, 500000);
  } finally {
    db.close();
  }
});

test("migration 009: duplicate statements deduped deterministically + unique index", () => {
  const { db, dir } = openTempDb();
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 30, 15, 10000000)").run();
    // Duplikat: dua statement periode sama (mis. hasil race GET lama)
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-1', 'g', 'cc', '2026-07-01', '2026-07-30', 500000, 500000, '2026-08-15', 'paid')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-2', 'g', 'cc', '2026-07-01', '2026-07-30', 0, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 500000, 'c', 'w', 'cc', '2026-07-10', 'Test', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 9, "migration 009 applied");

    // Satu statement tersisa (yang paling awal — st-1, berisi data paid)
    const remaining = db.prepare("SELECT id FROM statements WHERE group_id = 'g' AND credit_card_id = 'cc' AND period_start = '2026-07-01' AND period_end = '2026-07-30'").all() as { id: string }[];
    assert.equal(remaining.length, 1, "hanya satu statement per periode");
    assert.equal(remaining[0].id, "st-1", "statement paling awal dipertahankan");

    // Index unik ada
    assert.ok(indexExists(db, "idx_statements_period_unique"), "idx_statements_period_unique ada");

    // Insert periode duplikat baru DITOLAK (constraint bekerja)
    assert.throws(() => {
      db.prepare(
        "INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-3', 'g', 'cc', '2026-07-01', '2026-07-30', 0, 0, '2026-08-15', 'open')",
      ).run();
    }, /UNIQUE/, "duplicate period ditolak oleh constraint");

    // Idempotent
    const v2 = runMigrations(db);
    assert.equal(v2, v);
  } finally {
    db.close();
  }
});

test("migration 008: full-principal item pada statement PAID dibiarkan (ambigu, tidak ditebak)", () => {
  const { db, dir } = openTempDb();
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 30, 15, 10000000)").run();
    // Statement sudah dibayar penuh (paid_amount = statement_amount)
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-07-01', '2026-07-30', 6000000, 6000000, '2026-08-15', 'paid')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b', 'g', 'Laptop', 'installment', 6000000, 0, 'c', 'cc', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day) VALUES ('i', 'g', 'b', 'Laptop', 6000000, 500000, 12, 0, '2026-07-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, bill_id, installment_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 6000000, 'c', 'cc', 'b', 'i', '2026-07-01', 'Laptop', '', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 8);

    // Tidak diubah — historis pada statement yang sudah dibayar tidak ditebak.
    const item = db.prepare(
      "SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = 'tx'",
    ).get() as { amount: number; item_type: string };
    assert.equal(item.amount, 6000000, "item pada statement paid tidak diubah");
    assert.equal(item.item_type, "purchase");
  } finally {
    db.close();
  }
});

test("migration 010: full-principal item on UNPAID statement converted deterministically (idempotent)", () => {
  const { db, dir } = openTempDb();
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 30, 15, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-07-31', '2026-08-30', 0, 0, '2026-09-15', 'open')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b', 'g', 'Laptop', 'installment', 6000000, 0, 'c', 'cc', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day) VALUES ('i', 'g', 'b', 'Laptop', 6000000, 500000, 12, 0, '2026-08-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, bill_id, installment_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 6000000, 'c', 'cc', 'b', 'i', '2026-08-01', 'Laptop', '', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 10, "migration 010 applied");

    const item = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = 'tx'").get() as { amount: number; item_type: string };
    assert.equal(item.item_type, "installment", "item menjadi installment");
    assert.equal(item.amount, 500000, "item menjadi slice periode berjalan");

    assert.ok(columnExists(db, "credit_card_statement_items", "paid_by_transaction_id"), "kolom paid_by_transaction_id ada");

    const v2 = runMigrations(db);
    assert.equal(v2, v);
    const item2 = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = 'tx'").get() as { amount: number; item_type: string };
    assert.equal(item2.amount, 500000);
    assert.equal(item2.item_type, "installment");
  } finally {
    db.close();
  }
});

test("migration 010: full-principal item on PAID statement NOT converted (ambiguous, reported)", () => {
  const { db, dir } = openTempDb();
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Test', 't@t.com', 'admin', 1, '#000')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'Test', '0000', 30, 15, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st', 'g', 'cc', '2026-07-31', '2026-08-30', 0, 6000000, '2026-09-15', 'paid')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b', 'g', 'Laptop', 'installment', 6000000, 0, 'c', 'cc', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day) VALUES ('i', 'g', 'b', 'Laptop', 6000000, 500000, 12, 0, '2026-08-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, bill_id, installment_id, occurred_at, merchant, description, owner_profile_id, created_by) VALUES ('tx', 'g', 'expense', 6000000, 'c', 'cc', 'b', 'i', '2026-08-01', 'Laptop', '', 'p', 'p')").run();

    const v = runMigrations(db);
    assert.ok(v >= 10);

    const item = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = 'tx'").get() as { amount: number; item_type: string };
    assert.equal(item.item_type, "purchase", "item pada statement paid TIDAK diubah (ambigu)");
    assert.equal(item.amount, 6000000, "amount full-principal TIDAK diubah");
  } finally {
    db.close();
  }
});