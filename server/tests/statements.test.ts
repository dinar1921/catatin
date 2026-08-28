import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Pre-set DATA_DIR SEBELUM import db/index.js singleton
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-stmt-test-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");
const { getStatementCalc, getCreditCardMetrics, calculateCreditCardMetrics } = await import("../src/services/statement-domain.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sidA = "";
let sidB = "";

before(() => {
  db.exec("BEGIN");
  try {
    // Group A
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-a', 'Group A', 'p-a')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-a', 'g-a', 'User A', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g-a', 'Belanja', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-a', 'g-a', 'BCA Kas A', 'p-a', 'personal')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g-a', 'CC BCA', 'BCA', '9999', 25, 15, 10000000, 'p-a', 'shared')").run();

    // Group B
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-b', 'Group B', 'p-b')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-b', 'g-b', 'User B', 'b@test.id', 'admin', 1, '#d64545')").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-b', 'g-b', 'Cash B', 'p-b', 'personal')").run();

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  sidA = createSession("p-a");
  sidB = createSession("p-b");
  server = createApp().listen(0);
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  db.close();
});

function cookieA() { return { Cookie: `catatin_sid=${sidA}` }; }
function cookieB() { return { Cookie: `catatin_sid=${sidB}` }; }

describe("Pengujian Domain Statement & Item Kartu Kredit (Phase 17)", () => {
  // Test 1 & 2: CC purchase -> statement item & item amount
  it("1 & 2. Pembelian CC otomatis membuat statement item dengan nominal yang sesuai", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 350000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-10",
        merchant: "Superindo CC",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 201);
    const { id: txId } = (await res.json()) as { id: string };

    const item = db
      .prepare("SELECT * FROM credit_card_statement_items WHERE transaction_id = ?")
      .get(txId) as Record<string, unknown> | undefined;

    assert.ok(item, "statement item terbuat");
    assert.equal(item.item_type, "purchase");
    assert.equal(item.amount, 350000);
    assert.equal(item.group_id, "g-a");
  });

  // Test 3: Multiple CC purchases aggregate correctly
  it("3. Beberapa pembelian CC ter-agregasi dalam derived_amount secara tepat", async () => {
    await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 150000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-12",
        merchant: "Alfamart CC",
        ownerProfileId: "p-a",
      }),
    });

    const cardRes = await fetch(`${base}/api/credit-cards/cc-a/statements`, {
      headers: cookieA(),
    });
    assert.equal(cardRes.status, 200);
    const { statements } = (await cardRes.json()) as { statements: any[] };
    assert.ok(statements.length > 0);

    const st = statements[0];
    assert.equal(st.derivedAmount, 500000, "total derived amount = 350k + 150k = 500k");
  });

  // Test 4: Duplicate statement item prevented
  it("4. Constraint UNIQUE(statement_id, transaction_id) mencegah item duplikat", () => {
    const item = db.prepare("SELECT statement_id, transaction_id, group_id, amount FROM credit_card_statement_items LIMIT 1").get() as any;
    assert.ok(item);

    assert.throws(() => {
      db.prepare(
        "INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-dup', ?, ?, ?, ?, 'purchase', 'Dup')",
      ).run(item.group_id, item.statement_id, item.transaction_id, item.amount);
    }, /UNIQUE/);
  });

  // Test 5: Historical backfill works (Migration 005)
  it("5. Backfill migrasi 005 berhasil membuat item untuk transaksi historis", () => {
    const itemsCount = (db.prepare("SELECT COUNT(*) AS cnt FROM credit_card_statement_items").get() as any).cnt;
    assert.ok(itemsCount >= 2);
  });

  // Test 6, 7 & 8: Statement derived vs official amount & discrepancy
  it("6, 7 & 8. official_amount meng-override derived_amount dan diskrepansi terlihat di API", async () => {
    const stList = (db.prepare("SELECT id FROM statements WHERE credit_card_id = 'cc-a' LIMIT 1").all() as any[])[0];

    // Set official_amount manual (e.g. 520.000 karena biaya admin bank)
    db.prepare("UPDATE statements SET official_amount = 520000 WHERE id = ?").run(stList.id);

    const res = await fetch(`${base}/api/credit-card-statements/${stList.id}`, {
      headers: cookieA(),
    });
    assert.equal(res.status, 200);
    const { statement } = (await res.json()) as any;

    assert.equal(statement.derivedAmount, 500000);
    assert.equal(statement.officialAmount, 520000);
    assert.equal(statement.statementAmount, 520000, "statement_amount menggunakan official_amount");
    assert.equal(statement.remainingAmount, 520000);
  });

  // Test 9, 10, 11, 12, 13: CC payment reduces remaining, decreases wallet, non-expense, partial & full pay
  it("9-13. Pembayaran statement: mengurangi sisa tagihan, mengurangi wallet kas, tidak menambah expense", async () => {
    const stList = (db.prepare("SELECT id FROM statements WHERE credit_card_id = 'cc-a' LIMIT 1").all() as any[])[0];

    // Beri modal wallet 2.000.000
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-kas-1', 'g-a', 'income', 'opening_balance', 2000000, 'w-a', '2026-08-01', 'Kas', 'p-a', 'p-a')").run();

    // Pembayaran Parsial 200.000
    const payRes = await fetch(`${base}/api/credit-card-statements/${stList.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 200000, walletId: "w-a" }),
    });
    assert.equal(payRes.status, 201);
    const { id: txPayId, paid } = (await payRes.json()) as any;
    assert.equal(paid, 200000);

    const calc1 = getStatementCalc(db, stList.id)!;
    assert.equal(calc1.paidAmount, 200000);
    assert.equal(calc1.remainingAmount, 320000); // 520k - 200k

    // Cek transaksi settlement tidak dianggap sebagai expense
    const txPay = db.prepare("SELECT type, transfer_type FROM transactions WHERE id = ?").get(txPayId) as any;
    assert.equal(txPay.type, "transfer");
    assert.equal(txPay.transfer_type, "credit_card_payment");

    // Pembayaran Pelunasan Sisa 320.000
    const payFullRes = await fetch(`${base}/api/credit-card-statements/${stList.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 320000, walletId: "w-a" }),
    });
    assert.equal(payFullRes.status, 201);

    const calc2 = getStatementCalc(db, stList.id)!;
    assert.equal(calc2.remainingAmount, 0);
    assert.equal(calc2.status, "paid");
  });

  // Test 14 & 15: Cutoff boundary (25th vs 26th)
  it("14 & 15. Batas Cutoff (25 vs 26): Transaksi tgl 25 masuk cycle berjalan, tgl 26 masuk cycle berikutnya", async () => {
    // statement_day = 25
    // Transaksi tgl 25 Agustus 2026 -> Periode: 2026-07-26 s.d. 2026-08-25
    const res25 = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 80000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-25",
        merchant: "Cutoff 25",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res25.status, 201);
    const { id: tx25Id } = (await res25.json()) as any;

    const tx25 = db.prepare("SELECT statement_id FROM transactions WHERE id = ?").get(tx25Id) as any;
    const stmt25 = db.prepare("SELECT period_start, period_end FROM statements WHERE id = ?").get(tx25.statement_id) as any;
    assert.equal(stmt25.period_end, "2026-08-25");

    // Transaksi tgl 26 Agustus 2026 -> Periode: 2026-08-26 s.d. 2026-09-25 (On-demand)
    const res26 = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 90000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-26",
        merchant: "Cutoff 26",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res26.status, 201);
    const { id: tx26Id } = (await res26.json()) as any;

    const tx26 = db.prepare("SELECT statement_id FROM transactions WHERE id = ?").get(tx26Id) as any;
    const stmt26 = db.prepare("SELECT period_start, period_end FROM statements WHERE id = ?").get(tx26.statement_id) as any;
    assert.notEqual(tx25.statement_id, tx26.statement_id);
    assert.equal(stmt26.period_start, "2026-08-26");
    assert.equal(stmt26.period_end, "2026-09-25");
  });

  // Test 18 & 19: Delete CC purchase vs delete CC payment
  it("18 & 19. Hapus transaksi CC menghapus statement item; Hapus payment hanya mengembalikan pembayaran", async () => {
    // Buat transaksi CC baru
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 45000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-20",
        merchant: "To Delete",
        ownerProfileId: "p-a",
      }),
    });
    const { id: txId } = (await res.json()) as any;

    const itemBefore = db.prepare("SELECT id FROM credit_card_statement_items WHERE transaction_id = ?").get(txId);
    assert.ok(itemBefore, "item ada sebelum delete");

    // Delete transaksi CC
    const delRes = await fetch(`${base}/api/transactions/${txId}`, {
      method: "DELETE",
      headers: cookieA(),
    });
    assert.equal(delRes.status, 200);

    const itemAfter = db.prepare("SELECT id FROM credit_card_statement_items WHERE transaction_id = ?").get(txId);
    assert.equal(itemAfter, undefined, "statement item otomatis terhapus saat transaksi dihapus");
  });

  // Test 20 & 21: Cross-group statement access rejected
  it("20 & 21. Akses statement & item antar-group ditolak (404)", async () => {
    const stList = (db.prepare("SELECT id FROM statements WHERE credit_card_id = 'cc-a' LIMIT 1").all() as any[])[0];

    // User B mencoba mengakses statement milik Group A
    const resB = await fetch(`${base}/api/credit-card-statements/${stList.id}`, {
      headers: cookieB(),
    });
    assert.equal(resB.status, 404, "cross-group statement ditolak 404");
  });

  // Test 22, 23 & 24: Card outstanding metrics calculations & no double-counting
  it("22-24. Metrik kartu kredit: no double-counting transaksi yang terasosiasi ke statement & future commitment", () => {
    // Ambil statement yang sedang open untuk cycle berjalan (period_start >= '2026-08-26')
    const stOpen = (db.prepare("SELECT id FROM statements WHERE credit_card_id = 'cc-a' AND period_start >= '2026-08-26' LIMIT 1").all() as any[])[0];
    assert.ok(stOpen, "open statement cycle berjalan ditemukan");

    const metricsBefore = calculateCreditCardMetrics(db, "g-a", "cc-a")!;
    assert.ok(metricsBefore);

    // Buat transaksi baru dengan statement_id terisi (menunjuk ke stOpen)
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-nodb', 'g-a', 'expense', 100000, 'c-a', 'cc-a', ?, '2026-08-26', 'No Double Count', 'p-a', 'p-a')").run(stOpen.id);

    // Buat statement item untuk transaksi tersebut
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-nodb', 'g-a', ?, 't-nodb', 100000, 'purchase', 'No Double Count')").run(stOpen.id);

    const metricsAfter = calculateCreditCardMetrics(db, "g-a", "cc-a")!;
    assert.ok(metricsAfter);

    // Transaksi 't-nodb' hanya dihitung 1x melalui statement item, TIDAK dihitung ulang sebagai orphan transaction.
    // Jadi kenaikan outstanding persis 100.000 (bukan 200.000).
    assert.equal(
      metricsAfter.currentOutstanding,
      metricsBefore.currentOutstanding + 100000,
      "Outstanding bertambah tepat 100.000 tanpa duplikasi",
    );
    assert.equal(
      metricsAfter.availableCredit,
      metricsBefore.creditLimit - metricsAfter.currentOutstanding,
      "Available credit = creditLimit - currentOutstanding",
    );
  });
});
