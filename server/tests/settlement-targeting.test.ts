import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// IMPORTANT: set DATA_DIR BEFORE importing the db singleton (module reads env at load).
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-int-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sid = "";

before(() => {
  // Fixture: group + admin + category + wallet + 1 credit card + 2 statements (Jul & Aug)
  // + bill linked to August statement + ambiguous bill without statement link.
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Keluarga Test', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Admin', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-lain', 'g', 'Lainnya', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w', 'g', 'BCA', 'p', 'personal')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit) VALUES ('cc', 'g', 'Test CC', 'BCA', '0000', 5, 25, 10000000)").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, official_amount, paid_amount, due_date, status) VALUES ('st-jul', 'g', 'cc', '2026-07-01', '2026-07-31', 1000000, 1000000, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, official_amount, paid_amount, due_date, status) VALUES ('st-aug', 'g', 'cc', '2026-08-01', '2026-08-31', 2000000, 2000000, 0, '2026-09-15', 'open')").run();
    // Bill explicitly linked to August statement (exact targeting path)
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes) VALUES ('b-aug', 'g', 'Tagihan Kartu Kredit BCA', 'credit_card_statement', 2000000, 0, NULL, NULL, 'cc', 'st-aug', 'BCA', NULL, 25, NULL, NULL, 1, 'p', '')").run();
    // Bill WITHOUT statement link + 2 open statements => ambiguous (must not guess)
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes) VALUES ('b-amb', 'g', 'Statement Ambigu', 'credit_card_statement', 500000, 0, NULL, NULL, 'cc', NULL, 'BCA', NULL, 25, NULL, NULL, 1, 'p', '')").run();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  sid = createSession("p");
  server = createApp().listen(0);
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  db.close();
});

function cookie(): Record<string, string> {
  return { Cookie: `catatin_sid=${sid}` };
}

async function stmtPaid(id: string): Promise<number> {
  const row = db.prepare("SELECT paid_amount FROM statements WHERE id = ?").get(id) as { paid_amount: number };
  return row.paid_amount;
}

describe("settlement statement targeting (P0.1)", () => {
  it("August payment updates August only; July unchanged", async () => {
    const res = await fetch(`${base}/api/bills/b-aug/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 500000, walletId: "w" }),
    });
    const resBody = await res.text();
    assert.equal(res.status, 201, `pay returned ${res.status}: ${resBody}`);
    const body = JSON.parse(resBody) as { id: string; paid: number };
    assert.equal(body.paid, 500000);

    assert.equal(await stmtPaid("st-aug"), 500000, "August paid_amount = 500000");
    assert.equal(await stmtPaid("st-jul"), 0, "July untouched");

    // Settlement transaction must carry the exact statement_id
    const tx = db.prepare("SELECT statement_id, bill_id, type, transfer_type FROM transactions WHERE id = ?").get(body.id) as {
      statement_id: string | null;
      bill_id: string | null;
      type: string;
      transfer_type: string | null;
    };
    assert.equal(tx.statement_id, "st-aug", "settlement tx targets exact statement");
    assert.equal(tx.bill_id, "b-aug", "settlement tx linked to bill");
    assert.equal(tx.type, "transfer", "settlement type is transfer");
    assert.equal(tx.transfer_type, "credit_card_payment", "transfer_type is credit_card_payment");
  });

  it("deleting August settlement restores August only", async () => {
    // Find the settlement transaction from the previous test
    const tx = db.prepare("SELECT id FROM transactions WHERE statement_id = 'st-aug' AND type = 'transfer' AND transfer_type = 'credit_card_payment' LIMIT 1").get() as { id: string };
    assert.ok(tx, "settlement transaction exists");

    const res = await fetch(`${base}/api/transactions/${tx.id}`, { method: "DELETE", headers: cookie() });
    assert.equal(res.status, 200, `delete returned ${res.status}: ${await res.text()}`);

    assert.equal(await stmtPaid("st-aug"), 0, "August restored to 0");
    assert.equal(await stmtPaid("st-jul"), 0, "July still 0");
  });

  it("ambiguous statement bill is rejected with 409 and mutates nothing", async () => {
    const res = await fetch(`${base}/api/bills/b-amb/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 200000, walletId: "w" }),
    });
    assert.equal(res.status, 409, `ambiguous pay must be rejected, got ${res.status}`);

    // No transaction created, no statement mutated
    const txCount = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
    assert.equal(txCount.n, 0, "no transaction created for ambiguous pay");
    assert.equal(await stmtPaid("st-aug"), 0, "August unchanged after ambiguous attempt");
    assert.equal(await stmtPaid("st-jul"), 0, "July unchanged after ambiguous attempt");
  });
});