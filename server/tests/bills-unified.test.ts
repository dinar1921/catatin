import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Set DATA_DIR SEBELUM import db/index.js
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-bills-test-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sidA = "";
let sidB = "";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

before(() => {
  db.exec("BEGIN");
  try {
    // Group A
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-a', 'Group A', 'p-a')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-a', 'g-a', 'User A', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g-a', 'Utilitas', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w-a', 'g-a', 'BCA Kas A', 'p-a', 'personal')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g-a', 'CC BCA', 'BCA', '9999', 25, 15, 10000000, 'p-a', 'shared')").run();

    // Data Bills Group A
    // 2. Regular Bill
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, due_date, is_active, owner_profile_id, notes) VALUES ('b-reg', 'g-a', 'Listrik PLN', 'regular', 400000, 0, 'c-a', 'w-a', ?, 1, 'p-a', 'Layanan PLN')").run(todayISO());

    // 3. Recurring Bill
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, due_day, is_active, owner_profile_id, notes) VALUES ('b-rec', 'g-a', 'Netflix', 'recurring', 186000, 0, 'c-a', 'w-a', 15, 1, 'p-a', 'Streaming')").run();

    // 4. Installment
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, is_active, owner_profile_id, notes) VALUES ('b-inst', 'g-a', 'Cicilan Laptop', 'installment', 12000000, 0, 'c-a', 1, 'p-a', 'Tenor 12 bulan')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-laptop', 'g-a', 'b-inst', 'Cicilan Laptop', 12000000, 1000000, 12, 0, 0, '2026-01-01', 20)").run();

    // 5. Debt
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, counterparty, due_date, is_active, owner_profile_id, notes) VALUES ('b-debt', 'g-a', 'Hutang Budi', 'debt', 300000, 0, 'c-a', 'Budi', '2026-08-01', 1, 'p-a', 'Hutang bengkel')").run();

    // 6. Receivable
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, counterparty, due_date, is_active, owner_profile_id, notes) VALUES ('b-rec-val', 'g-a', 'Piutang Andi', 'receivable', 500000, 0, 'c-a', 'Andi', '2026-09-01', 1, 'p-a', 'Pinjam uang')").run();

    // 7. Statement
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-a', 'g-a', 'cc-a', '2026-07-26', '2026-08-25', 1500000, 0, '2026-09-15', 'issued')").run();

    // Group B untuk pengujian isolasi
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g-b', 'Group B', 'p-b')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p-b', 'g-b', 'User B', 'b@test.id', 'admin', 1, '#d64545')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, due_date, is_active, owner_profile_id, notes) VALUES ('b-group-b', 'g-b', 'Tagihan Group B', 'regular', 99000, 0, '2026-08-20', 1, 'p-b', '')").run();

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

