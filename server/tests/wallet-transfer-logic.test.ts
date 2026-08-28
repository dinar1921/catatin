import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identifyTransferPairs, buildLogicalTransferRows, isWalletTransfer } from "../../src/lib/transfer.js";
import {
  sumExpense,
  sumIncome,
  monthSpendThis,
  monthIncomeThis,
  walletBalance,
  isCreditCardSettlement,
} from "../../src/lib/derive.js";
import type { AppData, Transaction } from "../../src/lib/types.js";

/* ------------------------------------------------------------------ */
/* Helper membuat transaksi mock                                       */
/* ------------------------------------------------------------------ */
let seq = 0;
function mkTx(partial: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: partial.id ?? `t-${seq}`,
    groupId: partial.groupId ?? "g-1",
    type: partial.type ?? "expense",
    source: partial.source ?? "manual",
    amount: partial.amount ?? 0,
    categoryId: partial.categoryId ?? null,
    walletId: partial.walletId ?? "w-1",
    paymentMethod: partial.paymentMethod ?? null,
    creditCardId: partial.creditCardId ?? null,
    transferType: partial.transferType ?? null,
    occurredAt: partial.occurredAt ?? "2026-08-28",
    merchant: partial.merchant ?? "",
    description: partial.description ?? "",
    ownerProfileId: partial.ownerProfileId ?? "p-1",
    createdBy: partial.createdBy ?? "p-1",
    billId: partial.billId ?? null,
    installmentId: partial.installmentId ?? null,
    attachment: partial.attachment ?? null,
    items: partial.items ?? [],
    createdAt: partial.createdAt ?? "2026-08-28T00:00:00.000Z",
  };
}

/** Membuat pasangan transfer wallet yang valid. */
function mkTransfer(overrides?: { groupId?: string; createdBy?: string }) {
  const groupId = overrides?.groupId ?? "g-1";
  const createdBy = overrides?.createdBy ?? "p-1";
  const out = mkTx({
    id: "out-1",
    groupId,
    createdBy,
    type: "expense",
    source: "transfer_out",
    amount: 1200000,
    walletId: "w-bca",
    occurredAt: "2026-08-28",
    merchant: "BCA Dinar",
    description: "Transfer ke Cash Dinar",
  });
  const inc = mkTx({
    id: "inc-1",
    groupId,
    createdBy,
    type: "income",
    source: "transfer_in",
    amount: 1200000,
    walletId: "w-cash",
    occurredAt: "2026-08-28",
    merchant: "Cash Dinar",
    description: "Transfer dari BCA Dinar",
  });
  return { out, inc };
}

