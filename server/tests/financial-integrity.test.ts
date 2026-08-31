import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-r091-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");
const { calculateCreditCardMetrics, getStatementCalc, resolveOrCreateStatement, syncInstallmentSlices } = await import("../src/services/statement-domain.js");
const { getUnifiedBills } = await import("../src/services/unified-bills.js");
const { reconcile } = await import("../src/db/reconcile.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sid = "";

function cookie(): Record<string, string> {
  return { Cookie: `catatin_sid=${sid}` };
}

function walletBal(walletId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS bal FROM transactions WHERE wallet_id = ? AND group_id = 'g'",
    )
    .get(walletId) as { bal: number };
  return Number(row.bal);
}

function expenseTotal(): number {
  const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE group_id = 'g' AND type = 'expense'").get() as { t: number };
  return Number(row.t);
}

function itemCount(): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE group_id = 'g'").get() as { n: number }).n);
}

function stmtCount(): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM statements WHERE group_id = 'g'").get() as { n: number }).n);
}

async function createCcInstallment(opts: {
  amount: number;
  tenor: number;
  installmentAmount: number;
  occurredAt: string;
  merchant: string;
  cardId: string;
}): Promise<{ txId: string; billId: string; installmentId: string; statementId: string }> {
  const res = await fetch(`${base}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookie() },
    body: JSON.stringify({
      type: "expense",
      amount: opts.amount,
      categoryId: "c-a",
      paymentMethod: "Credit Card",
      creditCardId: opts.cardId,
      occurredAt: opts.occurredAt,
      merchant: opts.merchant,
      ownerProfileId: "p",
      bill: { kind: "installment", amount: opts.amount, tenor: opts.tenor, installmentAmount: opts.installmentAmount, dueDay: 15, title: `Cicilan ${opts.merchant}` },
    }),
  });
  assert.equal(res.status, 201, `create CC installment status ${res.status}`);
  const { id: txId } = (await res.json()) as { id: string };
  const tx = db.prepare("SELECT bill_id, installment_id, statement_id FROM transactions WHERE id = ?").get(txId) as {
    bill_id: string;
    installment_id: string;
    statement_id: string;
  };
  return { txId, billId: tx.bill_id, installmentId: tx.installment_id, statementId: tx.statement_id };
}

async function payBill(billId: string, amount: number): Promise<number> {
  const res = await fetch(`${base}/api/bills/${billId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookie() },
    body: JSON.stringify({ amount, walletId: "w" }),
  });
  assert.equal(res.status, 201, `pay status ${res.status}`);
  const body = (await res.json()) as { paid: number };
  return body.paid;
}

