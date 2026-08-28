import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-ccscope-test-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sidAdmin = "";
let sidMember = "";
let sidOther = "";

before(() => {
  db.exec("BEGIN");
  try {
    // Group A
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-a', 'Group A', 'p-admin')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-admin', 'g-a', 'Admin', 'admin@t.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-member', 'g-a', 'Member', 'member@t.id', 'member', 1, '#d64545')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g-a', 'Umum', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-a', 'g-a', 'BCA', 'p-admin', 'personal')").run();

    // Group B (untuk cross-group)
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-b', 'Group B', 'p-other')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-other', 'g-b', 'Other', 'other@t.id', 'admin', 1, '#999999')").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-b', 'g-b', 'Cash B', 'p-other', 'personal')").run();

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  sidAdmin = createSession("p-admin");
  sidMember = createSession("p-member");
  sidOther = createSession("p-other");
  server = createApp().listen(0);
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  db.close();
});

function cookieAdmin() { return { Cookie: `catatin_sid=${sidAdmin}` }; }
function cookieMember() { return { Cookie: `catatin_sid=${sidMember}` }; }
function cookieOther() { return { Cookie: `catatin_sid=${sidOther}` }; }

describe("Kepemilikan / Scope Kartu Kredit (R07-B)", () => {
  // 1. Create personal CC
  it("1. Create personal CC: scope + ownerProfileId tersimpan", async () => {
    const res = await fetch(`${base}/api/credit-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieAdmin() },
      body: JSON.stringify({
        name: "CC Personal Admin",
        issuer: "BCA",
        lastFour: "1111",
        statementDay: 25,
        dueDay: 15,
        creditLimit: 10000000,
        scope: "personal",
        ownerProfileId: "p-admin",
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.scope, "personal");
    assert.equal(body.ownerProfileId, "p-admin");

    const card = db.prepare("SELECT scope, owner_profile_id FROM credit_cards WHERE id = ?").get(body.id) as any;
    assert.equal(card.scope, "personal");
    assert.equal(card.owner_profile_id, "p-admin");
  });

  // 2. Create shared CC (default)
  it("2. Create shared CC: scope default 'shared'", async () => {
    const res = await fetch(`${base}/api/credit-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieAdmin() },
      body: JSON.stringify({
        name: "CC Keluarga",
        issuer: "BCA",
        lastFour: "2222",
        statementDay: 25,
        dueDay: 15,
        creditLimit: 20000000,
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.scope, "shared");
  });

  // 3b. Personal CC: owner dapat memakai (validated via lookup)
  it("3. Personal CC: owner dapat membuat transaksi CC", async () => {
    const personal = db.prepare("SELECT id FROM credit_cards WHERE scope = 'personal' AND group_id = 'g-a' LIMIT 1").get() as { id: string } | undefined;
    if (!personal) {
      // create one
      const created = await fetch(`${base}/api/credit-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieAdmin() },
        body: JSON.stringify({ name: "CC Personal 2", issuer: "BCA", lastFour: "3333", statementDay: 25, dueDay: 15, creditLimit: 5000000, scope: "personal", ownerProfileId: "p-admin" }),
      });
      const b = (await created.json()) as any;
      assert.equal(created.status, 201);

      const res = await fetch(`${base}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieAdmin() },
        body: JSON.stringify({ type: "expense", amount: 50000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: b.id, occurredAt: "2026-08-11", merchant: "Owner CC", ownerProfileId: "p-admin" }),
      });
      assert.equal(res.status, 201, "owner dapat memakai personal CC");
    } else {
      const res = await fetch(`${base}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieAdmin() },
        body: JSON.stringify({ type: "expense", amount: 50000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: personal.id, occurredAt: "2026-08-11", merchant: "Owner CC", ownerProfileId: "p-admin" }),
      });
      assert.equal(res.status, 201, "owner dapat memakai personal CC");
    }
  });

  // 4. Personal CC: other member cannot use
  it("4. Personal CC: member lain ditolak menggunakan kartu personal", async () => {
    const personal = db.prepare("SELECT id FROM credit_cards WHERE scope = 'personal' AND group_id = 'g-a' LIMIT 1").get() as { id: string };
    assert.ok(personal, "personal card exists");

    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieMember() },
      body: JSON.stringify({ type: "expense", amount: 50000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: personal.id, occurredAt: "2026-08-12", merchant: "Try personal", ownerProfileId: "p-member" }),
    });
    assert.equal(res.status, 400, "member lain ditolak memakai personal CC");
    const body = (await res.json()) as any;
    assert.ok(body.error.includes("personal"), "pesan error menyebut 'personal'");
  });

  // 5. Shared CC: permitted member can use
  it("5. Shared CC: member diizinkan memakai kartu shared", async () => {
    const shared = db.prepare("SELECT id FROM credit_cards WHERE scope = 'shared' AND group_id = 'g-a' LIMIT 1").get() as { id: string };
    assert.ok(shared, "shared card exists");

    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieMember() },
      body: JSON.stringify({ type: "expense", amount: 25000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: shared.id, occurredAt: "2026-08-13", merchant: "Shared CC use", ownerProfileId: "p-member" }),
    });
    assert.equal(res.status, 201, "member dapat memakai shared CC");
  });

  // 6. Cross-group card rejected
  it("6. Cross-group card rejected", async () => {
    // Buat card di group B
    const created = await fetch(`${base}/api/credit-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieOther() },
      body: JSON.stringify({ name: "CC Other", issuer: "BCA", lastFour: "4444", statementDay: 25, dueDay: 15, creditLimit: 1000000, scope: "shared", ownerProfileId: "p-other" }),
    });
    const b = (await created.json()) as any;
    assert.equal(created.status, 201);

    // Member A mencoba memakai kartu group B
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieMember() },
      body: JSON.stringify({ type: "expense", amount: 10000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: b.id, occurredAt: "2026-08-14", merchant: "Cross", ownerProfileId: "p-member" }),
    });
    assert.equal(res.status, 400, "cross-group card ditolak");
  });

  // 7. PATCH ownership validated
  it("7. PATCH ownership: scope & ownerProfileId dapat diubah dengan validasi", async () => {
    const shared = db.prepare("SELECT id FROM credit_cards WHERE scope = 'shared' AND group_id = 'g-a' LIMIT 1").get() as { id: string };

    // Ubah scope ke personal + owner member
    const res = await fetch(`${base}/api/credit-cards/${shared.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookieAdmin() },
      body: JSON.stringify({ scope: "personal", ownerProfileId: "p-member" }),
    });
    assert.equal(res.status, 200);

    const card = db.prepare("SELECT scope, owner_profile_id FROM credit_cards WHERE id = ?").get(shared.id) as any;
    assert.equal(card.scope, "personal");
    assert.equal(card.owner_profile_id, "p-member");

    // ownerProfileId invalid (cross group)
    const resBad = await fetch(`${base}/api/credit-cards/${shared.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookieAdmin() },
      body: JSON.stringify({ ownerProfileId: "p-other" }),
    });
    assert.equal(resBad.status, 400, "owner profile lintas group ditolak");
  });

  // 8. Payment with unauthorized card rejected (personal owned by member, admin pays)
  it("8. Payment personal card oleh bukan pemilik ditolak", async () => {
    const personalMember = db.prepare("SELECT id FROM credit_cards WHERE scope = 'personal' AND owner_profile_id = 'p-member' AND group_id = 'g-a' LIMIT 1").get() as { id: string } | undefined;
    if (!personalMember) return; // skip bila tidak ada

    // Buat statement bill untuk kartu tsb
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-scope', 'g-a', ?, '2026-08-01', '2026-08-31', 100000, 0, '2026-09-15', 'issued')").run(personalMember.id);
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, is_active, owner_profile_id, notes) VALUES ('b-scope', 'g-a', 'Statement Scope', 'credit_card_statement', 100000, 0, 'c-a', NULL, ?, 'st-scope', 1, 'p-member', '')").run(personalMember.id);

    // Admin (bukan pemilik) mencoba bayar statement kartu personal member
    const res = await fetch(`${base}/api/bills/b-scope/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieAdmin() },
      body: JSON.stringify({ amount: 100000, walletId: "w-a" }),
    });
    assert.equal(res.status, 400, "pembayaran kartu personal oleh bukan pemilik ditolak");
  });
});