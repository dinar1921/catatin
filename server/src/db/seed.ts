import { db } from "./index.js";
import { hash } from "@node-rs/argon2";

const now = new Date();

/** Tanggal hari-ke-`day` pada bulan (current month + offset), dibatasi tidak melewati hari ini untuk offset 0. */
function md(day: number, offset = 0): string {
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const dim = new Date(yy, mm + 1, 0).getDate();
  let d = Math.min(day, dim);
  if (offset === 0) d = Math.min(d, now.getDate());
  return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tanggal `days` hari yang lalu. */
function ago(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonthISO(): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonthISO(): string {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

interface TxSeed {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  categoryId: string | null;
  walletId: string | null;
  date: string;
  merchant: string;
  description: string;
  owner: string;
  extra?: Partial<{
    source: string;
    paymentMethod: string | null;
    creditCardId: string | null;
    statementId: string | null;
    billId: string | null;
    installmentId: string | null;
    attachment: { id: string; fileName: string; mimeType: string; dataUrl: string } | null;
    items: { itemName: string; quantity: number; unitPrice: number; totalPrice: number }[];
  }>;
}

const groupId = "g-dinar";

const members: { id: string; name: string; email: string; role: string; color: string }[] = [
  { id: "p-dinar", name: "Dinar", email: "dinar@keluarga.id", role: "admin", color: "#2456e6" },
  { id: "p-istri", name: "Istri", email: "istri@keluarga.id", role: "member", color: "#d64545" },
];

const wallets: { id: string; name: string; ownerProfileId: string | null; scope: "personal" | "shared" }[] = [
  { id: "w-bca-dinar", name: "BCA Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-mandiri", name: "Mandiri Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-cash", name: "Cash Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-bca-istri", name: "BCA Istri", ownerProfileId: "p-istri", scope: "personal" },
  { id: "w-keluarga", name: "Rekening Keluarga", ownerProfileId: null, scope: "shared" },
];

const categories: { id: string; name: string; direction: string; isDefault: boolean }[] = [
  { id: "c-gaji", name: "Gaji", direction: "income", isDefault: true },
  { id: "c-bonus", name: "Bonus", direction: "income", isDefault: true },
  { id: "c-lain-income", name: "Pendapatan Lain", direction: "income", isDefault: true },
  { id: "c-makan", name: "Makanan & Minuman", direction: "expense", isDefault: true },
  { id: "c-transport", name: "Transportasi", direction: "expense", isDefault: true },
  { id: "c-belanja", name: "Belanja Rumah", direction: "expense", isDefault: true },
  { id: "c-tagihan", name: "Tagihan & Utilitas", direction: "expense", isDefault: true },
  { id: "c-kesehatan", name: "Kesehatan", direction: "expense", isDefault: true },
  { id: "c-hiburan", name: "Hiburan", direction: "expense", isDefault: true },
  { id: "c-pendidikan", name: "Pendidikan", direction: "expense", isDefault: true },
  { id: "c-lain", name: "Lainnya", direction: "expense", isDefault: true },
];

const transactions: TxSeed[] = [
  { id: "t-ob1", type: "income", amount: 8_500_000, categoryId: "c-lain-income", walletId: "w-bca-dinar", date: md(1, -3), merchant: "Saldo Awal", description: "Saldo awal BCA Dinar", owner: "p-dinar", extra: { source: "opening_balance" } },
  { id: "t-ob2", type: "income", amount: 3_000_000, categoryId: "c-lain-income", walletId: "w-mandiri", date: md(1, -3), merchant: "Saldo Awal", description: "Saldo awal Mandiri", owner: "p-dinar", extra: { source: "opening_balance" } },
  { id: "t-ob3", type: "income", amount: 500_000, categoryId: "c-lain-income", walletId: "w-cash", date: md(1, -3), merchant: "Saldo Awal", description: "Saldo awal cash", owner: "p-dinar", extra: { source: "opening_balance" } },
  { id: "t-ob4", type: "income", amount: 2_500_000, categoryId: "c-lain-income", walletId: "w-bca-istri", date: md(1, -3), merchant: "Saldo Awal", description: "Saldo awal BCA Istri", owner: "p-istri", extra: { source: "opening_balance" } },
  { id: "t-ob5", type: "income", amount: 5_000_000, categoryId: "c-lain-income", walletId: "w-keluarga", date: md(1, -3), merchant: "Saldo Awal", description: "Saldo awal rekening keluarga", owner: "p-dinar", extra: { source: "opening_balance" } },

  { id: "t-s1", type: "income", amount: 9_000_000, categoryId: "c-gaji", walletId: "w-bca-dinar", date: md(1, -2), merchant: "PT Maju Bersama", description: "Gaji", owner: "p-dinar" },
  { id: "t-s2", type: "income", amount: 7_500_000, categoryId: "c-gaji", walletId: "w-bca-istri", date: md(1, -2), merchant: "CV Sejahtera", description: "Gaji", owner: "p-istri" },
  { id: "t-s3", type: "income", amount: 9_000_000, categoryId: "c-gaji", walletId: "w-bca-dinar", date: md(1, -1), merchant: "PT Maju Bersama", description: "Gaji", owner: "p-dinar" },
  { id: "t-s4", type: "income", amount: 7_500_000, categoryId: "c-gaji", walletId: "w-bca-istri", date: md(1, -1), merchant: "CV Sejahtera", description: "Gaji", owner: "p-istri" },
  { id: "t-s5", type: "income", amount: 9_000_000, categoryId: "c-gaji", walletId: "w-bca-dinar", date: md(1, 0), merchant: "PT Maju Bersama", description: "Gaji", owner: "p-dinar" },
  { id: "t-s6", type: "income", amount: 7_500_000, categoryId: "c-gaji", walletId: "w-bca-istri", date: md(1, 0), merchant: "CV Sejahtera", description: "Gaji", owner: "p-istri" },
  { id: "t-bonus", type: "income", amount: 1_200_000, categoryId: "c-bonus", walletId: "w-bca-dinar", date: md(10, 0), merchant: "PT Maju Bersama", description: "Bonus kinerja", owner: "p-dinar" },

  { id: "t-e1", type: "expense", amount: 350_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(1, 0), merchant: "Superindo", description: "Belanja mingguan", owner: "p-dinar" },
  { id: "t-e2", type: "expense", amount: 52_000, categoryId: "c-makan", walletId: "w-cash", date: md(2, 0), merchant: "Warung Bu Sari", description: "Makan siang", owner: "p-dinar" },
  { id: "t-e3", type: "expense", amount: 120_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(3, 0), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e4", type: "expense", amount: 85_000, categoryId: "c-hiburan", walletId: "w-bca-istri", date: md(4, 0), merchant: "CGV Cinemas", description: "Nonton bareng", owner: "p-istri" },
  { id: "t-e5", type: "expense", amount: 210_000, categoryId: "c-makan", walletId: "w-bca-dinar", date: md(5, 0), merchant: "Restoran Ayam Geprek", description: "Makan malam keluarga", owner: "p-dinar" },
  { id: "t-e6", type: "expense", amount: 96_000, categoryId: "c-transport", walletId: "w-bca-istri", date: md(6, 0), merchant: "Gojek", description: "Transport bulanan", owner: "p-istri" },
  { id: "t-e7", type: "expense", amount: 275_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(7, 0), merchant: "Alfamart", description: "Sembako", owner: "p-dinar" },
  { id: "t-e8", type: "expense", amount: 150_000, categoryId: "c-kesehatan", walletId: "w-mandiri", date: md(8, 0), merchant: "Apotek K24", description: "Obat keluarga", owner: "p-dinar" },
  { id: "t-e9", type: "expense", amount: 45_000, categoryId: "c-makan", walletId: "w-cash", date: md(9, 0), merchant: "Kopi Kenangan", description: "Ngopi", owner: "p-dinar" },
  { id: "t-e10", type: "expense", amount: 320_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(10, 0), merchant: "Indomaret", description: "Belanja bulanan", owner: "p-dinar" },
  { id: "t-e11", type: "expense", amount: 88_000, categoryId: "c-makan", walletId: "w-cash", date: md(11, 0), merchant: "Bakso Mas Joko", description: "Makan malam", owner: "p-dinar" },
  { id: "t-e12", type: "expense", amount: 130_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(12, 0), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e13", type: "expense", amount: 65_000, categoryId: "c-hiburan", walletId: "w-bca-dinar", date: md(13, 0), merchant: "Netflix", description: "Langganan streaming", owner: "p-dinar" },
  { id: "t-e14", type: "expense", amount: 240_000, categoryId: "c-makan", walletId: "w-bca-dinar", date: md(14, 0), merchant: "Superindo", description: "Belanja mingguan", owner: "p-dinar" },
  { id: "t-e15", type: "expense", amount: 105_000, categoryId: "c-transport", walletId: "w-bca-istri", date: md(15, 0), merchant: "Grab", description: "Transport", owner: "p-istri" },
  { id: "t-e16", type: "expense", amount: 185_000, categoryId: "c-belanja", walletId: "w-keluarga", date: md(16, 0), merchant: "IKEA", description: "Perlengkapan rumah", owner: "p-dinar" },
  { id: "t-e17", type: "expense", amount: 78_000, categoryId: "c-makan", walletId: "w-cash", date: md(17, 0), merchant: "Kopi Kenangan", description: "Ngopi", owner: "p-dinar" },
  { id: "t-e18", type: "expense", amount: 415_000, categoryId: "c-pendidikan", walletId: "w-bca-dinar", date: md(18, 0), merchant: "Kursus Online", description: "Langganan kursus", owner: "p-dinar" },
  { id: "t-e19", type: "expense", amount: 95_000, categoryId: "c-makan", walletId: "w-cash", date: md(19, 0), merchant: "Sate Pak Haji", description: "Makan malam", owner: "p-dinar" },
  { id: "t-e20", type: "expense", amount: 145_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(20, 0), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e21", type: "expense", amount: 260_000, categoryId: "c-kesehatan", walletId: "w-bca-dinar", date: md(21, 0), merchant: "Klinik Sehat", description: "Periksa dokter", owner: "p-dinar" },

  // Transaksi via Kartu Kredit BCA (statement st-bca) — jumlahnya = statement_amount.
  // walletId null: pembelian kartu kredit tidak mengurangi wallet kas.
  { id: "t-cc1", type: "expense", amount: 500_000, categoryId: "c-lain", walletId: null, date: md(2, 0), merchant: "Cicilan Motor (CC)", description: "Cicilan motor via Kartu Kredit BCA", owner: "p-dinar", extra: { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" } },
  { id: "t-cc2", type: "expense", amount: 300_000, categoryId: "c-lain", walletId: null, date: md(3, 0), merchant: "Hutang Budi (CC)", description: "Hutang Budi via Kartu Kredit BCA", owner: "p-dinar", extra: { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" } },
  { id: "t-cc3", type: "expense", amount: 200_000, categoryId: "c-belanja", walletId: null, date: md(4, 0), merchant: "Belanja (CC)", description: "Belanja via Kartu Kredit BCA", owner: "p-dinar", extra: { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" } },

  { id: "t-e22", type: "expense", amount: 380_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(5, -1), merchant: "Superindo", description: "Belanja mingguan", owner: "p-dinar" },
  { id: "t-e23", type: "expense", amount: 300_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(9, -1), merchant: "Alfamart", description: "Sembako", owner: "p-dinar" },
  { id: "t-e24", type: "expense", amount: 480_000, categoryId: "c-makan", walletId: "w-bca-dinar", date: md(13, -1), merchant: "Restoran Keluarga", description: "Makan keluarga", owner: "p-dinar" },
  { id: "t-e25", type: "expense", amount: 200_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(17, -1), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e26", type: "expense", amount: 150_000, categoryId: "c-hiburan", walletId: "w-bca-istri", date: md(20, -1), merchant: "Bioskop XXI", description: "Nonton", owner: "p-istri" },
  { id: "t-e27", type: "expense", amount: 350_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(24, -1), merchant: "Superindo", description: "Belanja bulanan", owner: "p-dinar" },
  { id: "t-e28", type: "expense", amount: 95_000, categoryId: "c-makan", walletId: "w-cash", date: md(27, -1), merchant: "Bakso Mas Joko", description: "Makan malam", owner: "p-dinar" },
  { id: "t-e29", type: "expense", amount: 260_000, categoryId: "c-makan", walletId: "w-bca-dinar", date: md(6, -1), merchant: "Superindo", description: "Belanja mingguan", owner: "p-dinar" },
  { id: "t-e30", type: "expense", amount: 140_000, categoryId: "c-kesehatan", walletId: "w-mandiri", date: md(11, -1), merchant: "Apotek K24", description: "Obat", owner: "p-dinar" },
  { id: "t-e31", type: "expense", amount: 220_000, categoryId: "c-belanja", walletId: "w-bca-istri", date: md(16, -1), merchant: "Pasaraya", description: "Belanja rumah", owner: "p-istri" },
  { id: "t-e32", type: "expense", amount: 110_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(22, -1), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e33", type: "expense", amount: 60_000, categoryId: "c-hiburan", walletId: "w-cash", date: md(26, -1), merchant: "Kopi Kenangan", description: "Ngopi", owner: "p-dinar" },

  { id: "t-e34", type: "expense", amount: 330_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(7, -2), merchant: "Superindo", description: "Belanja mingguan", owner: "p-dinar" },
  { id: "t-e35", type: "expense", amount: 290_000, categoryId: "c-makan", walletId: "w-bca-dinar", date: md(12, -2), merchant: "Restoran Ayam Geprek", description: "Makan keluarga", owner: "p-dinar" },
  { id: "t-e36", type: "expense", amount: 175_000, categoryId: "c-transport", walletId: "w-mandiri", date: md(15, -2), merchant: "Pertamina", description: "Isi bensin", owner: "p-dinar" },
  { id: "t-e37", type: "expense", amount: 95_000, categoryId: "c-hiburan", walletId: "w-bca-istri", date: md(18, -2), merchant: "Bioskop XXI", description: "Nonton", owner: "p-istri" },
  { id: "t-e38", type: "expense", amount: 245_000, categoryId: "c-belanja", walletId: "w-bca-dinar", date: md(21, -2), merchant: "Alfamart", description: "Sembako", owner: "p-dinar" },
  { id: "t-e39", type: "expense", amount: 125_000, categoryId: "c-kesehatan", walletId: "w-mandiri", date: md(24, -2), merchant: "Klinik Sehat", description: "Periksa", owner: "p-dinar" },
  { id: "t-e40", type: "expense", amount: 420_000, categoryId: "c-pendidikan", walletId: "w-bca-dinar", date: md(26, -2), merchant: "Kursus Online", description: "Langganan kursus", owner: "p-dinar" },
];

const bills: {
  id: string;
  title: string;
  type: string;
  amount: number;
  paidAmount: number;
  categoryId: string | null;
  walletId: string | null;
  creditCardId: string | null;
  statementId: string | null;
  counterparty: string | null;
  frequency: string | null;
  dueDay: number | null;
  dueDate: string | null;
  lastPaidPeriod: string | null;
  owner: string;
  notes: string;
}[] = [
  { id: "b-netflix", title: "Netflix", type: "recurring", amount: 186_000, paidAmount: 0, categoryId: "c-hiburan", walletId: null, creditCardId: null, statementId: null, counterparty: "Netflix", frequency: "bulanan", dueDay: 15, dueDate: null, lastPaidPeriod: null, owner: "p-dinar", notes: "Langganan premium family" },
  { id: "b-listrik", title: "Listrik PLN", type: "recurring", amount: 420_000, paidAmount: 420_000, categoryId: "c-tagihan", walletId: "w-bca-dinar", creditCardId: null, statementId: null, counterparty: "PLN", frequency: "bulanan", dueDay: 20, dueDate: null, lastPaidPeriod: monthKey(todayISO()), owner: "p-dinar", notes: "Rumah utama" },
  { id: "b-motor", title: "Cicilan Motor", type: "installment", amount: 12_000_000, paidAmount: 3_500_000, categoryId: "c-lain", walletId: null, creditCardId: null, statementId: null, counterparty: "Adira Finance", frequency: null, dueDay: 25, dueDate: null, lastPaidPeriod: null, owner: "p-dinar", notes: "Honda Beat, tenor 24 bulan" },
  { id: "b-hutang", title: "Hutang Budi", type: "debt", amount: 300_000, paidAmount: 0, categoryId: "c-lain", walletId: null, creditCardId: null, statementId: null, counterparty: "Budi", frequency: null, dueDay: null, dueDate: ago(3), lastPaidPeriod: null, owner: "p-dinar", notes: "Pinjam untuk servis motor" },
  { id: "b-cc", title: "Tagihan Kartu Kredit BCA", type: "credit_card_statement", amount: 1_000_000, paidAmount: 0, categoryId: "c-lain", walletId: null, creditCardId: "cc-bca", statementId: "st-bca", counterparty: "BCA", frequency: null, dueDay: 25, dueDate: null, lastPaidPeriod: null, owner: "p-dinar", notes: "Statement bulan ini (terbentuk dari 3 transaksi kartu kredit)" },
];

const attachStruk = {
  id: "att-struk",
  fileName: "struk-superindo.jpg",
  mimeType: "image/jpeg",
  dataUrl:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="#fbfcfe"/><g fill="#c9d4e6" font-family="monospace" font-size="11">${Array.from({ length: 22 }, (_, i) => `<text x="16" y="${16 + i * 13}">${i % 4 === 0 ? "SUPERINDO" : "................"} </text>`).join("")}</g><text x="16" y="272" font-family="monospace" font-size="16" font-weight="bold" fill="#1a3c78">TOTAL: RP350.000</text></svg>`,
    ),
};

export async function seedDatabase(): Promise<void> {
  const demoPwdHash = await hash("demo123");

  db.exec("BEGIN");
  try {
    // Clear existing
    for (const t of [
      "audit_logs", "settings", "telegram_chat_links", "api_keys", "sessions", "notifications",
      "drafts", "budgets", "statements", "credit_cards", "installments", "bills",
      "transactions", "categories", "wallets", "profiles", "groups",
    ]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }

    db.prepare("INSERT INTO groups (id, name, owner_profile_id) VALUES (?, ?, ?)").run(groupId, "Keluarga Dinar", "p-dinar");

    for (const m of members) {
      db.prepare("INSERT INTO profiles (id, group_id, name, email, role, is_active, color, password_hash) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(m.id, groupId, m.name, m.email, m.role, m.color, demoPwdHash);
    }

    for (const w of wallets) {
      db.prepare("INSERT INTO wallets (id, group_id, name, owner_profile_id, scope) VALUES (?, ?, ?, ?, ?)").run(w.id, groupId, w.name, w.ownerProfileId, w.scope);
    }

    for (const c of categories) {
      db.prepare("INSERT INTO categories (id, group_id, name, direction, is_default) VALUES (?, ?, ?, ?, ?)").run(c.id, groupId, c.name, c.direction, c.isDefault ? 1 : 0);
    }

    const insTx = db.prepare(`INSERT INTO transactions
      (id, group_id, type, source, amount, category_id, wallet_id, payment_method, credit_card_id, occurred_at, merchant, description, owner_profile_id, created_by, bill_id, installment_id, statement_id, attachment_json, items_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const t of transactions) {
      const extra = t.extra ?? {};
      const source = extra.source ?? "manual";
      const items = extra.items ?? [];
      const att = extra.attachment ?? null;
      insTx.run(
        t.id, groupId, t.type, source, t.amount, t.categoryId, t.walletId,
        extra.paymentMethod ?? null, extra.creditCardId ?? null, t.date, t.merchant, t.description,
        t.owner, t.owner, extra.billId ?? null, extra.installmentId ?? null, extra.statementId ?? null,
        att ? JSON.stringify(att) : null, JSON.stringify(items), new Date().toISOString(),
      );
    }

    const insBill = db.prepare(`INSERT INTO bills
      (id, group_id, title, type, amount, paid_amount, category_id, wallet_id, credit_card_id, statement_id, counterparty, frequency, due_day, due_date, last_paid_period, is_active, owner_profile_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    for (const b of bills) {
      insBill.run(b.id, groupId, b.title, b.type, b.amount, b.paidAmount, b.categoryId, b.walletId, b.creditCardId, b.statementId, b.counterparty, b.frequency, b.dueDay, b.dueDate, b.lastPaidPeriod, b.owner, b.notes);
    }

    db.prepare(`INSERT INTO installments (id, group_id, bill_id, title, total_amount, installment_amount, tenor, paid_count, start_date, due_day)
      VALUES ('i-motor', ?, 'b-motor', 'Cicilan Motor', 12000000, 500000, 24, 7, ?, 25)`)
      .run(groupId, md(25, -17));

    db.prepare(`INSERT INTO credit_cards (id, group_id, name, issuer, last_four, statement_day, due_day, credit_limit, owner_profile_id, scope)
      VALUES ('cc-bca', ?, 'Kartu Kredit BCA', 'BCA', '8842', 5, 25, 10000000, 'p-dinar', 'shared')`).run(groupId);

    db.prepare(`INSERT INTO statements (id, group_id, credit_card_id, period_start, period_end, statement_amount, paid_amount, due_date, status)
      VALUES ('st-bca', ?, 'cc-bca', ?, ?, 1000000, 0, ?, 'open')`)
      .run(groupId, startOfMonthISO(), endOfMonthISO(), ago(3));

    const insBudget = db.prepare("INSERT INTO budgets (id, group_id, category_id, amount, owner_profile_id) VALUES (?, ?, ?, ?, ?)");
    insBudget.run("bg-makan", groupId, "c-makan", 1_200_000, null);
    insBudget.run("bg-transport", groupId, "c-transport", 600_000, null);
    insBudget.run("bg-belanja", groupId, "c-belanja", 800_000, null);
    insBudget.run("bg-hiburan", groupId, "c-hiburan", 400_000, "p-dinar");

    const insDraft = db.prepare(`INSERT INTO drafts
      (id, group_id, source, transaction_type, amount, category_id, wallet_id, occurred_at, merchant, description, items_json, attachment_json, uncertain_fields_json, status, owner_profile_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insDraft.run("d-tg", groupId, "telegram", "expense", 50_000, "c-makan", null, todayISO(), "Beli makan", "Dari Telegram: beli makan 50rb", "[]", null, "[]", "draft", "p-dinar", todayISO());
    insDraft.run("d-ocr", groupId, "receipt_ocr", "expense", 350_000, "c-belanja", null, todayISO(), "Superindo", "Hasil scan struk: belanja mingguan", JSON.stringify([
      { itemName: "Beras 5kg", quantity: 1, unitPrice: 85_000, totalPrice: 85_000 },
      { itemName: "Minyak goreng", quantity: 2, unitPrice: 22_000, totalPrice: 44_000 },
    ]), JSON.stringify(attachStruk), JSON.stringify(["walletId", "paymentMethod"]), "in_review", "p-dinar", ago(1));
    insDraft.run("d-hrm", groupId, "hermes", "expense", 300_000, null, null, todayISO(), "Hutang Budi", "Dari Hermes: catat pembayaran hutang Budi", "[]", null, JSON.stringify(["categoryId"]), "draft", "p-dinar", todayISO());

    const insNotif = db.prepare("INSERT INTO notifications (id, group_id, kind, title, body, link_to, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    insNotif.run("n1", groupId, "draft", "Draft menunggu persetujuan", "3 draft dari Telegram, OCR, dan Hermes belum disetujui.", "/approvals", 0, ago(0));
    insNotif.run("n2", groupId, "due", "Netflix jatuh tempo bulan ini", "Tagihan Rp186.000 jatuh tempo tanggal 15.", "/bills/b-netflix", 0, ago(0));
    insNotif.run("n3", groupId, "overdue", "Hutang Budi melewati jatuh tempo", "Hutang Rp300.000 sudah 3 hari lewat jatuh tempo.", "/bills/b-hutang", 1, ago(1));

    db.exec("COMMIT");
    console.log("[seed] Database berhasil di-seed ulang dengan data demo.");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[seed] Gagal seed database:", err);
    process.exit(1);
  }
}