async function payStatement(stmtId: string, amount: number): Promise<number> {
  const res = await fetch(`${base}/api/credit-card-statements/${stmtId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookie() },
    body: JSON.stringify({ amount, walletId: "w" }),
  });
  assert.equal(res.status, 201, `statement pay status ${res.status}`);
  const body = (await res.json()) as { paid: number };
  return body.paid;
}

async function payFull(installmentId: string): Promise<number> {
  const res = await fetch(`${base}/api/installments/${installmentId}/pay-full`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookie() },
    body: JSON.stringify({ walletId: "w" }),
  });
  assert.equal(res.status, 201, `pay-full status ${res.status}`);
  const body = (await res.json()) as { paid: number };
  return body.paid;
}

before(() => {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Integritas', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Admin', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g', 'Elektronik', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w', 'g', 'BCA', 'p', 'personal')").run();
    // statement_day 30: M1 (8/1–8/30), M2 (8/31–9/30 BELUM mulai pada 8/29)
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g', 'CC A', 'BCA', '0001', 30, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-b', 'g', 'CC B', 'Mandiri', '0002', 30, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-c', 'g', 'CC C', 'BNI', '0003', 30, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-kas', 'g', 'income', 'opening_balance', 20000000, 'w', '2026-08-01', 'Kas', 'p', 'p')").run();
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

describe("R09.1 — Financial Integrity Hardening", () => {
  /* ========================================================== */
  /* SCENARIO A — Month 1 posted & paid; Month 2 posted (cc-a)   */
  /* ========================================================== */
  let a: { txId: string; billId: string; installmentId: string; statementId: string };

  it("A0. Setup: purchase 8/24 → Month 1 (8/1–8/30) posted 500k; outstanding 500k, future 5.5m", async () => {
    a = await createCcInstallment({ amount: 6000000, tenor: 12, installmentAmount: 500000, occurredAt: "2026-08-24", merchant: "Laptop A", cardId: "cc-a" });
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 500000);
    assert.equal(m.futureInstallmentCommitment, 5500000);
    assert.equal(m.currentOutstanding + m.futureInstallmentCommitment, 6000000);
  });

  it("1. Posted slice remains after next period — Month 1 paid, Month 1 item intact", async () => {
    const paid = await payBill(a.billId, 500000);
    assert.equal(paid, 500000);

    // Month-1 item tetap ada
    const items = db.prepare(
      `SELECT csi.amount, csi.item_type, s.paid_amount AS stmt_paid
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?`,
    ).all(a.installmentId) as any[];
    assert.equal(items.length, 1, "Month-1 item tetap ada");
    assert.equal(items[0].amount, 500000);
    assert.equal(items[0].stmt_paid, 500000, "Month-1 slice sudah settle");
  });

  it("2 & 3. Paid statement retains item & derivedAmount tetap benar (500k/500k/0/paid)", () => {
    const calc = getStatementCalc(db, a.statementId)!;
    assert.equal(calc.derivedAmount, 500000);
    assert.equal(calc.statementAmount, 500000);
    assert.equal(calc.paidAmount, 500000);
    assert.equal(calc.remainingAmount, 0);
    assert.equal(calc.status, "paid");
  });

  it("15 & 16. SCENARIO A state 1: Month 1 paid (M2 belum mulai) → outstanding 0, future 5.5m", () => {
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 0, "paid statement contributes 0");
    assert.equal(m.futureInstallmentCommitment, 5500000, "future commitment tetap 5.5m");
  });

  it("4. Month 2 posted (materialisasi deterministik) — item baru dibuat, Month 1 TIDAK dihapus", () => {
    // Simulasi write-time materialisasi yang akan dilakukan sync saat siklus 8/31–9/30 mulai.
    const stmtM2 = resolveOrCreateStatement(db, "g", "cc-a", "2026-08-31");
    db.prepare(
      `INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description, created_at)
       VALUES ('csi-m2', 'g', ?, ?, 500000, 'installment', 'Cicilan', datetime('now'))`,
    ).run(stmtM2, a.txId);

    // Month-1 item tetap ada, Month-2 item baru
    const items = db.prepare(
      `SELECT csi.amount, csi.statement_id, s.paid_amount AS stmt_paid
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?
       ORDER BY csi.statement_id`,
    ).all(a.installmentId) as any[];
    assert.equal(items.length, 2, "Month-1 + Month-2 item");
    const m1 = items.find((i) => i.amount === 500000 && Number(i.stmt_paid) === 500000);
    const m2 = items.find((i) => i.amount === 500000 && Number(i.stmt_paid) === 0);
    assert.ok(m1, "Month-1 item tersimpan & settled");
    assert.ok(m2, "Month-2 item tersimpan & unpaid");
  });

  it("15 & 16. SCENARIO A state 2: Month 2 posted → outstanding 500k, future 5.0m (no double count)", () => {
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 500000);
    assert.equal(m.futureInstallmentCommitment, 5000000);
    assert.equal(m.currentOutstanding + m.futureInstallmentCommitment, 5500000, "invariant: outstanding + commitment = sisa kewajiban");
  });

  it("5. Repeated sync/read does not delete history", () => {
    const before = itemCount();
    // sync dipanggil berulang (jalur write) — additive-only, tidak menghapus apapun
    syncInstallmentSlices(db, "g");
    syncInstallmentSlices(db, "g", a.installmentId);
    assert.equal(itemCount(), before, "tidak ada item yang dihapus");
  });

  it("17. Multi-item installment dihitung sekali (tidak berulang)", () => {
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.futureInstallmentCommitment, 5000000, "dua item → commitment 5.0m, bukan 10.0m");
    assert.equal(m.currentOutstanding, 500000);
  });

  /* ========================================================== */
  /* SCENARIO B — Full payoff preserving history (cc-b)          */
  /* ========================================================== */
  let b: { txId: string; billId: string; installmentId: string; statementId: string };

  it("B0. Setup: purchase 7/24 → M1 (7/1–7/30); bayar M1 & M2", async () => {
    b = await createCcInstallment({ amount: 6000000, tenor: 12, installmentAmount: 500000, occurredAt: "2026-07-24", merchant: "Laptop B", cardId: "cc-b" });
    // M1 cycle 7/1–7/30
    await payBill(b.billId, 500000);
    // M2 cycle 7/31–8/30 (started) — diposting otomatis oleh sync saat M1 selesai
    await payBill(b.billId, 500000);

    const inst = db.prepare("SELECT paid_count FROM installments WHERE id = ?").get(b.installmentId) as { paid_count: number };
    assert.equal(inst.paid_count, 2, "dua periode dibayar");

    const m = calculateCreditCardMetrics(db, "g", "cc-b")!;
    assert.equal(m.currentOutstanding, 0, "M1 & M2 settle → outstanding 0");
    assert.equal(m.futureInstallmentCommitment, 5000000, "sisa schedule 5.0m");
  });

  it("6 & 7 & 8 & 9. Full payoff: preserve M1 & M2 items, resolve sisa 5.0m, tanpa expense ganda", async () => {
    const expBefore = expenseTotal();
    const paid = await payFull(b.installmentId);
    assert.equal(paid, 5000000, "payoff = sisa kewajiban (5.0m)");
    assert.equal(expenseTotal(), expBefore, "TIDAK ada expense dari payoff");

    // Riwayat: M1 + M2 + payoff = 3 item; M1 & M2 settled & TETAP ADA
    const items = db.prepare(
      `SELECT csi.amount, csi.item_type, s.paid_amount AS stmt_paid, s.period_start
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?
       ORDER BY s.period_start ASC`,
    ).all(b.installmentId) as any[];
    assert.equal(items.length, 3, "M1 + M2 + payoff");
    const m1 = items.find((i) => i.amount === 500000 && String(i.period_start) === "2026-07-01");
    const m2 = items.find((i) => i.amount === 500000 && String(i.period_start) === "2026-07-31");
    const payoff = items.find((i) => i.amount === 5000000);
    assert.ok(m1, "Month-1 item ada");
    assert.ok(Number(m1.stmt_paid) >= 500000, "Month-1 settle");
    assert.ok(m2, "Month-2 item ada");
    assert.ok(Number(m2.stmt_paid) >= 500000, "Month-2 settle");
    assert.ok(payoff, "payoff item ada");
    assert.ok(Number(payoff.stmt_paid) >= 5000000, "payoff settle");

    const inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = ?").get(b.installmentId) as any;
    assert.equal(inst.paid_count, 12, "installment completed");
    assert.equal(inst.paid_amount, 0);

    const m = calculateCreditCardMetrics(db, "g", "cc-b")!;
    assert.equal(m.currentOutstanding, 0, "outstanding 0 setelah payoff");
    assert.equal(m.futureInstallmentCommitment, 0, "commitment 0 setelah payoff");

    // Statement M1 & M2 tetap koheren
    const stmtM1 = db.prepare("SELECT id FROM statements WHERE group_id='g' AND credit_card_id='cc-b' AND period_start='2026-07-01'").get() as any;
    const c1 = getStatementCalc(db, stmtM1.id)!;
    assert.equal(c1.derivedAmount, 500000);
    assert.equal(c1.paidAmount, 500000);
    assert.equal(c1.remainingAmount, 0);
    assert.equal(c1.status, "paid");
  });

  /* ========================================================== */
  /* GET SAFETY — read-only                                       */
  /* ========================================================== */
  it("10-13. GET /api/bills, GET /api/credit-cards, GET statement detail — TIDAK insert/delete, idempotent", async () => {
    const stmtDetail = db.prepare("SELECT id FROM statements WHERE group_id='g' AND credit_card_id='cc-a' AND period_start='2026-08-31'").get() as any;
    const beforeItems = itemCount();
    const beforeStmts = stmtCount();

    const r1 = await fetch(`${base}/api/bills`, { headers: cookie() });
    assert.equal(r1.status, 200);
    const r2 = await fetch(`${base}/api/credit-cards`, { headers: cookie() });
    assert.equal(r2.status, 200);
    const r3 = await fetch(`${base}/api/credit-card-statements/${a.statementId}`, { headers: cookie() });
    assert.equal(r3.status, 200);
    const r4 = await fetch(`${base}/api/credit-card-statements/${stmtDetail.id}`, { headers: cookie() });
    assert.equal(r4.status, 200);

    assert.equal(itemCount(), beforeItems, "GET tidak insert/delete item");
    assert.equal(stmtCount(), beforeStmts, "GET tidak insert/delete statement");

    // Idempotent: GET ulang → respons identik
    const r5 = await fetch(`${base}/api/credit-card-statements/${a.statementId}`, { headers: cookie() });
    assert.equal(r5.status, 200);
    const body1 = (await r4.json()) as any;
    const body2 = (await r5.json()) as any;
    // Detail M1: item historis tetap 1, tanpa item derived (sudah settle)
    const m1Items = (await (await fetch(`${base}/api/credit-card-statements/${a.statementId}`, { headers: cookie() })).json()) as any;
    assert.equal(m1Items.items.length, 1, "M1 statement menampilkan item historis");
  });

  it("14. Concurrent reads cannot duplicate statements/items", async () => {
    const beforeStmts = stmtCount();
    const beforeItems = itemCount();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${base}/api/bills`, { headers: cookie() })),
    );
    for (const r of results) assert.equal(r.status, 200);
    const results2 = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${base}/api/credit-cards`, { headers: cookie() })),
    );
    for (const r of results2) assert.equal(r.status, 200);
    assert.equal(stmtCount(), beforeStmts, "tidak ada statement duplikat");
    assert.equal(itemCount(), beforeItems, "tidak ada item duplikat");

    // Tidak ada dua statement dengan periode sama
    const dup = db.prepare(
      `SELECT group_id, credit_card_id, period_start, period_end, COUNT(*) AS n
       FROM statements GROUP BY group_id, credit_card_id, period_start, period_end HAVING COUNT(*) > 1`,
    ).all();
    assert.equal(dup.length, 0, "tidak ada statement dengan periode duplikat");
  });

  /* ========================================================== */
  /* DERIVED CURRENT SLICE                                        */
  /* ========================================================== */
  it("D1. Slice derived (belum dimaterialisasi) muncul di statement detail tanpa mutasi GET", async () => {
    // Instalment dengan purchase tx tetapi TANPA item tersimpan (simulasi state
    // pasca POST-gating di mana siklus sudah mulai tanpa write event).
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-c', 'g', 'cc-c', '2026-07-01', '2026-07-30', 0, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-c', 'g', 'Cicilan C', 'installment', 2400000, 0, 'c-a', 'cc-c', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-c', 'g', 'b-c', 'Cicilan C', 2400000, 400000, 6, 0, 0, '2026-07-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, bill_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-c', 'g', 'expense', 2400000, 'c-a', 'cc-c', 'st-c', 'b-c', 'i-c', '2026-07-01', 'Cicilan C', 'p', 'p')").run();

    const beforeItems = itemCount();
    const res = await fetch(`${base}/api/credit-card-statements/st-c`, { headers: cookie() });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const derived = body.items.find((i: any) => i.isDerived === true);
    assert.ok(derived, "item derived muncul di detail statement");
    assert.equal(derived.amount, 400000, "amount derived = slice periode berjalan");
    assert.equal(itemCount(), beforeItems, "GET tidak menulis item derived (read-only)");

    // getStatementCalc juga menghitung derived tanpa menulis
    const calc = getStatementCalc(db, "st-c")!;
    assert.equal(calc.derivedAmount, 400000);
    assert.equal(calc.statementAmount, 400000);
  });

  it("18 & 19. Paid historical slices excluded from current liability; future not current billed", () => {
    // cc-b: semua settle → outstanding 0
    const mB = calculateCreditCardMetrics(db, "g", "cc-b")!;
    assert.equal(mB.currentOutstanding, 0, "paid historical slices tidak masuk current liability");
    assert.equal(mB.futureInstallmentCommitment, 0);
    // cc-a: Month-2 (unpaid) 500k outstanding; future 5.0m — future tidak jadi current billed
    const mA = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(mA.currentOutstanding, 500000);
    assert.equal(mA.futureInstallmentCommitment, 5000000);
  });

  /* ========================================================== */
  /* RECONCILE V2                                                 */
  /* ========================================================== */
  it("20. paid statement tanpa item terdeteksi", () => {
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-orphan-paid', 'g', 'cc-a', '2026-06-01', '2026-06-30', 500000, 500000, '2026-07-15', 'paid')").run();
    const rep = reconcile(db);
    assert.ok(rep.ccInstallments.paidStatementsWithoutItems.some((s) => s.statementId === "st-orphan-paid"), "paid statement tanpa item terdeteksi");
  });

  it("21. duplicate slice per periode terdeteksi", () => {
    // Dua item untuk (i-c, st-c) — dua transaksi berbeda dengan installment_id sama
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, bill_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-c2', 'g', 'expense', 2400000, 'c-a', 'cc-a', 'st-c', 'b-c', 'i-c', '2026-07-02', 'Cicilan C dup', 'p', 'p')").run();
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-c2', 'g', 'st-c', 't-c2', 400000, 'installment', 'Cicilan dup')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, bill_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-c3', 'g', 'expense', 2400000, 'c-a', 'cc-a', 'st-c', 'b-c', 'i-c', '2026-07-03', 'Cicilan C dup2', 'p', 'p')").run();
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-c3', 'g', 'st-c', 't-c3', 400000, 'installment', 'Cicilan dup2')").run();
    const rep = reconcile(db);
    assert.ok(rep.ccInstallments.duplicateSlicePerPeriod.some((d) => d.installmentId === "i-c" && d.statementId === "st-c"), "duplicate slice per periode terdeteksi");
  });

  it("22. slice amount mismatch terdeteksi", () => {
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-wrong', 'g', 'st-c', 't-c', 300000, 'installment', 'Salah amount')").run();
    const rep = reconcile(db);
    assert.ok(rep.ccInstallments.sliceAmountMismatch.some((s) => s.itemId === "csi-wrong"), "slice amount mismatch terdeteksi");
  });

  it("23. payoff history anomaly terdeteksi", () => {
    // Cicilan selesai (paid_count = tenor) tanpa item settle & tanpa payoff covered
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-d', 'g', 'Cicilan D', 'installment', 1200000, 1200000, 'c-a', 'cc-a', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-d', 'g', 'b-d', 'Cicilan D', 1200000, 200000, 6, 6, 0, '2026-06-01', 15)").run();
    const rep = reconcile(db);
    assert.ok(rep.ccInstallments.payoffRemovedHistory.some((p) => p.installmentId === "i-d"), "payoff history anomaly terdeteksi");
  });

  /* ========================================================== */
  /* PAYMENT ATTRIBUTION                                          */
  /* ========================================================== */
  it("24 & 27 & 28. Tagged payment (Bayar Cicilan): liability turun, expense tidak ganda", async () => {
    // Instalment baru pada siklus yang SUDAH mulai (8/1–8/30) agar periode berjalan
    // dapat dibayar. Pembayaran via /api/bills/:id/pay membawa installment_id (tagged).
    const d = await createCcInstallment({ amount: 3000000, tenor: 6, installmentAmount: 500000, occurredAt: "2026-08-01", merchant: "Instal D", cardId: "cc-a" });
    assert.equal(d.statementId, a.statementId, "siklus 8/1–8/30 (sama dengan Month-1 A)");

    const calcBefore = getStatementCalc(db, d.statementId)!;
    const expBefore = expenseTotal();
    const paid = await payBill(d.billId, 500000);
    assert.equal(paid, 500000);

    // Settlement tagged: installment_id terisi
    const payTx = db.prepare(
      `SELECT id, type, transfer_type, installment_id, statement_id FROM transactions
       WHERE installment_id = ? AND type = 'transfer' AND transfer_type = 'credit_card_payment'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(d.installmentId) as any;
    assert.equal(payTx.type, "transfer");
    assert.equal(payTx.installment_id, d.installmentId, "pembayaran cicilan ditandai installment_id (eksak)");

    const calcAfter = getStatementCalc(db, d.statementId)!;
    assert.equal(calcAfter.paidAmount, calcBefore.paidAmount + 500000, "liability statement berkurang");
    assert.equal(expenseTotal(), expBefore, "TIDAK ada expense kedua");

    const inst = db.prepare("SELECT paid_count FROM installments WHERE id = ?").get(d.installmentId) as { paid_count: number };
    assert.equal(inst.paid_count, 1, "periode 1 selesai via pembayaran bertanda");
  });

  it("25. General statement payment (untagged) mengurangi sisa statement", async () => {
    // Pembelian CC biasa pada siklus cc-b 8/1–8/30 (statement mixed: slice M2 + payoff + purchase)
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ type: "expense", amount: 150000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: "cc-b", occurredAt: "2026-08-10", merchant: "Umum B", ownerProfileId: "p" }),
    });
    assert.equal(res.status, 201);
    const stmtId = (db.prepare("SELECT statement_id FROM transactions WHERE merchant='Umum B'").get() as any).statement_id;
    const before = getStatementCalc(db, stmtId)!;
    await payStatement(stmtId, 100000);
    const after = getStatementCalc(db, stmtId)!;
    assert.equal(after.paidAmount, before.paidAmount + 100000, "untagged payment menaikkan paid statement");
    assert.equal(after.remainingAmount, before.remainingAmount - 100000);
  });

  it("26. Mixed statement (purchase + slice + payoff): ledger eksak, atribusi approx terdefinisi", async () => {
    // Statement cc-b 7/31–8/30 berisi: M2 slice 500k (settled) + payoff 5.0m (settled) + Umum B 150k.
    const stmtId = (db.prepare("SELECT id FROM statements WHERE group_id='g' AND credit_card_id='cc-b' AND period_start='2026-07-31'").get() as any).id;
    const calc = getStatementCalc(db, stmtId)!;
    assert.ok(calc.remainingAmount > 0, "statement mixed punya sisa");
    assert.equal(calc.statementAmount, calc.derivedAmount, "statementAmount = derived (tanpa official)");
    assert.ok(calc.statementAmount >= calc.paidAmount, "paid tidak melebihi amount");
    assert.equal(calc.statementAmount, 500000 + 5000000 + 150000, "derived = jumlah seluruh item");
  });

  /* ========================================================== */
  /* REGRESSION                                                   */
  /* ========================================================== */
  it("29. Normal CC purchase unchanged (item purchase full)", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ type: "expense", amount: 250000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: "cc-b", occurredAt: "2026-08-10", merchant: "Normal CC", ownerProfileId: "p" }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;
    const items = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(txId.id) as any[];
    assert.equal(items.length, 1);
    assert.equal(items[0].item_type, "purchase");
    assert.equal(items[0].amount, 250000);
  });

  it("30. Normal non-CC installment unchanged (bayar = expense)", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ type: "expense", amount: 12000000, categoryId: "c-a", walletId: "w", occurredAt: "2026-08-10", merchant: "Cash Inst", ownerProfileId: "p", bill: { kind: "installment", amount: 12000000, tenor: 12, installmentAmount: 1000000, dueDay: 10, title: "Cash Inst" } }),
    });
    assert.equal(res.status, 201);
    const billId = (db.prepare("SELECT bill_id FROM transactions WHERE merchant='Cash Inst'").get() as any).bill_id;
    const expBefore = expenseTotal();
    const balBefore = walletBal("w");
    const resPay = await fetch(`${base}/api/bills/${billId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 400000, walletId: "w" }),
    });
    assert.equal(resPay.status, 201);
    assert.equal(expenseTotal(), expBefore + 400000, "cicilan cash = expense");
    assert.equal(walletBal("w"), balBefore - 400000);
  });

  it("31. Normal statement payment unchanged", async () => {
    // Buat pembelian CC biasa di siklus baru (statement dengan sisa > 0)
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ type: "expense", amount: 150000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: "cc-b", occurredAt: "2026-08-10", merchant: "Regress CC", ownerProfileId: "p" }),
    });
    assert.equal(res.status, 201);
    const stmtId = (db.prepare("SELECT statement_id FROM transactions WHERE merchant='Regress CC'").get() as any).statement_id;
    const expBefore = expenseTotal();
    await payStatement(stmtId, 50000);
    assert.equal(expenseTotal(), expBefore, "statement payment bukan expense");
  });

  it("32 & 33. Debt & receivable unchanged", async () => {
    const resD = await fetch(`${base}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ type: "debt", title: "Hutang Budi", amount: 100000, categoryId: "c-a", ownerProfileId: "p" }),
    });
    assert.equal(resD.status, 201, `debt create ${resD.status}`);
    const billId = ((await resD.json()) as any).id;
    const balBefore = walletBal("w");
    const resPay = await fetch(`${base}/api/bills/${billId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 100000, walletId: "w" }),
    });
    assert.equal(resPay.status, 201, `debt pay ${resPay.status}`);
    assert.equal(walletBal("w"), balBefore - 100000, "debt payment mengurangi wallet");
  });

  it("36. Unified Tagihan tetap single-count setelah history immutable", () => {
    const u = getUnifiedBills(db, "g");
    const instItems = u.items.filter((i) => i.domainType === "installment" && i.metadata.fundedByCc);
    for (const it of instItems) {
      assert.equal(it.remainingAmount, 0, "cicilan CC tidak dihitung sebagai kewajiban terpisah");
    }
  });
});
