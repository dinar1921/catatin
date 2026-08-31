import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-r092-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");
const { calculateCreditCardMetrics, getStatementCalc } = await import("../src/services/statement-domain.js");
const { reconcile } = await import("../src/db/reconcile.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sid = "";

function cookie(): Record<string, string> {
  return { Cookie: `catatin_sid=${sid}` };
}

function count(table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
}

before(() => {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Norm', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Admin', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g', 'Elektronik', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w', 'g', 'BCA', 'p', 'personal')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g', 'CC A', 'BCA', '0001', 30, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-b', 'g', 'CC B', 'Mandiri', '0002', 1, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-c', 'g', 'CC C', 'BNI', '0003', 1, 15, 20000000, 'p', 'shared')").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, source, amount, wallet_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-kas', 'g', 'income', 'opening_balance', 50000000, 'w', '2026-08-01', 'Kas', 'p', 'p')").run();
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

describe("R09.2 — Historical Normalization & Payoff Integrity", () => {
  /* ========================================================== */
  /* PAYOFF INTEGRITY — in-arrears slice retained                */
  /* ========================================================== */
  let arrearsInstallmentId = "";

  it("12 & 20. Payoff with in-arrears: slice historis DIPERTAHANKAN (subsumed, bukan dihapus)", async () => {
    // Purchase 7/1 (st=30) → M1 cycle 6/30–7/30 (sudah lewat, belum dibayar).
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense", amount: 6000000, categoryId: "c-a", paymentMethod: "Credit Card", creditCardId: "cc-a",
        occurredAt: "2026-07-01", merchant: "Arrears Laptop", ownerProfileId: "p",
        bill: { kind: "installment", amount: 6000000, tenor: 12, installmentAmount: 500000, dueDay: 15, title: "Arrears Laptop" },
      }),
    });
    assert.equal(res.status, 201);
    const { id: txId } = (await res.json()) as any;
    arrearsInstallmentId = (db.prepare("SELECT installment_id FROM transactions WHERE id = ?").get(txId) as any).installment_id;

    // Pastikan item M1 ada pada statement 7/1–7/30 (unpaid)
    const itemsBefore = db.prepare(
      `SELECT csi.id, csi.amount, s.period_start FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?`,
    ).all(arrearsInstallmentId) as any[];
    assert.equal(itemsBefore.length, 1, "M1 slice ada");
    assert.equal(String(itemsBefore[0].period_start), "2026-07-01");

    // Full payoff tanpa membayar M1
    const pay = await fetch(`${base}/api/installments/${arrearsInstallmentId}/pay-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ walletId: "w" }),
    });
    assert.equal(pay.status, 201, `pay-full ${pay.status}`);
    const { paid } = (await pay.json()) as any;
    assert.equal(paid, 6000000, "payoff = seluruh kontrak (belum ada yang dibayar)");

    // M1 slice TETAP ADA — ditandai subsumed oleh payoff, bukan dihapus
    const itemsAfter = db.prepare(
      `SELECT csi.id, csi.amount, csi.paid_by_transaction_id AS paidBy, s.period_start
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?`,
    ).all(arrearsInstallmentId) as any[];
    assert.equal(itemsAfter.length, 2, "M1 slice (subsumed) + item payoff");
    const m1 = itemsAfter.find((i: any) => i.amount === 500000);
    const payoffItem = itemsAfter.find((i: any) => i.amount === 6000000);
    assert.ok(m1, "M1 slice historis DIPERTAHANKAN");
    assert.ok(m1.paidBy, "M1 slice ditandai paid_by_transaction_id (settlement terpisah)");
    assert.ok(payoffItem, "item payoff ada");

    // Statement 7/1–7/30: koheren — derived 500k, paid 0, subsumed 500k → remaining 0, status paid
    const stmtM1 = (db.prepare("SELECT id FROM statements WHERE group_id='g' AND credit_card_id='cc-a' AND period_start='2026-07-01'").get() as any).id;
    const c1 = getStatementCalc(db, stmtM1)!;
    assert.equal(c1.derivedAmount, 500000, "history derived tetap");
    assert.equal(c1.subsumedAmount, 500000, "subsumed tercatat");
    assert.equal(c1.remainingAmount, 0, "tidak ada kewajiban tersisa");
    assert.equal(c1.status, "paid", "statement koheren (paid)");

    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 0, "outstanding 0 setelah payoff (tanpa double count)");
    assert.equal(m.futureInstallmentCommitment, 0, "commitment 0");

    const inst = db.prepare("SELECT paid_count FROM installments WHERE id = ?").get(arrearsInstallmentId) as { paid_count: number };
    assert.equal(inst.paid_count, 12, "installment completed");
  });

  it("13. Paid statement tetap koheren; payoffSubsumed terdeteksi di reconcile", () => {
    const rep = reconcile(db);
    assert.ok(rep.payoffSubsumedSlices.some((p) => p.installmentId === arrearsInstallmentId), "payoffSubsumedSlices terdeteksi");
    const stmtM1 = (db.prepare("SELECT id FROM statements WHERE group_id='g' AND credit_card_id='cc-a' AND period_start='2026-07-01'").get() as any).id;
    const sc = rep.statements.find((s) => s.id === stmtM1);
    assert.ok(sc, "statement M1 ada di laporan");
    assert.equal(sc.suspicious, false, "statement koheren tidak dicurigai");
    assert.equal(sc.derivedAmount, 500000);
    assert.equal(sc.subsumedAmount, 500000);
  });

  /* ========================================================== */
  /* SUSPICIOUS STATEMENTS — derived-based classification        */
  /* ========================================================== */
  it("10. Suspicious classification: full_principal (informational) vs deleted_item (ambiguous)", async () => {
    // (a) Statement koheren derived dengan item full-principal yang lunas → full_principal, TIDAK suspicious.
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-fp', 'g', 'cc-b', '2026-08-02', '2026-09-01', 0, 2000000, '2026-09-15', 'paid')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-fp', 'g', 'FP Inst', 'installment', 2000000, 0, 'c-a', 'cc-b', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-fp', 'g', 'b-fp', 'FP Inst', 2000000, 200000, 10, 0, 0, '2026-08-02', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, bill_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-fp', 'g', 'expense', 2000000, 'c-a', 'cc-b', 'st-fp', 'b-fp', 'i-fp', '2026-08-02', 'FP', 'p', 'p')").run();
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-fp', 'g', 'st-fp', 't-fp', 2000000, 'purchase', 'FP')").run();
    // Settlement 2jt
    db.prepare("INSERT INTO transactions (id, group_id, type, transfer_type, amount, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by, wallet_id) VALUES ('t-fp-pay', 'g', 'transfer', 'credit_card_payment', 2000000, 'cc-b', 'st-fp', '2026-08-10', 'Bayar', 'p', 'p', 'w')").run();
    db.prepare("UPDATE statements SET paid_amount = 2000000 WHERE id = 'st-fp'").run();

    // (b) Statement paid tanpa item → deleted_item_or_overpayment, suspicious.
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-empty', 'g', 'cc-b', '2026-07-02', '2026-08-01', 0, 500000, '2026-08-15', 'paid')").run();
    // Settlement sehingga calc.paidAmount > 0
    db.prepare("INSERT INTO transactions (id, group_id, type, transfer_type, amount, credit_card_id, statement_id, occurred_at, merchant, owner_profile_id, created_by, wallet_id) VALUES ('t-empty-pay', 'g', 'transfer', 'credit_card_payment', 500000, 'cc-b', 'st-empty', '2026-07-10', 'Bayar', 'p', 'p', 'w')").run();

    const rep = reconcile(db);
    const fp = rep.statements.find((s) => s.id === "st-fp");
    const empty = rep.statements.find((s) => s.id === "st-empty");
    assert.ok(fp, "st-fp ada");
    assert.equal(fp.cause, "full_principal", "full_principal terklasifikasi");
    assert.equal(fp.suspicious, false, "full_principal koheren → bukan suspicious");
    assert.equal(fp.classification, "informational");
    assert.ok(empty, "st-empty ada");
    assert.equal(empty.cause, "deleted_item_or_overpayment", "deleted_item terklasifikasi");
    assert.equal(empty.suspicious, true, "paid tanpa item → suspicious");
    assert.equal(empty.classification, "ambiguous");

    // fullPrincipalItems: repairable hanya bila statement paid = 0
    const fpItem = rep.ccInstallments.fullPrincipalItems.find((f) => f.transactionId === "t-fp");
    assert.ok(fpItem, "full-principal item terdeteksi");
    assert.equal(fpItem.repairable, false, "statement paid → tidak repairable (ambigu)");
    assert.equal(fpItem.classification, "ambiguous");
  });

  /* ========================================================== */
  /* CANONICAL PERIODS & OVERLAPS                                 */
  /* ========================================================== */
  it("1 & 2. Overlap kanonikal deterministik vs ambigu (tidak disentuh)", () => {
    // cc-c statement_day=1 → cycle kanonikal untuk 8/2 = 8/2–9/1
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-x', 'g', 'cc-c', '2026-08-02', '2026-09-01', 0, 0, '2026-09-15', 'open')").run();
    // Non-kanonikal KOSONG yang TERKANDUNG → deterministicMerge
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-y', 'g', 'cc-c', '2026-08-02', '2026-08-31', 0, 0, '2026-09-15', 'open')").run();
    // Non-kanonikal KOSONG yang MELAMPAUI (8/1) → ambiguous
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-z', 'g', 'cc-c', '2026-08-01', '2026-08-31', 0, 0, '2026-09-15', 'open')").run();

    const rep = reconcile(db);
    const cx = rep.canonicalPeriods.find((c) => c.statementId === "st-x");
    const cy = rep.canonicalPeriods.find((c) => c.statementId === "st-y");
    const cz = rep.canonicalPeriods.find((c) => c.statementId === "st-z");
    assert.equal(cx?.canonical, true, "st-x kanonikal");
    assert.equal(cy?.canonical, false, "st-y non-kanonikal");
    assert.equal(cz?.canonical, false, "st-z non-kanonikal");

    const mergeY = rep.overlappingStatements.find((o) => (o.a === "st-y" && o.b === "st-x") || (o.a === "st-x" && o.b === "st-y"));
    const mergeZ = rep.overlappingStatements.find((o) => (o.a === "st-z" && o.b === "st-x") || (o.a === "st-x" && o.b === "st-z"));
    assert.ok(mergeY, "pasangan st-y/st-x terdeteksi");
    assert.equal(mergeY.deterministicMerge, true, "st-y kosong & terkandung → merge deterministik");
    assert.equal(mergeY.classification, "deterministicRepairable");
    assert.ok(mergeZ, "pasangan st-z/st-x terdeteksi");
    assert.equal(mergeZ.deterministicMerge, false, "st-z melampaui periode kanonikal → ambigu");
    assert.equal(mergeZ.classification, "ambiguous");
  });

  it("11. Normalisasi tidak menghapus item historis (reconcile read-only)", () => {
    const before = { stmts: count("statements"), items: count("credit_card_statement_items"), txs: count("transactions") };
    reconcile(db);
    assert.equal(count("statements"), before.stmts, "reconcile tidak menghapus statement");
    assert.equal(count("credit_card_statement_items"), before.items, "reconcile tidak menghapus item");
    assert.equal(count("transactions"), before.txs, "reconcile tidak menghapus transaksi");
  });

  /* ========================================================== */
  /* LEGACY PAYMENT CLASSIFICATION                                */
  /* ========================================================== */
  it("5, 6 & 7. Legacy classification A/B/C — report-only, records TIDAK diubah", async () => {
    // B: purchase (wallet NULL)
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-purchase', 'g', 'expense', 1000000, 'c-a', 'cc-a', 'i-fp', '2026-08-01', 'Pembelian', 'p', 'p')").run();
    // A: payment dengan wallet + statement target kanonikal ada (st-x = 8/2–9/1; payment 8/5 → cycle 8/2–9/1)
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-pay-a', 'g', 'expense', 500000, 'c-a', 'w', 'cc-b', 'i-fp', '2026-08-05', 'Bayar Period', 'p', 'p')").run();
    // C: payment dengan wallet + statement target TIDAK ada (payment 2026-09-10 → cycle 9/2–10/1, tidak ada statement)
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, wallet_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-pay-c', 'g', 'expense', 500000, 'c-a', 'w', 'cc-b', 'i-fp', '2026-09-10', 'Bayar Ambigu', 'p', 'p')").run();

    const rep = reconcile(db);
    const a = rep.ccInstallments.legacyPayments.find((l) => l.transactionId === "t-pay-a");
    const b = rep.ccInstallments.legacyPayments.find((l) => l.transactionId === "t-purchase");
    const c = rep.ccInstallments.legacyPayments.find((l) => l.transactionId === "t-pay-c");
    assert.ok(a, "A terdeteksi");
    assert.equal(a.classification, "A", "payment dengan target statement deterministik → A");
    assert.equal(a.targetStatementId, "st-fp", "target statement teridentifikasi");
    assert.ok(b, "B terdeteksi");
    assert.equal(b.classification, "B", "purchase tanpa wallet → B (jangan reklasifikasi)");
    assert.ok(c, "C terdeteksi");
    assert.equal(c.classification, "C", "target statement tidak ada → C (ambigu)");

    // REPORT-ONLY: tidak ada reklasifikasi otomatis
    const stillExpense = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE id IN ('t-pay-a','t-pay-c','t-purchase') AND type = 'expense'").get() as { n: number }).n;
    assert.equal(stillExpense, 3, "tidak ada yang direklasifikasi (report-only)");
  });

  /* ========================================================== */
  /* MISSING SETTLED SLICE — report-only                         */
  /* ========================================================== */
  it("8 & 9. Missing settled slice terdeteksi; tidak difabrikasi", () => {
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-ms', 'g', 'MS Inst', 'installment', 2400000, 0, 'c-a', 'cc-b', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-ms', 'g', 'b-ms', 'MS Inst', 2400000, 200000, 12, 1, 0, '2026-08-02', 15)").run();

    const rep = reconcile(db);
    assert.ok(rep.ccInstallments.settledSlicesMissing.some((s) => s.installmentId === "i-ms"), "missing settled slice terdeteksi");
    // Tidak ada perbaikan otomatis: tetap tanpa item
    const items = db.prepare(
      `SELECT COUNT(*) AS n FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id WHERE t.installment_id = 'i-ms'`,
    ).get() as { n: number };
    assert.equal(items.n, 0, "tidak ada item yang difabrikasi");
  });

  /* ========================================================== */
  /* RECONCILE V3 — struktur & klasifikasi                       */
  /* ========================================================== */
  it("14. Reconcile v3: semua section & klasifikasi tersedia", () => {
    const rep = reconcile(db);
    assert.ok(Array.isArray(rep.canonicalPeriods), "canonicalPeriods ada");
    assert.ok(Array.isArray(rep.overlappingStatements), "overlappingStatements ada");
    assert.ok(Array.isArray(rep.ccInstallments.legacyPayments), "legacyPayments ada");
    assert.ok(Array.isArray(rep.payoffSubsumedSlices), "payoffSubsumedSlices ada");
    for (const s of rep.statements) {
      assert.ok(["deterministicRepairable", "ambiguous", "informational"].includes(s.classification), "statement classification valid");
    }
    for (const c of rep.canonicalPeriods) {
      assert.ok(["deterministicRepairable", "ambiguous", "informational"].includes(c.classification), "canonical classification valid");
    }
  });

  it("17. Row-count integrity: payoff & reconcile tidak mengubah jumlah baris secara tak terduga", () => {
    const counts = {
      statements: count("statements"),
      items: count("credit_card_statement_items"),
      installments: count("installments"),
      bills: count("bills"),
    };
    // Payoff baru (dengan in-arrears) menambah 1 transaksi + 1 item payoff — sudah diuji di test 12.
    // Di sini: reconcile read-only tidak mengubah apa pun.
    const before = { ...counts };
    reconcile(db);
    assert.equal(count("statements"), before.statements);
    assert.equal(count("credit_card_statement_items"), before.items);
    assert.equal(count("installments"), before.installments);
    assert.equal(count("bills"), before.bills);
  });
});
