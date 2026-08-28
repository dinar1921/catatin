import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Set DATA_DIR SEBELUM import db/index.js singleton
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-reg-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sidA = "";
let sidB = "";

before(() => {
  // Group A (Keluarga Dinar) + Group B (Group Lain) untuk pengujian isolasi
  db.exec("BEGIN");
  try {
    // Group A
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-a', 'Group A', 'p-a')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-a', 'g-a', 'User A', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g-a', 'Makan', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-a', 'g-a', 'BCA A', 'p-a', 'personal')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g-a', 'CC A', 'BCA', '1111', 25, 15, 10000000, 'p-a', 'shared')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, official_amount, paid_amount, due_date, status) VALUES ('st-jul-a', 'g-a', 'cc-a', '2026-06-26', '2026-07-25', 1000000, 1000000, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, official_amount, paid_amount, due_date, status) VALUES ('st-aug-a', 'g-a', 'cc-a', '2026-07-26', '2026-08-25', 2000000, 2000000, 0, '2026-09-15', 'open')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes) VALUES ('b-aug-a', 'g-a', 'Statement Aug A', 'credit_card_statement', 2000000, 0, NULL, NULL, 'cc-a', 'st-aug-a', 'BCA', NULL, 25, NULL, NULL, 1, 'p-a', '')").run();

    // Group B
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-b', 'Group B', 'p-b')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-b', 'g-b', 'User B', 'b@test.id', 'admin', 1, '#d64545')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-b', 'g-b', 'Lain B', 'expense', 1)").run();
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

function getWalletBal(walletId: string, groupId: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS bal FROM transactions WHERE wallet_id = ? AND group_id = ?")
    .get(walletId, groupId) as { bal: number };
  return Number(row.bal);
}

describe("Matriks Pengujian Regresi Finansial (Revision 02)", () => {
  // Scenario 1: Cash expense — wallet berkurang, expense bertambah
  it("1. Cash expense: wallet berkurang, expense bertambah", async () => {
    const balBefore = getWalletBal("w-a", "g-a");

    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 100000,
        categoryId: "c-a",
        walletId: "w-a",
        occurredAt: "2026-08-10",
        merchant: "Superindo",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 201, `create expense status: ${res.status}`);

    const balAfter = getWalletBal("w-a", "g-a");
    assert.equal(balAfter, balBefore - 100000, "wallet berkurang 100.000");
  });

  // Scenario 2: CC purchase — wallet TIDAK berkurang, expense bertambah, statement linked
  it("2. CC purchase: wallet TIDAK berkurang, expense bertambah, statement_id terisi", async () => {
    const balBefore = getWalletBal("w-a", "g-a");

    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 250000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-15",
        merchant: "Tokopedia CC",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 201, `create CC purchase status: ${res.status}`);
    const body = (await res.json()) as { id: string };

    const balAfter = getWalletBal("w-a", "g-a");
    assert.equal(balAfter, balBefore, "cash wallet TIDAK berkurang untuk transaksi CC");

    const tx = db.prepare("SELECT wallet_id, statement_id, credit_card_id FROM transactions WHERE id = ?").get(body.id) as {
      wallet_id: string | null;
      statement_id: string | null;
      credit_card_id: string | null;
    };
    assert.equal(tx.wallet_id, null, "wallet_id tersimpan NULL");
    assert.equal(tx.credit_card_id, "cc-a", "credit_card_id tersimpan");
    assert.equal(tx.statement_id, "st-aug-a", "statement_id terasosiasi secara otomatis");
  });

  // Scenario 2b: CC purchase dengan walletId dari client lama -> ditolak 400
  it("2b. CC purchase yang mengirim walletId -> ditolak HTTP 400", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "expense",
        amount: 150000,
        categoryId: "c-a",
        walletId: "w-a", // client lama yang salah mengirim walletId
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-08-16",
        merchant: "Old Client CC",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 400, "ditolak 400");
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Wallet tidak diperlukan untuk transaksi kartu kredit.");
  });

  // Scenario 3: CC payment (settlement) — wallet berkurang, statement paid bertambah, tipe transfer
  it("3. CC payment (settlement): type=transfer, transfer_type=credit_card_payment, wallet berkurang", async () => {
    // Beri wallet modal awal 5.000.000
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-init', 'g-a', 'income', 'opening_balance', 5000000, 'w-a', '2026-08-01', 'Saldo Awal', 'p-a', 'p-a')").run();

    const balBefore = getWalletBal("w-a", "g-a");

    const res = await fetch(`${base}/api/bills/b-aug-a/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 500000, walletId: "w-a" }),
    });
    assert.equal(res.status, 201, `pay bill status: ${res.status}`);
    const body = (await res.json()) as { id: string; paid: number };

    const balAfter = getWalletBal("w-a", "g-a");
    assert.equal(balAfter, balBefore - 500000, "wallet kas berkurang sebesar nominal pembayaran");

    const tx = db.prepare("SELECT type, transfer_type, statement_id FROM transactions WHERE id = ?").get(body.id) as {
      type: string;
      transfer_type: string | null;
      statement_id: string | null;
    };
    assert.equal(tx.type, "transfer", "tipe transaksi adalah transfer");
    assert.equal(tx.transfer_type, "credit_card_payment", "transfer_type adalah credit_card_payment");
    assert.equal(tx.statement_id, "st-aug-a", "statement_id menarget statement eksak");

    const stmt = db.prepare("SELECT paid_amount FROM statements WHERE id = 'st-aug-a'").get() as { paid_amount: number };
    assert.equal(stmt.paid_amount, 500000, "paid_amount statement bertambah 500.000");
  });

  // Scenario 4 & 5: Multiple statements & isolated payment reversal
  it("6 & 7. Multiple statements: membayar August tidak mengubah July; hapus August mengembalikan August saja", async () => {
    const stmtJulBefore = (db.prepare("SELECT paid_amount FROM statements WHERE id = 'st-jul-a'").get() as { paid_amount: number }).paid_amount;

    // Cari transaksi settlement August yang baru dibuat di test 3
    const tx = db.prepare("SELECT id FROM transactions WHERE statement_id = 'st-aug-a' AND type = 'transfer' LIMIT 1").get() as { id: string };
    assert.ok(tx, "transaksi settlement August ada");

    // July harus tetap 0
    assert.equal(stmtJulBefore, 0, "July paid_amount tetap 0");

    // Hapus settlement August
    const delRes = await fetch(`${base}/api/transactions/${tx.id}`, {
      method: "DELETE",
      headers: cookieA(),
    });
    assert.equal(delRes.status, 200, "DELETE settlement sukses");

    const stmtAugAfter = (db.prepare("SELECT paid_amount FROM statements WHERE id = 'st-aug-a'").get() as { paid_amount: number }).paid_amount;
    const stmtJulAfter = (db.prepare("SELECT paid_amount FROM statements WHERE id = 'st-jul-a'").get() as { paid_amount: number }).paid_amount;

    assert.equal(stmtAugAfter, 0, "August paid_amount kembali ke 0");
    assert.equal(stmtJulAfter, 0, "July paid_amount tetap 0");
  });

  // Scenario 8 & 9: Ownership & Group isolation
  it("8 & 9. Cross-group ID validation: User B tidak bisa memakai ID dari Group A", async () => {
    // User B mencoba membuat transaksi menggunakan categoryId 'c-a' milik Group A
    const resCat = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieB() },
      body: JSON.stringify({
        type: "expense",
        amount: 50000,
        categoryId: "c-a", // milik Group A
        walletId: "w-b",
        occurredAt: "2026-08-20",
        merchant: "Hacker",
        ownerProfileId: "p-b",
      }),
    });
    assert.equal(resCat.status, 400, "cross-group categoryId ditolak 400");

    // User B mencoba membuat transaksi menggunakan walletId 'w-a' milik Group A
    const resWal = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieB() },
      body: JSON.stringify({
        type: "expense",
        amount: 50000,
        categoryId: "c-b",
        walletId: "w-a", // milik Group A
        occurredAt: "2026-08-20",
        merchant: "Hacker",
        ownerProfileId: "p-b",
      }),
    });
    assert.equal(resWal.status, 400, "cross-group walletId ditolak 400");
  });

  // Scenario 10: Installment partial payment (P1.3 & Phase 4)
  it("10. Installment partial payment: paid_count tidak bertambah sebelum 1 periode penuh selesai", async () => {
    // Buat bill + installment: 12.000.000, tenor 24, installment_amount 500.000
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes) VALUES ('b-inst', 'g-a', 'Cicilan Test', 'installment', 12000000, 0, 'c-a', NULL, NULL, 'Adira', NULL, 25, NULL, NULL, 1, 'p-a', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-inst', 'g-a', 'b-inst', 'Cicilan Test', 12000000, 500000, 24, 0, 0, '2026-01-01', 25)").run();

    // Pembayaran parsial 1: Rp 300.000 (< 500.000)
    const res1 = await fetch(`${base}/api/bills/b-inst/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 300000, walletId: "w-a" }),
    });
    assert.equal(res1.status, 201, "pay partial 1 status 201");

    let inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = 'i-inst'").get() as { paid_count: number; paid_amount: number };
    assert.equal(inst.paid_count, 0, "paid_count TIDAK bertambah (tetap 0)");
    assert.equal(inst.paid_amount, 300000, "paid_amount tersimpan 300.000");

    // Pembayaran parsial 2: Rp 200.000 (total kumulatif = 500.000 = 1 periode)
    const res2 = await fetch(`${base}/api/bills/b-inst/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 200000, walletId: "w-a" }),
    });
    assert.equal(res2.status, 201, "pay partial 2 status 201");

    inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = 'i-inst'").get() as { paid_count: number; paid_amount: number };
    assert.equal(inst.paid_count, 1, "paid_count bertambah 1 setelah kumulatif mencapai 500.000");
    assert.equal(inst.paid_amount, 0, "paid_amount sisa kembali ke 0");
  });
});
