import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// IMPORTANT: set DATA_DIR sebelum dynamic import reconcile-v4 (yang transitif
// mengimpor db/index.js singleton) agar TIDAK menyentuh DB produksi.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-v4-datadir-"));

import { applySchema } from "../src/db/schema.js";
import { runMigrations } from "../src/db/migrate.js";

// Build a temp DB fixture for each test scenario.
function createFixture(): { db: DatabaseSync; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "catatin-v4-test-"));
  const db = new DatabaseSync(path.join(dir, "catatin.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  applySchema(db);
  runMigrations(db); // migration 1-7 (menambahkan owner_profile_id, scope, statement_id, dsb.)

  // Base data
  db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Test', 'p')").run();
  db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Admin', 'a@t.id', 'admin', 1, '#000')").run();
  db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w', 'g', 'BCA', 'p', 'personal')").run();
  db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c', 'g', 'Umum', 'expense', 1)").run();
  db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc', 'g', 'Test CC', 'BCA', '1111', 20, 15, 10000000, 'p', 'shared')").run();

  return { db, dir };
}

function closeFixture(f: { db: DatabaseSync; dir: string }) {
  f.db.close();
}

describe("Reconcile V4 — classification & production gate", () => {
  it("1. zero mutation — reconcileV4 hanya membaca, tidak menulis", async () => {
    const f = createFixture();
    try {
      // Insert a simple transaction to verify read-only
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-01', '2026-08-31', 100000, 0, '2026-09-15', 'open')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report1 = reconcileV4(f.db);
      // Confirm no mutation: the same data is still there
      const row = f.db.prepare("SELECT id FROM statements WHERE id = 's1'").get() as { id: string } | undefined;
      assert.ok(row);
      assert.equal(row.id, "s1");
    } finally {
      closeFixture(f);
    }
  });

  it("2. productionGate READY — no anomalies", async () => {
    const f = createFixture();
    try {
      // Clean fixture with canonical statement
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 100000, 0, '2026-10-15', 'open')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      assert.equal(report.productionGate.status, "READY");
      assert.ok(report.productionGate.currentIntegrity.passed);
      assert.equal(report.repairableCount, 0);
    } finally {
      closeFixture(f);
    }
  });

  it("3. productionGate BLOCKED — overpayment violation", async () => {
    const f = createFixture();
    try {
      // Statement with derived 50.000 tetapi settlement 100.000 → overpayment.
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, official_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 50000, 100000, 50000, '2026-10-15', 'issued')").run();
      // Purchase item → derived = 50.000
      f.db.prepare("INSERT INTO transactions (id, group_id, type, amount, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t1', 'g', 'expense', 50000, 'cc', 's1', '2026-08-25', 'Test', 'p', 'p')").run();
      f.db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi1', 'g', 's1', 't1', 50000, 'purchase', 'Test')").run();
      // Settlement 100.000 > effective 50.000 (derived) → overpayment actual.
      f.db.prepare("INSERT INTO transactions (id, group_id, type, transfer_type, amount, wallet_id, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t2', 'g', 'transfer', 'credit_card_payment', 100000, 'w', 'cc', 's1', '2026-08-28', 'Bayar', 'p', 'p')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      assert.equal(report.productionGate.status, "BLOCKED");
      assert.ok(!report.productionGate.currentIntegrity.passed);
      // Check which check failed
      const overpaidCheck = report.productionGate.currentIntegrity.checks.find((c) => c.name === "paid_statements_coherent");
      assert.ok(overpaidCheck);
      assert.equal(overpaidCheck!.pass, false);
    } finally {
      closeFixture(f);
    }
  });

  it("4. legacy payment classification — ambiguous", async () => {
    const f = createFixture();
    try {
      // Create a canonical statement
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, official_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 50000, 0, 50000, '2026-10-15', 'open')").run();
      // Legacy payment: expense+CC+installment+wallet (simulates the 8 ambiguous records)
      f.db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b1', 'g', 'Cicilan Test', 'installment', 500000, 0, 'cc', 1, 'p', '')").run();
      f.db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i1', 'g', 'b1', 'Cicilan Test', 500000, 50000, 10, 0, 0, '2026-08-01', 20)").run();
      f.db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-legacy', 'g', 'expense', 50000, 'c', 'w', 'cc', 'i1', '2026-08-25', 'Cicilan Test', 'p', 'p')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      const legacies = report.legacyPayments;
      assert.ok(legacies.length > 0);
      // The legacy payment has walletId → ambiguous
      const found = legacies.find((l) => l.transactionId === "t-legacy");
      assert.ok(found);
      assert.equal(found!.classification, "ambiguous");
    } finally {
      closeFixture(f);
    }
  });

  it("5. legacy payment classification — informational (purchase, no wallet)", async () => {
    const f = createFixture();
    try {
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, official_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 50000, 0, 50000, '2026-10-15', 'open')").run();
      f.db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b1', 'g', 'Cicilan Test', 'installment', 500000, 0, 'cc', 1, 'p', '')").run();
      f.db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i1', 'g', 'b1', 'Cicilan Test', 500000, 50000, 10, 0, 0, '2026-08-01', 20)").run();
      // Purchase: no wallet (NULL)
      f.db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-p', 'g', 'expense', 50000, 'c', NULL, 'cc', 'i1', '2026-08-25', 'Purchase', 'p', 'p')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      const found = report.legacyPayments.find((l) => l.transactionId === "t-p");
      assert.ok(found);
      assert.equal(found!.classification, "informational");
    } finally {
      closeFixture(f);
    }
  });

  it("6. full-principal detection — ambiguous (paid statement)", async () => {
    const f = createFixture();
    try {
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 100000, 100000, '2026-10-15', 'paid')").run();
      f.db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b1', 'g', 'Cicilan Test', 'installment', 100000, 0, 'cc', 1, 'p', '')").run();
      f.db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i1', 'g', 'b1', 'Cicilan Test', 100000, 5000, 20, 0, 0, '2026-08-01', 20)").run();
      // Full-principal item: total_amount == statement_item amount, total_amount > installment_amount
      f.db.prepare("INSERT INTO transactions (id, group_id, type, amount, credit_card_id, statement_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t1', 'g', 'expense', 100000, 'cc', 's1', 'i1', '2026-08-25', 'Full', 'p', 'p')").run();
      f.db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi1', 'g', 's1', 't1', 100000, 'purchase', 'Full principal')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      const fps = report.fullPrincipalInstallments;
      assert.ok(fps.length > 0);
      assert.equal(fps[0].classification, "ambiguous");
    } finally {
      closeFixture(f);
    }
  });

  it("7. missing slice detection — ambiguous", async () => {
    const f = createFixture();
    try {
      // Installment with paid_count > settledCount
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 50000, 50000, '2026-10-15', 'paid')").run();
      f.db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b1', 'g', 'Cicilan', 'installment', 50000, 50000, 'cc', 1, 'p', '')").run();
      f.db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i1', 'g', 'b1', 'Cicilan', 50000, 5000, 10, 1, 0, '2026-08-01', 20)").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      const missing = report.missingSettledSlices;
      assert.ok(missing.length > 0);
      assert.equal(missing[0].classification, "ambiguous");
    } finally {
      closeFixture(f);
    }
  });

  it("8. overlap detection — ambiguous for non-empty non-canonical", async () => {
    const f = createFixture();
    try {
      // Two overlapping statements for same card
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-01', '2026-08-31', 0, 0, '2026-09-15', 'open')").run();
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s2', 'g', 'cc', '2026-08-02', '2026-09-01', 0, 0, '2026-09-15', 'open')").run();
      // s1 has a bill → not empty → overlap ambiguous
      f.db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, statement_id, is_active, owner_profile_id, notes) VALUES ('b1', 'g', 'Bill', 'credit_card_statement', 100000, 0, 's1', 1, 'p', '')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const report = reconcileV4(f.db);

      const overlaps = report.overlappingStatements;
      assert.ok(overlaps.length > 0);
      assert.equal(overlaps[0].classification, "ambiguous");
    } finally {
      closeFixture(f);
    }
  });

  it("9. legitimacy — repeated reconcileV4 idempotent", async () => {
    const f = createFixture();
    try {
      f.db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('s1', 'g', 'cc', '2026-08-21', '2026-09-20', 100000, 0, '2026-10-15', 'open')").run();
      f.db.prepare("INSERT INTO transactions (id, group_id, type, amount, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t1', 'g', 'expense', 50000, 'cc', 's1', '2026-08-25', 'Test', 'p', 'p')").run();
      f.db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi1', 'g', 's1', 't1', 50000, 'purchase', 'Test')").run();

      const { reconcileV4 } = await import("../src/db/reconcile-v4.js");
      const r1 = reconcileV4(f.db);
      const r2 = reconcileV4(f.db);

      // Verify equal results — a subset of fields
      assert.equal(r1.productionGate.status, r2.productionGate.status);
      assert.equal(r1.repairableCount, r2.repairableCount);
      assert.equal(r1.ambiguousCount, r2.ambiguousCount);
      assert.equal(r1.informationalCount, r2.informationalCount);
      assert.equal(r1.legacyPayments.length, r2.legacyPayments.length);
      assert.equal(r1.fullPrincipalInstallments.length, r2.fullPrincipalInstallments.length);
    } finally {
      closeFixture(f);
    }
  });
});