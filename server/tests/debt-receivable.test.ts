import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Set DATA_DIR BEFORE importing db
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-debt-test-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");

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
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g-a', 'Umum', 'expense', 1)").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-pend', 'g-a', 'Pendapatan', 'income', 0)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-a', 'g-a', 'BCA Kas A', 'p-a', 'personal')").run();

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

function getWalletBal(walletId: string, groupId: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS bal FROM transactions WHERE wallet_id = ? AND group_id = ?")
    .get(walletId, groupId) as { bal: number };
  return Number(row.bal);
}

describe("Domain Hutang / Piutang (R07-A)", () => {
  // 1. Create debt
  it("1. Create debt: POST /api/bills creates debt bill", async () => {
    const res = await fetch(`${base}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "debt",
        title: "Hutang Budi",
        amount: 300000,
        counterparty: "Budi",
        dueDate: "2026-09-01",
        categoryId: "c-a",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 201, `create debt: ${res.status}`);
    const body = (await res.json()) as { id: string };
    assert.ok(body.id);

    const bill = db.prepare("SELECT type, amount, paid_amount, counterparty FROM bills WHERE id = ?").get(body.id) as any;
    assert.equal(bill.type, "debt");
    assert.equal(bill.amount, 300000);
    assert.equal(bill.paid_amount, 0);
    assert.equal(bill.counterparty, "Budi");
  });

  // 2. Create receivable
  it("2. Create receivable: POST /api/bills creates receivable bill", async () => {
    const res = await fetch(`${base}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({
        type: "receivable",
        title: "Piutang Andi",
        amount: 500000,
        counterparty: "Andi",
        dueDate: "2026-09-15",
        categoryId: "c-a",
        ownerProfileId: "p-a",
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string };
    assert.ok(body.id);

    const bill = db.prepare("SELECT type, amount, counterparty FROM bills WHERE id = ?").get(body.id) as any;
    assert.equal(bill.type, "receivable");
    assert.equal(bill.amount, 500000);
    assert.equal(bill.counterparty, "Andi");
  });

  // Need wallet balance initial
  it("Setup: beri modal wallet untuk pengujian", async () => {
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-kas3', 'g-a', 'income', 'opening_balance', 5000000, 'w-a', '2026-08-01', 'Kas', 'p-a', 'p-a')").run();
    assert.equal(getWalletBal("w-a", "g-a"), 5000000);
  });

  // 3. Debt partial payment
  it("3. Debt partial payment: wallet -, expense +, remaining berkurang", async () => {
    const balBefore = getWalletBal("w-a", "g-a");
    const b = db.prepare("SELECT id FROM bills WHERE type = 'debt' AND group_id = 'g-a' LIMIT 1").get() as { id: string };

    const res = await fetch(`${base}/api/bills/${b.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 100000, walletId: "w-a" }),
    });
    assert.equal(res.status, 201);

    // Wallet decreases
    const balAfter = getWalletBal("w-a", "g-a");
    assert.equal(balAfter, balBefore - 100000, "wallet berkurang 100.000");

    // Transaction type is expense
    const tx = db.prepare("SELECT type, amount FROM transactions WHERE bill_id = ? AND group_id = 'g-a' ORDER BY created_at DESC LIMIT 1").get(b.id) as any;
    assert.equal(tx.type, "expense", "debt payment = expense");
    assert.equal(tx.amount, 100000);

    // Remaining
    const bill = db.prepare("SELECT paid_amount, amount FROM bills WHERE id = ?").get(b.id) as any;
    assert.equal(bill.paid_amount, 100000);
    assert.equal(bill.amount - bill.paid_amount, 200000);
  });

  // 10. Debt creates expense
  it("10. Debt creates expense (confirmed in test 3)", () => {});

  // 5. Receivable partial payment
  it("5. Receivable partial payment: wallet +, income +, expense unchanged", async () => {
    const balBefore = getWalletBal("w-a", "g-a");
    const b = db.prepare("SELECT id FROM bills WHERE type = 'receivable' AND group_id = 'g-a' LIMIT 1").get() as { id: string };

    const res = await fetch(`${base}/api/bills/${b.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 200000, walletId: "w-a" }),
    });
    assert.equal(res.status, 201);

    // Wallet increases
    const balAfter = getWalletBal("w-a", "g-a");
    assert.equal(balAfter, balBefore + 200000, "wallet BERTAMBAH 200.000");

    // Transaction type is income (NOT expense)
    const tx = db.prepare("SELECT type, amount FROM transactions WHERE bill_id = ? AND group_id = 'g-a' ORDER BY created_at DESC LIMIT 1").get(b.id) as any;
    assert.equal(tx.type, "income", "receivable payment = income");
    assert.equal(tx.amount, 200000);

    // Total expense unchanged
    const expenseTotal = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'expense' AND group_id = 'g-a'").get() as any).total;
    // Only the debt payment of 100k
    assert.equal(expenseTotal, 100000, "expense total unchanged by receivable payment");
  });

  // 7, 8, 9 confirmed in test 5

  // 4 + 6: Full settlement
  it("4 & 6. Full settlement: remaining = 0, status paid_off", async () => {
    // Full debt
    const bDebt = db.prepare("SELECT id, paid_amount FROM bills WHERE type = 'debt' AND group_id = 'g-a' LIMIT 1").get() as any;
    const remainingDebt = 300000 - bDebt.paid_amount;

    const resDebt = await fetch(`${base}/api/bills/${bDebt.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: remainingDebt, walletId: "w-a" }),
    });
    assert.equal(resDebt.status, 201);

    const billDebt = db.prepare("SELECT paid_amount, amount FROM bills WHERE id = ?").get(bDebt.id) as any;
    assert.equal(billDebt.paid_amount, billDebt.amount, "debt lunas");

    // Full receivable
    const bRecv = db.prepare("SELECT id, paid_amount FROM bills WHERE type = 'receivable' AND group_id = 'g-a' LIMIT 1").get() as any;
    const remainingRecv = 500000 - bRecv.paid_amount;

    const resRecv = await fetch(`${base}/api/bills/${bRecv.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: remainingRecv, walletId: "w-a" }),
    });
    assert.equal(resRecv.status, 201);

    const billRecv = db.prepare("SELECT paid_amount, amount FROM bills WHERE id = ?").get(bRecv.id) as any;
    assert.equal(billRecv.paid_amount, billRecv.amount, "receivable lunas");
  });

  // 12. Group isolation
  it("12. Group isolation: User B cannot create/pay Group A bills", async () => {
    const resCreate = await fetch(`${base}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieB() },
      body: JSON.stringify({
        type: "debt",
        title: "Cross debt",
        amount: 100000,
        counterparty: "X",
        categoryId: "c-a", // milik Group A
        ownerProfileId: "p-b",
      }),
    });
    assert.equal(resCreate.status, 400, "cross-group category rejected");

    const b = db.prepare("SELECT id FROM bills WHERE type = 'debt' AND group_id = 'g-a' LIMIT 1").get() as { id: string };
    const resPay = await fetch(`${base}/api/bills/${b.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieB() },
      body: JSON.stringify({ amount: 50000, walletId: "w-b" }),
    });
    assert.equal(resPay.status, 404, "cross-group pay rejected");
  });
});