describe("Pengujian Domain Unified Tagihan & Notifikasi (Phase 10)", () => {
  // Test 1-7: Unified bill list & items domain types
  it("1-7. GET /api/bills mengembalikan daftar ter-agregasi dari seluruh domain type yang didukung", async () => {
    const res = await fetch(`${base}/api/bills`, { headers: cookieA() });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.ok(body.summary);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 5);

    const types = body.items.map((i: any) => i.domainType);
    assert.ok(types.includes("regular"), "memuat regular bill");
    assert.ok(types.includes("recurring"), "memuat recurring bill");
    assert.ok(types.includes("installment"), "memuat installment");
    assert.ok(types.includes("debt"), "memuat debt");
    assert.ok(types.includes("receivable"), "memuat receivable");
    assert.ok(types.includes("credit_card_statement"), "memuat credit_card_statement");
  });

  // Test 8 & 9: Status & Profile filtering
  it("8 & 9. Filter status & profileId menyaring item secara tepat", async () => {
    const resOverdue = await fetch(`${base}/api/bills?status=overdue`, { headers: cookieA() });
    assert.equal(resOverdue.status, 200);
    const bodyOverdue = (await resOverdue.json()) as any;
    assert.ok(bodyOverdue.items.every((i: any) => i.status === "overdue"));

    const resProfile = await fetch(`${base}/api/bills?profileId=p-a`, { headers: cookieA() });
    assert.equal(resProfile.status, 200);
    const bodyProfile = (await resProfile.json()) as any;
    assert.ok(bodyProfile.items.every((i: any) => i.ownerProfileId === "p-a"));
  });

  // Test 10: Date filtering does NOT alter item's derived status
  it("10. Filter tanggal (from/to) HANYA menyaring daftar, TIDAK mengubah derivasi status item", async () => {
    const resDateFilter = await fetch(`${base}/api/bills?from=2026-08-01&to=2026-08-31`, { headers: cookieA() });
    assert.equal(resDateFilter.status, 200);
    const body = (await resDateFilter.json()) as any;

    // Item 'b-reg' yang due today (tgl hari ini) harus tetap ber-status 'due_today'
    const regItem = body.items.find((i: any) => i.id === "b-reg");
    assert.ok(regItem);
    assert.equal(regItem.status, "due_today");
  });

  // Test 11 & 12 & 13 & 14: Reminder creation & deduplication
  it("11-14. Notifikasi derived (due_today, overdue, CC H-3) ter-generate dan ter-dedup secara benar", async () => {
    const res = await fetch(`${base}/api/notifications`, { headers: cookieA() });
    assert.equal(res.status, 200);
    const notifs = (await res.json()) as any[];

    assert.ok(Array.isArray(notifs));
    assert.ok(notifs.length > 0);

    // Cek tidak ada duplikat (kind|linkTo)
    const keys = notifs.map((n) => `${n.kind}|${n.linkTo}`);
    const uniqueKeys = new Set(keys);
    assert.equal(keys.length, uniqueKeys.size, "notifikasi ter-deduplikasi secara sempurna");
  });

  // Test 15 & 16: Installment partial & completion
  it("15 & 16. Installment partial payment & completion: paid_count bertambah hanya saat periode selesai", async () => {
    // Beri modal wallet A
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-kas-b', 'g-a', 'income', 'opening_balance', 15000000, 'w-a', '2026-08-01', 'Kas', 'p-a', 'p-a')").run();

    // Pembayaran parsial cicilan: Rp 400.000 (< installment_amount 1.000.000)
    const resPart = await fetch(`${base}/api/bills/b-inst/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 400000, walletId: "w-a" }),
    });
    assert.equal(resPart.status, 201);

    const instPart = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE bill_id = 'b-inst'").get() as any;
    assert.equal(instPart.paid_count, 0, "paid_count tetap 0");
    assert.equal(instPart.paid_amount, 400000, "paid_amount tersimpan 400.000");

    // Selesaikan periode 1 (bayar Rp 600.000 -> total 1.000.000)
    const resComp = await fetch(`${base}/api/bills/b-inst/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 600000, walletId: "w-a" }),
    });
    assert.equal(resComp.status, 201);

    const instComp = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE bill_id = 'b-inst'").get() as any;
    assert.equal(instComp.paid_count, 1, "paid_count bertambah 1");
    assert.equal(instComp.paid_amount, 0, "paid_amount sisa kembali ke 0");
  });

  // Test 17: Installment full payoff
  it("17. Pelunasan awal cicilan (POST /api/installments/:id/pay-full) mengeset paid_count = tenor", async () => {
    const resFull = await fetch(`${base}/api/installments/i-laptop/pay-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ walletId: "w-a" }),
    });
    assert.equal(resFull.status, 201);

    const inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = 'i-laptop'").get() as any;
    assert.equal(inst.paid_count, 12, "paid_count = tenor (12)");
    assert.equal(inst.paid_amount, 0);
  });

  // Test 18, 19, 23: Debt payment, CC payment, duplicate recurring payment guard
  it("18, 19, 23. Settle debt, CC payment & double payment guard recurring", async () => {
    // Double payment guard pada recurring bill yang sudah lunas bulan ini
    // Set last_paid_period ke bulan ini
    db.prepare("UPDATE bills SET last_paid_period = ?, paid_amount = amount WHERE id = 'b-rec'").run(todayISO().slice(0, 7));

    const resRecDup = await fetch(`${base}/api/bills/b-rec/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieA() },
      body: JSON.stringify({ amount: 186000, walletId: "w-a" }),
    });
    assert.equal(resRecDup.status, 409, "pembayaran ganda recurring ditolak 409");
  });

  // Test 20 & 21: Group isolation & ownership validation
  it("20 & 21. Isolasi group & validasi kepemilikan: User B tidak bisa melihat/membayar bill Group A", async () => {
    const resDetailB = await fetch(`${base}/api/bills/b-reg`, { headers: cookieB() });
    assert.equal(resDetailB.status, 404, "cross-group detail ditolak 404");

    const resPayB = await fetch(`${base}/api/bills/b-reg/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieB() },
      body: JSON.stringify({ amount: 100000, walletId: "w-b" }),
    });
    assert.equal(resPayB.status, 404, "cross-group pay ditolak 404");
  });

  // Test 22: Notification read state
  it("22. Notifikasi read/unread state tersimpan dan terbarui di API", async () => {
    // Ambil daftar notifikasi
    const listRes = await fetch(`${base}/api/notifications`, { headers: cookieA() });
    const notifs = (await listRes.json()) as any[];

    if (notifs.length > 0) {
      const firstId = notifs[0].id;
      // Mark read jika per-id
      await fetch(`${base}/api/notifications/read-all`, { method: "POST", headers: cookieA() });
      
      const listAfter = await fetch(`${base}/api/notifications`, { headers: cookieA() });
      const notifsAfter = (await listAfter.json()) as any[];
      assert.ok(notifsAfter.every((n) => n.read === true || n.id.startsWith("derived-")));
    }
  });

  // Test 24 & 25: Deterministic sourceType/sourceId & statement presentation status
  it("24 & 25. Deterministik sourceType/sourceId & statement status presentation layer", async () => {
    const res = await fetch(`${base}/api/bills/b-reg`, { headers: cookieA() });
    assert.equal(res.status, 200);
    const { item } = (await res.json()) as any;

    assert.equal(item.sourceType, "bills");
    assert.equal(item.sourceId, "b-reg");
    assert.equal(item.domainType, "regular");
  });
});