/* ------------------------------------------------------------------ */
describe("Transfer wallet — pasangan & baris logis", () => {
  it("1. Satu pasangan transfer dirender sekali (baris logis = 1)", () => {
    const { out, inc } = mkTransfer();
    const pairs = identifyTransferPairs([out, inc]);
    assert.equal(pairs.size, 2, "kedua sisi terpetakan ke pasangan yang sama");

    const logical = buildLogicalTransferRows([out, inc], pairs);
    assert.equal(logical.length, 1, "hanya 1 baris logis");
    assert.equal(logical[0].id, out.id, "wakil = sisi transfer_out");
  });

  it("2. Jumlah logis = 1 (bukan 2)", () => {
    const { out, inc } = mkTransfer();
    const pairs = identifyTransferPairs([out, inc]);
    const logical = buildLogicalTransferRows([out, inc], pairs);
    assert.equal(logical.length, 1);
  });

  it("4. Transfer tidak muncul di dua halaman (paginasi memakai baris logis)", () => {
    // 100 baris ledger mentah dengan 10 pasangan transfer → 90 baris logis
    const txs: Transaction[] = [];
    for (let i = 0; i < 10; i++) {
      txs.push(
        mkTx({ id: `o${i}`, source: "transfer_out", type: "expense", amount: 100000, walletId: "w-a", occurredAt: "2026-08-27", merchant: "A", description: `Transfer ke B${i}` }),
        mkTx({ id: `i${i}`, source: "transfer_in", type: "income", amount: 100000, walletId: "w-b", occurredAt: "2026-08-27", merchant: `B${i}`, description: "Transfer dari A" }),
      );
    }
    for (let i = 0; i < 80; i++) txs.push(mkTx({ id: `n${i}`, amount: 5000, merchant: "Normal" }));
    assert.equal(txs.length, 100);

    const pairs = identifyTransferPairs(txs);
    const logical = buildLogicalTransferRows(txs, pairs);
    assert.equal(logical.length, 90, "100 ledger − 10 pasangan = 90 logis");
  });

  it("5. Filter wallet asal → 1 baris transfer", () => {
    const { out, inc } = mkTransfer();
    const onlyOut = [out]; // filter wallet asal hanya menyisakan transfer_out
    const pairs = identifyTransferPairs([out, inc]);
    const logical = buildLogicalTransferRows(onlyOut, pairs);
    assert.equal(logical.length, 1);
    assert.equal(logical[0].id, out.id);
  });

  it("6. Filter wallet tujuan → 1 baris transfer", () => {
    const { out, inc } = mkTransfer();
    const onlyIn = [inc]; // filter wallet tujuan hanya menyisakan transfer_in
    const pairs = identifyTransferPairs([out, inc]);
    const logical = buildLogicalTransferRows(onlyIn, pairs);
    assert.equal(logical.length, 1);
    assert.equal(logical[0].id, inc.id, "transfer_in tampil sebagai wakil bila transfer_out tidak lolos filter");
  });

  it("7. Pasangan ambigu tidak digabung (dua transfer_out identik mengklaim satu transfer_in)", () => {
    const { out, inc } = mkTransfer();
    // Salinan duplikat transfer_out yang identik (data anomali)
    const out2 = mkTx({
      id: "out-2",
      groupId: "g-1",
      createdBy: "p-1",
      type: "expense",
      source: "transfer_out",
      amount: 1200000,
      walletId: "w-bca2",
      occurredAt: "2026-08-28",
      merchant: "BCA Dinar",
      description: "Transfer ke Cash Dinar",
    });
    // out & out2 sama-sama cocok dengan inc → inc diklaim 2 kali → ambigu
    const pairs = identifyTransferPairs([out, out2, inc]);
    assert.equal(pairs.size, 0, "TIDAK boleh digabung saat ambigu");
  });

  it("8. Group berbeda tidak digabung", () => {
    const a = mkTransfer({ groupId: "g-1" });
    const b = mkTransfer({ groupId: "g-2" });
    // out grup A + inc grup B (merchant/deskripsi cocok tapi grup beda)
    const mixedOut = { ...a.out };
    const mixedInc = { ...b.inc, merchant: "Cash Dinar", description: "Transfer dari BCA Dinar" };
    const pairs = identifyTransferPairs([mixedOut, mixedInc]);
    assert.equal(pairs.size, 0, "group berbeda → tidak dipasangkan");
  });

  it("9. created_by berbeda tidak digabung", () => {
    const a = mkTransfer({ createdBy: "p-1" });
    const b = mkTransfer({ createdBy: "p-2" });
    const mixedInc = { ...b.inc, merchant: "Cash Dinar", description: "Transfer dari BCA Dinar" };
    const pairs = identifyTransferPairs([a.out, mixedInc]);
    assert.equal(pairs.size, 0, "created_by berbeda → tidak dipasangkan");
  });

  it("10. Amount/date sama tapi relasi wallet berbeda tidak digabung", () => {
    // deskripsi tidak saling merujuk → bukan pasangan
    const out = mkTx({ id: "o-x", source: "transfer_out", type: "expense", amount: 500000, walletId: "w-a", occurredAt: "2026-08-28", merchant: "Toko X", description: "Transfer ke Toko Y" });
    const inc = mkTx({ id: "i-x", source: "transfer_in", type: "income", amount: 500000, walletId: "w-b", occurredAt: "2026-08-28", merchant: "Pasar Z", description: "Transfer dari Toko W" });
    const pairs = identifyTransferPairs([out, inc]);
    assert.equal(pairs.size, 0, "relasi deskripsi tidak melengkapi → tidak digabung");
  });
});

