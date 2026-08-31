import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Set DATA_DIR SEBELUM import db/index.js
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "catatin-r09-test-"));
process.env.CORS_ORIGIN = "";

const { db } = await import("../src/db/index.js");
const { createApp } = await import("../src/app.js");
const { createSession } = await import("../src/middleware/auth.js");
const { calculateCreditCardMetrics, getStatementCalc, syncInstallmentSlices } = await import("../src/services/statement-domain.js");
const { getUnifiedBills } = await import("../src/services/unified-bills.js");
const { reconcile } = await import("../src/db/reconcile.js");

let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let base = "";
let sid = "";

function walletBal(walletId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS bal FROM transactions WHERE wallet_id = ? AND group_id = 'g'",
    )
    .get(walletId) as { bal: number };
  return Number(row.bal);
}

function expenseTotal(): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE group_id = 'g' AND type = 'expense' AND source != 'transfer_out'")
    .get() as { total: number };
  return Number(row.total);
}

function incomeTotal(): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE group_id = 'g' AND type = 'income' AND source != 'opening_balance'")
    .get() as { total: number };
  return Number(row.total);
}

function cookie(): Record<string, string> {
  return { Cookie: `catatin_sid=${sid}` };
}

async function createCcInstallment(opts: {
  amount: number;
  tenor: number;
  installmentAmount: number;
  occurredAt: string;
  merchant: string;
  cardId?: string;
}): Promise<{ txId: string; billId: string; installmentId: string; statementId: string }> {
  const res = await fetch(`${base}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookie() },
    body: JSON.stringify({
      type: "expense",
      amount: opts.amount,
      categoryId: "c-a",
      paymentMethod: "Credit Card",
      creditCardId: opts.cardId ?? "cc-a",
      occurredAt: opts.occurredAt,
      merchant: opts.merchant,
      ownerProfileId: "p",
      bill: {
        kind: "installment",
        amount: opts.amount,
        tenor: opts.tenor,
        installmentAmount: opts.installmentAmount,
        dueDay: 15,
        title: `Cicilan ${opts.merchant}`,
      },
    }),
  });
  assert.equal(res.status, 201, `create CC installment status ${res.status}`);
  const { id: txId } = (await res.json()) as { id: string };

  const tx = db.prepare("SELECT bill_id, installment_id, statement_id FROM transactions WHERE id = ?").get(txId) as {
    bill_id: string;
    installment_id: string;
    statement_id: string;
  };
  return {
    txId,
    billId: tx.bill_id,
    installmentId: tx.installment_id,
    statementId: tx.statement_id,
  };
}

before(() => {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES ('g', 'Keluarga R09', 'p')").run();
    db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color) VALUES ('p', 'g', 'Admin', 'a@test.id', 'admin', 1, '#2563eb')").run();
    db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES ('c-a', 'g', 'Elektronik', 'expense', 1)").run();
    db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES ('w', 'g', 'BCA', 'p', 'personal')").run();
    // cc-a: statement_day 30 → siklus berikutnya (8/31–9/30) BELUM mulai pada hari ini (8/29)
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-a', 'g', 'CC BCA', 'BCA', '9999', 30, 15, 20000000, 'p', 'shared')").run();
    // cc-b: statement_day 15 → siklus 7/16–8/15 sudah ISSUED hari ini (8/29)
    db.prepare("INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope) VALUES ('cc-b', 'g', 'CC Mandiri', 'Mandiri', '1111', 15, 25, 20000000, 'p', 'shared')").run();
    // Modal wallet
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

describe("R09 — Installment + Credit Card financial domain", () => {
  /* ---------------------------------------------------------- */
  /* CREATION                                                    */
  /* ---------------------------------------------------------- */
  it("1-3. CC installment: kontrak cicilan benar; full principal TIDAK diposting sebagai item statement; slice periode benar", async () => {
    const r = await createCcInstallment({
      amount: 6000000,
      tenor: 12,
      installmentAmount: 500000,
      occurredAt: "2026-08-24",
      merchant: "Laptop R09",
    });

    const tx = db.prepare("SELECT type, amount, credit_card_id, statement_id, wallet_id, bill_id, installment_id FROM transactions WHERE id = ?").get(r.txId) as any;
    assert.equal(tx.type, "expense");
    assert.equal(tx.amount, 6000000);
    assert.equal(tx.credit_card_id, "cc-a");
    assert.equal(tx.wallet_id, null, "CC purchase tidak memakai wallet");
    assert.ok(tx.statement_id, "statement_id terisi");

    const bill = db.prepare("SELECT type, amount, credit_card_id, statement_id FROM bills WHERE id = ?").get(r.billId) as any;
    assert.equal(bill.type, "installment");
    assert.equal(bill.amount, 6000000);
    assert.equal(bill.credit_card_id, "cc-a");
    assert.equal(bill.statement_id, tx.statement_id, "bill terhubung ke statement pembelian");

    const inst = db.prepare("SELECT total_amount, installment_amount, tenor, paid_count, paid_amount FROM installments WHERE id = ?").get(r.installmentId) as any;
    assert.equal(inst.total_amount, 6000000);
    assert.equal(inst.installment_amount, 500000);
    assert.equal(inst.tenor, 12);
    assert.equal(inst.paid_count, 0);
    assert.equal(inst.paid_amount, 0);

    // Statement item: SLICE bukan full principal; item_type = installment
    const items = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(r.txId) as any[];
    assert.equal(items.length, 1, "hanya satu statement item");
    assert.equal(items[0].item_type, "installment");
    assert.equal(items[0].amount, 500000, "item statement = cicilan berjalan, bukan Rp6.000.000");
  });

  it("4. future commitment terpisah: currentOutstanding = 500k, futureInstallmentCommitment = 5.5jt", () => {
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 500000, "outstanding = slice berjalan");
    assert.equal(m.futureInstallmentCommitment, 5500000, "komitmen = sisa schedule");
    assert.equal(m.currentOutstanding + m.futureInstallmentCommitment, 6000000, "tidak ada penggandaan");
  });

  it("5. Unified Tagihan tidak menggandakan: totalUnpaid = 500k (statement), bukan 6.5jt", () => {
    const u = getUnifiedBills(db, "g");
    const instItem = u.items.find((i) => i.domainType === "installment");
    const stmtItem = u.items.find((i) => i.domainType === "credit_card_statement");
    assert.ok(instItem, "item cicilan ada");
    assert.ok(stmtItem, "item statement ada");
    assert.equal(instItem.remainingAmount, 0, "cicilan CC tidak dihitung sebagai kewajiban terpisah");
    assert.equal(instItem.metadata.fundedByCc, true, "metadata menandai cicilan via CC");
    assert.equal(stmtItem.remainingAmount, 500000, "statement = satu-satunya kewajiban berjalan");
    assert.equal(u.summary.totalUnpaid, 500000, "totalUnpaid tanpa double count");
  });

  it("27. Detail statement menampilkan transaksi cicilan penyusun (itemType installment)", async () => {
    const r = db.prepare("SELECT statement_id, id FROM transactions WHERE merchant = 'Laptop R09'").get() as any;
    const res = await fetch(`${base}/api/credit-card-statements/${r.statement_id}`, { headers: cookie() });
    assert.equal(res.status, 200);
    const { items } = (await res.json()) as any;
    const found = items.find((i: any) => i.transactionId === r.id);
    assert.ok(found, "item statement memuat transaksi cicilan");
    assert.equal(found.itemType, "installment");
    assert.equal(found.amount, 500000);
  });

  it("28. Detail cicilan menampilkan relasi kartu kredit (fundedByCc + creditCardId)", async () => {
    const r = db.prepare("SELECT bill_id FROM transactions WHERE merchant = 'Laptop R09'").get() as any;
    const res = await fetch(`${base}/api/bills/${r.bill_id}`, { headers: cookie() });
    assert.equal(res.status, 200);
    const { item } = (await res.json()) as any;
    assert.equal(item.domainType, "installment");
    assert.equal(item.creditCardId, "cc-a");
    assert.equal(item.metadata.fundedByCc, true);
  });

  /* ---------------------------------------------------------- */
  /* PAYMENT — periode cicilan via statement                      */
  /* ---------------------------------------------------------- */
  it("13-17. Bayar cicilan periode: wallet berkurang, liability turun, TANPA expense, outstanding tidak naik", async () => {
    const r = db.prepare("SELECT bill_id, installment_id FROM transactions WHERE merchant = 'Laptop R09'").get() as any;
    const balBefore = walletBal("w");
    const expBefore = expenseTotal();

    const res = await fetch(`${base}/api/bills/${r.bill_id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 500000, walletId: "w" }),
    });
    assert.equal(res.status, 201, `pay status ${res.status}`);
    const payBody = (await res.json()) as any;
    assert.equal(payBody.paid, 500000);
    const { id: payTxId } = payBody;

    // settlement, bukan expense
    const payTx = db.prepare("SELECT type, transfer_type, statement_id, installment_id, bill_id, wallet_id FROM transactions WHERE id = ?").get(payTxId) as any;
    assert.equal(payTx.type, "transfer");
    assert.equal(payTx.transfer_type, "credit_card_payment");
    assert.ok(payTx.statement_id, "settlement menarget statement eksak");
    assert.equal(payTx.installment_id, r.installment_id);

    assert.equal(walletBal("w"), balBefore - 500000, "wallet berkurang 500k");
    assert.equal(expenseTotal(), expBefore, "TIDAK ada expense kedua");

    const inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = ?").get(r.installment_id) as any;
    assert.equal(inst.paid_count, 1, "satu periode selesai");
    assert.equal(inst.paid_amount, 0);

    // Liabilities: statement lunas → outstanding 0; komitmen tetap 5.5jt
    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 0, "outstanding TIDAK naik — justru 0 setelah periode dibayar");
    assert.equal(m.futureInstallmentCommitment, 5500000, "komitmen tetap sesuai schedule");
  });

  it("18. Full payoff: sisa diposting sekali, settle tanpa expense, tanpa double count", async () => {
    const r = db.prepare("SELECT installment_id FROM transactions WHERE merchant = 'Laptop R09'").get() as any;
    const balBefore = walletBal("w");
    const expBefore = expenseTotal();

    const res = await fetch(`${base}/api/installments/${r.installment_id}/pay-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ walletId: "w" }),
    });
    assert.equal(res.status, 201, `pay-full status ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.paid, 5500000, "sisa cicilan = 6jt - 500k");

    assert.equal(walletBal("w"), balBefore - 5500000, "wallet berkurang sisa kewajiban");
    assert.equal(expenseTotal(), expBefore, "TIDAK ada expense dari payoff");

    const inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE id = ?").get(r.installment_id) as any;
    assert.equal(inst.paid_count, 12, "schedule selesai");
    assert.equal(inst.paid_amount, 0);

    // R09.1: item slice historis yang sudah settle TETAP ADA; item payoff = wakil sisa.
    const items = db.prepare(
      `SELECT csi.amount, csi.item_type, s.paid_amount AS stmt_paid, s.statement_amount
       FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       JOIN statements s ON s.id = csi.statement_id
       WHERE t.installment_id = ?
       ORDER BY csi.amount ASC`,
    ).all(r.installment_id) as any[];
    assert.equal(items.length, 2, "slice historis (500k) + item payoff (5.5jt)");
    const histSlice = items.find((i: any) => i.amount === 500000);
    const payoff = items.find((i: any) => i.amount === 5500000);
    assert.ok(histSlice, "slice periode pertama tetap ada (immutable)");
    assert.equal(histSlice.item_type, "installment");
    assert.ok(Number(histSlice.stmt_paid) >= 500000, "slice historis sudah settle");
    assert.ok(payoff, "item payoff ada");
    assert.equal(payoff.item_type, "installment");
    assert.ok(Number(payoff.stmt_paid) >= 5500000, "statement payoff lunas");

    const m = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m.currentOutstanding, 0, "outstanding nol setelah payoff");
    assert.equal(m.futureInstallmentCommitment, 0, "komitmen nol setelah payoff");
  });

  it("19-20. Partial & full statement payment (pembelian CC biasa) tetap normal", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 300000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-b",
        occurredAt: "2026-08-20",
        merchant: "Belanja Biasa",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const stmtId = (db.prepare("SELECT statement_id FROM transactions WHERE merchant = 'Belanja Biasa'").get() as any).statement_id;

    // Partial 100k
    const expBefore = expenseTotal();
    const p1 = await fetch(`${base}/api/credit-card-statements/${stmtId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 100000, walletId: "w" }),
    });
    assert.equal(p1.status, 201);
    let calc = getStatementCalc(db, stmtId)!;
    assert.equal(calc.paidAmount, 100000);
    assert.equal(calc.remainingAmount, 200000);
    assert.equal(expenseTotal(), expBefore, "pembayaran statement bukan expense");

    // Full 200k
    const p2 = await fetch(`${base}/api/credit-card-statements/${stmtId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 200000, walletId: "w" }),
    });
    assert.equal(p2.status, 201);
    calc = getStatementCalc(db, stmtId)!;
    assert.equal(calc.remainingAmount, 0);
    assert.equal(calc.status, "paid");
    assert.equal(expenseTotal(), expBefore, "pembayaran statement bukan expense (full)");
  });

  /* ---------------------------------------------------------- */
  /* DATE EDIT                                                    */
  /* ---------------------------------------------------------- */
  it("6. Edit tanggal dalam statement yang sama: linkage statement tetap; siklus belum mulai → tidak ada item prematur", async () => {
    const r = await createCcInstallment({
      amount: 2400000,
      tenor: 6,
      installmentAmount: 400000,
      occurredAt: "2026-09-05",
      merchant: "HP R09",
    });

    // Siklus 8/31–9/30 BELUM mulai (hari ini 8/29) → POST tidak memmaterialisasi slice.
    const itemsBefore = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(r.txId) as any[];
    assert.equal(itemsBefore.length, 0, "tidak ada item prematur (siklus belum mulai)");

    const res = await fetch(`${base}/api/transactions/${r.txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ occurredAt: "2026-09-10" }),
    });
    assert.equal(res.status, 200, `PATCH status ${res.status}`);

    const tx = db.prepare("SELECT occurred_at, statement_id FROM transactions WHERE id = ?").get(r.txId) as any;
    assert.equal(tx.occurred_at.slice(0, 10), "2026-09-10");
    assert.equal(tx.statement_id, r.statementId, "statement_id tidak berubah");

    const items = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(r.txId) as any[];
    assert.equal(items.length, 0, "tetap tanpa item (read/edit tidak memmaterialisasi siklus masa depan)");
  });

  it("7-9. Edit tanggal lintas cutoff (open → open): statement pindah, item lama dihapus, item baru dibuat", async () => {
    // Pembelian normal CC (bukan cicilan) untuk pengujian pemindahan antar siklus.
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 150000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-a",
        occurredAt: "2026-09-05",
        merchant: "Move R09",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;
    const before = db.prepare("SELECT statement_id, occurred_at FROM transactions WHERE id = ?").get(txId.id) as any;
    assert.equal(before.statement_id, r_stmt_cc_a("2026-09-05"), "statement awal = siklus 8/31–9/30");

    const resPatch = await fetch(`${base}/api/transactions/${txId.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ occurredAt: "2026-10-01" }),
    });
    assert.equal(resPatch.status, 200, `PATCH move status ${resPatch.status}: ${await resPatch.text()}`);

    const after = db.prepare("SELECT statement_id, occurred_at FROM transactions WHERE id = ?").get(txId.id) as any;
    assert.equal(after.occurred_at.slice(0, 10), "2026-10-01");
    assert.notEqual(after.statement_id, before.statement_id, "statement_id pindah ke siklus baru");

    const items = db.prepare("SELECT statement_id, amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(txId.id) as any[];
    assert.equal(items.length, 1, "hanya satu item (item lama dihapus, item baru dibuat)");
    assert.equal(items[0].statement_id, after.statement_id, "item ada di statement baru");
    assert.equal(items[0].amount, 150000);
    assert.equal(items[0].item_type, "purchase");
  });

  it("10. Target statement tidak aman → rollback total tanpa mutasi parsial", async () => {
    // Transaksi di siklus OPEN (8/16–9/15) cc-b, dipindah ke tanggal yang jatuh di siklus ISSUED (7/16–8/15).
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 120000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-b",
        occurredAt: "2026-08-20",
        merchant: "Rollback R09",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;
    const before = db.prepare("SELECT statement_id, occurred_at FROM transactions WHERE id = ?").get(txId.id) as any;
    const itemCountBefore = (db.prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE transaction_id = ?").get(txId.id) as any).n;

    const resPatch = await fetch(`${base}/api/transactions/${txId.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ occurredAt: "2026-08-10" }), // siklus 7/16–8/15 → issued
    });
    assert.equal(resPatch.status, 409, "target statement issued → ditolak");

    const after = db.prepare("SELECT statement_id, occurred_at FROM transactions WHERE id = ?").get(txId.id) as any;
    assert.equal(after.statement_id, before.statement_id, "statement_id tidak berubah");
    assert.equal(after.occurred_at, before.occurred_at, "tanggal tidak berubah");
    const itemCountAfter = (db.prepare("SELECT COUNT(*) AS n FROM credit_card_statement_items WHERE transaction_id = ?").get(txId.id) as any).n;
    assert.equal(itemCountAfter, itemCountBefore, "item statement tidak berubah");
  });

  it("11. Edit tanggal keluar dari statement ISSUED ditolak", async () => {
    // cc-b siklus 7/16–8/15 sudah issued (hari ini > 8/15)
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 90000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-b",
        occurredAt: "2026-08-10",
        merchant: "Issued R09",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;

    const resPatch = await fetch(`${base}/api/transactions/${txId.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ occurredAt: "2026-08-20" }), // ke siklus open
    });
    assert.equal(resPatch.status, 409, "pindah dari statement issued ditolak");
  });

  it("12. Edit tanggal keluar dari statement PAID ditolak", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 70000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-b",
        occurredAt: "2026-08-20",
        merchant: "Paid R09",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;
    const stmtId = (db.prepare("SELECT statement_id FROM transactions WHERE id = ?").get(txId.id) as any).statement_id;

    // Lunasi statement PENUH (statement berisi juga item Rollback 120k) → status paid
    const calcBefore = getStatementCalc(db, stmtId)!;
    const pay = await fetch(`${base}/api/credit-card-statements/${stmtId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: calcBefore.remainingAmount, walletId: "w" }),
    });
    assert.equal(pay.status, 201);
    assert.equal(getStatementCalc(db, stmtId)!.status, "paid");

    const resPatch = await fetch(`${base}/api/transactions/${txId.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ occurredAt: "2026-08-10" }),
    });
    assert.equal(resPatch.status, 409, "pindah dari statement paid ditolak");
  });

  /* ---------------------------------------------------------- */
  /* OUTSTANDING & METRICS                                        */
  /* ---------------------------------------------------------- */
  it("21-24. Outstanding = kewajiban ditagih; komitmen terpisah; paid → 0; orphan payment tidak dihitung", async () => {
    // cc-a: setelah payoff Laptop, masih ada HP cicilan + Move R09 (150k purchase).
    // HP cicilan: 2.4jt total, 6×400k, paid_count=0 — siklus 8/31–9/30 BELUM mulai,
    // sehingga slice HP TIDAK dimaterialisasi dan TIDAK dihitung sebagai kewajiban
    // (R09.1: tidak ada future billing; komitmen menampung semuanya = 2.4jt).
    // Move R09: 150k purchase, item pada siklus 10/1–10/31 open.
    const m1 = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(m1.currentOutstanding, 150000, "outstanding = Move R09 saja (HP belum ditagih)");
    assert.equal(m1.futureInstallmentCommitment, 2400000, "komitmen = seluruh kontrak HP (belum ada slice diposting)");

    // cc-b: statement siklus 8/16–9/15 lunas penuh (Rollback+Paid+Belanja dibayar);
    // siklus 7/16–8/15 (Issued R09) masih 90k → outstanding cc-b = 90k.
    const m2 = calculateCreditCardMetrics(db, "g", "cc-b")!;
    assert.equal(m2.currentOutstanding, 90000, "outstanding cc-b = sisa statement issued (Issued R09)");
    assert.equal(m2.futureInstallmentCommitment, 0, "tanpa cicilan di cc-b → komitmen 0");

    // Transaksi payment cicilan lama (expense + credit_card_id + installment_id, statement NULL)
    // tidak boleh menaikkan outstanding (regresi RC-4).
    const laptopInst = (db.prepare("SELECT installment_id FROM transactions WHERE merchant = 'Laptop R09'").get() as any).installment_id;
    const mBefore = calculateCreditCardMetrics(db, "g", "cc-a")!;
    db.prepare(
      "INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-legacy-pay', 'g', 'expense', 500000, 'c-a', 'cc-a', ?, '2026-08-25', 'Bayar Cicilan Lama', 'p', 'p')",
    ).run(laptopInst);
    const mAfter = calculateCreditCardMetrics(db, "g", "cc-a")!;
    assert.equal(mAfter.currentOutstanding, mBefore.currentOutstanding, "orphan payment expense tidak menaikkan outstanding");
  });

  it("25. Tidak ada duplikasi item statement per transaksi", () => {
    const dup = db
      .prepare(
        `SELECT statement_id, transaction_id, COUNT(*) AS n
         FROM credit_card_statement_items WHERE group_id = 'g'
         GROUP BY statement_id, transaction_id HAVING COUNT(*) > 1`,
      )
      .all();
    assert.equal(dup.length, 0, "tidak ada item statement duplikat");
  });

  /* ---------------------------------------------------------- */
  /* HISTORICAL RECONCILIATION                                    */
  /* ---------------------------------------------------------- */
  it("29. R09.1: sync ADALAH additive-only — item historis legacy tidak dihapus/diubah", () => {
    // Simulasi data lama: item purchase = full principal, statement unpaid.
    db.prepare("INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status) VALUES ('st-legacy', 'g', 'cc-a', '2026-07-01', '2026-07-30', 6000000, 0, '2026-08-15', 'open')").run();
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-legacy', 'g', 'Cicilan Lama', 'installment', 6000000, 0, 'c-a', 'cc-a', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-legacy', 'g', 'b-legacy', 'Cicilan Lama', 6000000, 500000, 12, 0, 0, '2026-07-01', 15)").run();
    db.prepare("INSERT INTO transactions (id, group_id, type, amount, category_id, credit_card_id, statement_id, bill_id, installment_id, occurred_at, merchant, owner_profile_id, created_by) VALUES ('t-legacy', 'g', 'expense', 6000000, 'c-a', 'cc-a', 'st-legacy', 'b-legacy', 'i-legacy', '2026-07-01', 'Legacy Laptop', 'p', 'p')").run();
    db.prepare("INSERT INTO credit_card_statement_items (id, group_id, statement_id, transaction_id, amount, item_type, description) VALUES ('csi-legacy', 'g', 'st-legacy', 't-legacy', 6000000, 'purchase', 'Legacy Laptop')").run();

    // Reconcile mendeteksi anomali (tidak menebak/memperbaiki)
    const repBefore = reconcile(db);
    assert.ok(repBefore.ccInstallments.fullPrincipalItems.some((i) => i.transactionId === "t-legacy"), "full-principal item terdeteksi");

    // sync dipanggil (jalur write) — HARUS tidak menghapus/mengubah item historis.
    syncInstallmentSlices(db, "g", "i-legacy");

    const item = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE id = 'csi-legacy'").get() as any;
    assert.equal(item.item_type, "purchase", "item legacy TIDAK diubah (immutable)");
    assert.equal(item.amount, 6000000, "amount legacy TIDAK diubah (immutable)");

    // Anomali tetap terdeteksi setelah sync — sync bukan alat perbaikan historis.
    const repAfter = reconcile(db);
    assert.ok(repAfter.ccInstallments.fullPrincipalItems.some((i) => i.transactionId === "t-legacy"), "tetap terdeteksi (dilaporkan, tidak ditebak)");
  });

  it("30. Data historis ambigu TIDAK ditebak: cicilan tanpa transaksi pembelian dibiarkan", async () => {
    // Cicilan terhubung kartu tetapi TIDAK ada transaksi pembelian → sync tidak boleh membuat item.
    db.prepare("INSERT INTO bills (id, group_id, title, type, amount, paid_amount, category_id, credit_card_id, is_active, owner_profile_id, notes) VALUES ('b-orphan', 'g', 'Cicilan Yatim', 'installment', 1200000, 0, 'c-a', 'cc-a', 1, 'p', '')").run();
    db.prepare("INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, paid_amount, start_date, due_day) VALUES ('i-orphan', 'g', 'b-orphan', 'Cicilan Yatim', 1200000, 200000, 6, 0, 0, '2026-08-01', 15)").run();

    const repBefore = reconcile(db);
    assert.ok(repBefore.ccInstallments.billsWithoutStatement.some((b) => b.billId === "b-orphan"), "bill tanpa statement terdeteksi");

    syncInstallmentSlices(db, "g", "i-orphan");

    const items = db.prepare(
      `SELECT COUNT(*) AS n FROM credit_card_statement_items csi
       JOIN transactions t ON t.id = csi.transaction_id
       WHERE t.installment_id = 'i-orphan'`,
    ).get() as any;
    assert.equal(items.n, 0, "tidak ada item yang dibuat untuk data ambigu");
  });

  /* ---------------------------------------------------------- */
  /* FINANCIAL INVARIANTS                                         */
  /* ---------------------------------------------------------- */
  it("31. Pembelian CC biasa tidak berubah: item purchase full + outstanding sesuai", async () => {
    // Statement siklus 8/16–9/15 sudah ada (Rollback 120k unpaid + Paid 70k lunas → remaining 120k).
    const stmtBefore = db
      .prepare("SELECT statement_id FROM transactions WHERE merchant = 'Rollback R09'")
      .get() as any;
    const remainingBefore = getStatementCalc(db, stmtBefore.statement_id)!.remainingAmount;

    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 250000,
        categoryId: "c-a",
        paymentMethod: "Credit Card",
        creditCardId: "cc-b",
        occurredAt: "2026-08-21",
        merchant: "Normal CC R09",
        ownerProfileId: "p",
      }),
    });
    assert.equal(res.status, 201);
    const txId = (await res.json()) as any;
    const items = db.prepare("SELECT amount, item_type FROM credit_card_statement_items WHERE transaction_id = ?").all(txId.id) as any[];
    assert.equal(items.length, 1);
    assert.equal(items[0].item_type, "purchase");
    assert.equal(items[0].amount, 250000);

    // Statement yang sama menaikkan remaining tepat sebesar pembelian baru.
    const tx2 = db.prepare("SELECT statement_id FROM transactions WHERE id = ?").get(txId.id) as any;
    assert.equal(tx2.statement_id, stmtBefore.statement_id, "masuk statement siklus yang sama");
    const remainingAfter = getStatementCalc(db, tx2.statement_id)!.remainingAmount;
    assert.equal(remainingAfter - remainingBefore, 250000, "item purchase full ditambahkan ke statement");
  });

  it("32. Cicilan non-CC tidak berubah: pembayaran = expense dari wallet", async () => {
    const res = await fetch(`${base}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({
        type: "expense",
        amount: 12000000,
        categoryId: "c-a",
        walletId: "w",
        occurredAt: "2026-08-10",
        merchant: "Cicilan Cash R09",
        ownerProfileId: "p",
        bill: { kind: "installment", amount: 12000000, tenor: 12, installmentAmount: 1000000, dueDay: 10, title: "Cicilan Cash" },
      }),
    });
    assert.equal(res.status, 201);
    const billId = (db.prepare("SELECT bill_id FROM transactions WHERE merchant = 'Cicilan Cash R09'").get() as any).bill_id;

    const balBefore = walletBal("w");
    const pay = await fetch(`${base}/api/bills/${billId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookie() },
      body: JSON.stringify({ amount: 400000, walletId: "w" }),
    });
    assert.equal(pay.status, 201);
    const inst = db.prepare("SELECT paid_count, paid_amount FROM installments WHERE bill_id = ?").get(billId) as any;
    assert.equal(inst.paid_count, 0, "periode belum selesai (parsial)");
    assert.equal(inst.paid_amount, 400000);
    assert.equal(walletBal("w"), balBefore - 400000, "wallet berkurang (expense normal)");
    assert.ok(!(db.prepare("SELECT statement_id FROM transactions WHERE merchant = 'Cicilan Cash R09'").get() as any).statement_id, "tidak ada statement untuk cicilan non-CC");
  });

  it("33-36. Wallet balances, expense, income tetap konsisten", () => {
    // Tidak ada pembayaran CC yang tercatat sebagai expense (settlement selalu transfer).
    const expenseSettlements = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'expense' AND transfer_type IS NOT NULL").get() as any).n;
    assert.equal(expenseSettlements, 0, "tidak ada pembayaran CC sebagai expense");

    // Tidak ada pembayaran cicilan CC yang tercatat sebagai expense
    // (pembayaran memiliki wallet_id; pembelian CC harusnya wallet NULL — isolasi wallet).
    const ccInstExpense = (db
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions t
         JOIN bills b ON b.id = t.bill_id
         WHERE t.type = 'expense' AND t.credit_card_id IS NOT NULL AND t.wallet_id IS NOT NULL AND b.type = 'installment'`,
      )
      .get() as any).n;
    assert.equal(ccInstExpense, 0, "pembayaran cicilan CC bukan expense");

    // Income: hanya opening balance yang tidak dihitung.
    assert.equal(incomeTotal(), 0, "tidak ada income non-opening-balance");

    // Wallet: balance = jumlah income - jumlah expense/transfer (konsistensi ledger).
    const totalWalletOut = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE group_id = 'g' AND wallet_id = 'w' AND type IN ('expense','transfer')").get() as any).t;
    const totalWalletIn = (db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE group_id = 'g' AND wallet_id = 'w' AND type = 'income'").get() as any).t;
    assert.equal(walletBal("w"), totalWalletIn - totalWalletOut, "wallet balance konsisten dengan ledger");
  });
});

/** Statement id untuk kartu cc-a berdasarkan tanggal (cutoff 30). */
function r_stmt_cc_a(iso: string): string {
  const row = db.prepare("SELECT s.id FROM statements s WHERE s.credit_card_id = 'cc-a' AND s.period_start <= ? AND s.period_end >= ?").get(iso, iso) as { id: string } | undefined;
  assert.ok(row, `statement cc-a untuk ${iso} ditemukan`);
  return row.id;
}