describe("Transfer wallet — agregasi & balance", () => {
  const { out, inc } = mkTransfer();
  const cashTx = mkTx({ id: "exp", amount: 100000, merchant: "Superindo", categoryId: "c-1", walletId: "w-bca" });
  const incTx = mkTx({ id: "inc2", type: "income", amount: 500000, merchant: "Gaji", walletId: "w-bca" });

  function appData(txs: Transaction[]): AppData {
    return {
      group: { id: "g-1", name: "Keluarga", ownerProfileId: "p-1" },
      members: [{ id: "p-1", name: "Dinar", groupId: "g-1", email: "", role: "admin", isActive: true, color: "#000" }],
      wallets: [
        { id: "w-bca", name: "BCA Dinar", scope: "personal", ownerProfileId: "p-1" },
        { id: "w-cash", name: "Cash Dinar", scope: "personal", ownerProfileId: "p-1" },
      ],
      categories: [{ id: "c-1", name: "Belanja", direction: "expense", isDefault: false }],
      transactions: txs,
      bills: [],
      installments: [],
      creditCards: [],
      statements: [],
      budgets: [],
      drafts: [],
      notifications: [],
    };
  }

  it("12. Saldo wallet tetap benar: asal −, tujuan +", () => {
    const data = appData([out, inc]);
    assert.equal(walletBalance(data, "w-bca"), -1200000, "BCA berkurang 1.200.000");
    assert.equal(walletBalance(data, "w-cash"), 1200000, "Cash bertambah 1.200.000");
  });

  it("13 & 14. Transfer kontribusi 0 ke expense dan income", () => {
    const data = appData([out, inc, cashTx, incTx]);
    assert.equal(sumExpense([out, cashTx]), 100000, "transfer_out tidak dihitung expense");
    assert.equal(sumIncome([inc, incTx]), 500000, "transfer_in tidak dihitung income");
  });

  it("15. monthSpendThis mengecualikan transfer_out", () => {
    const data = appData([out, inc, cashTx]);
    const spend = monthSpendThis(data, "all");
    assert.equal(spend, 100000, "hanya expense normal yang dihitung");
  });

  it("16. monthIncomeThis mengecualikan transfer_in", () => {
    const data = appData([out, inc, incTx]);
    const inc_ = monthIncomeThis(data, "all");
    assert.equal(inc_, 500000, "hanya income normal yang dihitung");
  });

  it("17. Pembayaran kartu kredit TIDAK terpengaruh logika transfer wallet", () => {
    const cc = mkTx({
      id: "cc-pay",
      type: "transfer",
      source: "manual",
      transferType: "credit_card_payment",
      amount: 2000000,
      walletId: "w-bca",
      creditCardId: "cc-1",
      merchant: "Kartu Kredit",
    });
    assert.equal(isWalletTransfer(cc), false, "bukan wallet transfer");
    assert.equal(isCreditCardSettlement(cc), true, "tetap settlement kartu kredit");
    const pairs = identifyTransferPairs([cc]);
    assert.equal(pairs.size, 0, "tidak dipasangkan sebagai transfer wallet");
  });

  it("18. Pembayaran kartu kredit tetap dikecualikan dari expense", () => {
    const cc = mkTx({ id: "cc-pay", type: "transfer", transferType: "credit_card_payment", amount: 2000000 });
    assert.equal(sumExpense([cc]), 0);
  });

  it("19. Income normal tidak berubah", () => {
    const incTx = mkTx({ id: "n", type: "income", amount: 750000, source: "manual" });
    assert.equal(sumIncome([incTx]), 750000);
  });

  it("20. Expense normal tidak berubah", () => {
    const expTx = mkTx({ id: "n", amount: 250000, source: "manual" });
    assert.equal(sumExpense([expTx]), 250000);
  });
});
