import type {
  AppData,
  Attachment,
  Bill,
  Budget,
  Category,
  CreditCard,
  CreditCardStatement,
  Draft,
  Installment,
  Profile,
  Transaction,
  Wallet,
} from "../lib/types";
import { endOfMonthISO, monthKey, startOfMonthISO, todayISO } from "../lib/dates";

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

/** Tanggal `days` hari yang lalu (untuk due date / notifikasi). */
function ago(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const members: Profile[] = [
  { id: "p-dinar", name: "Dinar", email: "dinar@keluarga.id", role: "admin", isActive: true, color: "#2456e6" },
  { id: "p-istri", name: "Istri", email: "istri@keluarga.id", role: "member", isActive: true, color: "#d64545" },
];

const wallets: Wallet[] = [
  { id: "w-bca-dinar", name: "BCA Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-mandiri", name: "Mandiri Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-cash", name: "Cash Dinar", ownerProfileId: "p-dinar", scope: "personal" },
  { id: "w-bca-istri", name: "BCA Istri", ownerProfileId: "p-istri", scope: "personal" },
  { id: "w-keluarga", name: "Rekening Keluarga", ownerProfileId: null, scope: "shared" },
];

const categories: Category[] = [
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

function tx(
  id: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string,
  walletId: string,
  date: string,
  merchant: string,
  description: string,
  owner: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    type,
    source: "manual",
    amount,
    categoryId,
    walletId,
    paymentMethod: null,
    creditCardId: null,
    occurredAt: date,
    merchant,
    description,
    ownerProfileId: owner,
    createdBy: owner,
    billId: null,
    installmentId: null,
    attachment: null,
    items: [],
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

const attachments: Record<string, Attachment> = {
  "att-struk": {
    id: "att-struk",
    fileName: "struk-superindo.jpg",
    mimeType: "image/jpeg",
    dataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="#fbfcfe"/><g fill="#c9d4e6" font-family="monospace" font-size="11">${Array.from({ length: 22 }, (_, i) => `<text x="16" y="${16 + i * 13}">${i % 4 === 0 ? "SUPERINDO" : "................"} </text>`).join("")}</g><text x="16" y="272" font-family="monospace" font-size="16" font-weight="bold" fill="#1a3c78">TOTAL: RP350.000</text></svg>`,
      ),
  },
};

const transactions: Transaction[] = [
  // Saldo awal (3 bulan lalu)
  tx("t-ob1", "income", 8_500_000, "c-lain-income", "w-bca-dinar", md(1, -3), "Saldo Awal", "Saldo awal BCA Dinar", "p-dinar", { source: "opening_balance" }),
  tx("t-ob2", "income", 3_000_000, "c-lain-income", "w-mandiri", md(1, -3), "Saldo Awal", "Saldo awal Mandiri", "p-dinar", { source: "opening_balance" }),
  tx("t-ob3", "income", 500_000, "c-lain-income", "w-cash", md(1, -3), "Saldo Awal", "Saldo awal cash", "p-dinar", { source: "opening_balance" }),
  tx("t-ob4", "income", 2_500_000, "c-lain-income", "w-bca-istri", md(1, -3), "Saldo Awal", "Saldo awal BCA Istri", "p-istri", { source: "opening_balance" }),
  tx("t-ob5", "income", 5_000_000, "c-lain-income", "w-keluarga", md(1, -3), "Saldo Awal", "Saldo awal rekening keluarga", "p-dinar", { source: "opening_balance" }),

  // Gaji 3 bulan
  tx("t-s1", "income", 9_000_000, "c-gaji", "w-bca-dinar", md(1, -2), "PT Maju Bersama", "Gaji", "p-dinar"),
  tx("t-s2", "income", 7_500_000, "c-gaji", "w-bca-istri", md(1, -2), "CV Sejahtera", "Gaji", "p-istri"),
  tx("t-s3", "income", 9_000_000, "c-gaji", "w-bca-dinar", md(1, -1), "PT Maju Bersama", "Gaji", "p-dinar"),
  tx("t-s4", "income", 7_500_000, "c-gaji", "w-bca-istri", md(1, -1), "CV Sejahtera", "Gaji", "p-istri"),
  tx("t-s5", "income", 9_000_000, "c-gaji", "w-bca-dinar", md(1, 0), "PT Maju Bersama", "Gaji", "p-dinar"),
  tx("t-s6", "income", 7_500_000, "c-gaji", "w-bca-istri", md(1, 0), "CV Sejahtera", "Gaji", "p-istri"),
  tx("t-bonus", "income", 1_200_000, "c-bonus", "w-bca-dinar", md(10, 0), "PT Maju Bersama", "Bonus kinerja", "p-dinar"),

  // Pengeluaran bulan ini (hari 1..hari ini)
  tx("t-e1", "expense", 350_000, "c-belanja", "w-bca-dinar", md(1, 0), "Superindo", "Belanja mingguan", "p-dinar"),
  tx("t-e2", "expense", 52_000, "c-makan", "w-cash", md(2, 0), "Warung Bu Sari", "Makan siang", "p-dinar"),
  tx("t-e3", "expense", 120_000, "c-transport", "w-mandiri", md(3, 0), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e4", "expense", 85_000, "c-hiburan", "w-bca-istri", md(4, 0), "CGV Cinemas", "Nonton bareng", "p-istri"),
  tx("t-e5", "expense", 210_000, "c-makan", "w-bca-dinar", md(5, 0), "Restoran Ayam Geprek", "Makan malam keluarga", "p-dinar"),
  tx("t-e6", "expense", 96_000, "c-transport", "w-bca-istri", md(6, 0), "Gojek", "Transport bulanan", "p-istri"),
  tx("t-e7", "expense", 275_000, "c-belanja", "w-bca-dinar", md(7, 0), "Alfamart", "Sembako", "p-dinar"),
  tx("t-e8", "expense", 150_000, "c-kesehatan", "w-mandiri", md(8, 0), "Apotek K24", "Obat keluarga", "p-dinar"),
  tx("t-e9", "expense", 45_000, "c-makan", "w-cash", md(9, 0), "Kopi Kenangan", "Ngopi", "p-dinar"),
  tx("t-e10", "expense", 320_000, "c-belanja", "w-bca-dinar", md(10, 0), "Indomaret", "Belanja bulanan", "p-dinar"),
  tx("t-e11", "expense", 88_000, "c-makan", "w-cash", md(11, 0), "Bakso Mas Joko", "Makan malam", "p-dinar"),
  tx("t-e12", "expense", 130_000, "c-transport", "w-mandiri", md(12, 0), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e13", "expense", 65_000, "c-hiburan", "w-bca-dinar", md(13, 0), "Netflix", "Langganan streaming", "p-dinar"),
  tx("t-e14", "expense", 240_000, "c-makan", "w-bca-dinar", md(14, 0), "Superindo", "Belanja mingguan", "p-dinar"),
  tx("t-e15", "expense", 105_000, "c-transport", "w-bca-istri", md(15, 0), "Grab", "Transport", "p-istri"),
  tx("t-e16", "expense", 185_000, "c-belanja", "w-keluarga", md(16, 0), "IKEA", "Perlengkapan rumah", "p-dinar"),
  tx("t-e17", "expense", 78_000, "c-makan", "w-cash", md(17, 0), "Kopi Kenangan", "Ngopi", "p-dinar"),
  tx("t-e18", "expense", 415_000, "c-pendidikan", "w-bca-dinar", md(18, 0), "Kursus Online", "Langganan kursus", "p-dinar"),
  tx("t-e19", "expense", 95_000, "c-makan", "w-cash", md(19, 0), "Sate Pak Haji", "Makan malam", "p-dinar"),
  tx("t-e20", "expense", 145_000, "c-transport", "w-mandiri", md(20, 0), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e21", "expense", 260_000, "c-kesehatan", "w-bca-dinar", md(21, 0), "Klinik Sehat", "Periksa dokter", "p-dinar"),

  // Transaksi via Kartu Kredit BCA (statement st-bca) — jumlahnya = statement_amount.
  // walletId "" = tidak ada wallet kas yang berkurang (pembelian kartu kredit).
  tx("t-cc1", "expense", 500_000, "c-lain", "", md(2, 0), "Cicilan Motor (CC)", "Cicilan motor via Kartu Kredit BCA", "p-dinar", { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" }),
  tx("t-cc2", "expense", 300_000, "c-lain", "", md(3, 0), "Hutang Budi (CC)", "Hutang Budi via Kartu Kredit BCA", "p-dinar", { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" }),
  tx("t-cc3", "expense", 200_000, "c-belanja", "", md(4, 0), "Belanja (CC)", "Belanja via Kartu Kredit BCA", "p-dinar", { paymentMethod: "Credit Card", creditCardId: "cc-bca", statementId: "st-bca" }),

  // Pengeluaran bulan lalu (untuk perbandingan)
  tx("t-e22", "expense", 380_000, "c-belanja", "w-bca-dinar", md(5, -1), "Superindo", "Belanja mingguan", "p-dinar"),
  tx("t-e23", "expense", 300_000, "c-belanja", "w-bca-dinar", md(9, -1), "Alfamart", "Sembako", "p-dinar"),
  tx("t-e24", "expense", 480_000, "c-makan", "w-bca-dinar", md(13, -1), "Restoran Keluarga", "Makan keluarga", "p-dinar"),
  tx("t-e25", "expense", 200_000, "c-transport", "w-mandiri", md(17, -1), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e26", "expense", 150_000, "c-hiburan", "w-bca-istri", md(20, -1), "Bioskop XXI", "Nonton", "p-istri"),
  tx("t-e27", "expense", 350_000, "c-belanja", "w-bca-dinar", md(24, -1), "Superindo", "Belanja bulanan", "p-dinar"),
  tx("t-e28", "expense", 95_000, "c-makan", "w-cash", md(27, -1), "Bakso Mas Joko", "Makan malam", "p-dinar"),
  tx("t-e29", "expense", 260_000, "c-makan", "w-bca-dinar", md(6, -1), "Superindo", "Belanja mingguan", "p-dinar"),
  tx("t-e30", "expense", 140_000, "c-kesehatan", "w-mandiri", md(11, -1), "Apotek K24", "Obat", "p-dinar"),
  tx("t-e31", "expense", 220_000, "c-belanja", "w-bca-istri", md(16, -1), "Pasaraya", "Belanja rumah", "p-istri"),
  tx("t-e32", "expense", 110_000, "c-transport", "w-mandiri", md(22, -1), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e33", "expense", 60_000, "c-hiburan", "w-cash", md(26, -1), "Kopi Kenangan", "Ngopi", "p-dinar"),

  // Pengeluaran dua bulan lalu (untuk rata-rata 3 bulan)
  tx("t-e34", "expense", 330_000, "c-belanja", "w-bca-dinar", md(7, -2), "Superindo", "Belanja mingguan", "p-dinar"),
  tx("t-e35", "expense", 290_000, "c-makan", "w-bca-dinar", md(12, -2), "Restoran Ayam Geprek", "Makan keluarga", "p-dinar"),
  tx("t-e36", "expense", 175_000, "c-transport", "w-mandiri", md(15, -2), "Pertamina", "Isi bensin", "p-dinar"),
  tx("t-e37", "expense", 95_000, "c-hiburan", "w-bca-istri", md(18, -2), "Bioskop XXI", "Nonton", "p-istri"),
  tx("t-e38", "expense", 245_000, "c-belanja", "w-bca-dinar", md(21, -2), "Alfamart", "Sembako", "p-dinar"),
  tx("t-e39", "expense", 125_000, "c-kesehatan", "w-mandiri", md(24, -2), "Klinik Sehat", "Periksa", "p-dinar"),
  tx("t-e40", "expense", 420_000, "c-pendidikan", "w-bca-dinar", md(26, -2), "Kursus Online", "Langganan kursus", "p-dinar"),
];

const bills: Bill[] = [
  {
    id: "b-netflix",
    title: "Netflix",
    type: "recurring",
    amount: 186_000,
    paidAmount: 0,
    categoryId: "c-hiburan",
    walletId: null,
    creditCardId: null,
    counterparty: "Netflix",
    frequency: "bulanan",
    dueDay: 15,
    dueDate: null,
    lastPaidPeriod: null,
    isActive: true,
    ownerProfileId: "p-dinar",
    notes: "Langganan premium family",
  },
  {
    id: "b-listrik",
    title: "Listrik PLN",
    type: "recurring",
    amount: 420_000,
    paidAmount: 420_000,
    categoryId: "c-tagihan",
    walletId: "w-bca-dinar",
    creditCardId: null,
    counterparty: "PLN",
    frequency: "bulanan",
    dueDay: 20,
    dueDate: null,
    lastPaidPeriod: monthKey(todayISO()),
    isActive: true,
    ownerProfileId: "p-dinar",
    notes: "Rumah utama",
  },
  {
    id: "b-motor",
    title: "Cicilan Motor",
    type: "installment",
    amount: 12_000_000,
    paidAmount: 3_500_000,
    categoryId: "c-lain",
    walletId: null,
    creditCardId: null,
    counterparty: "Adira Finance",
    frequency: null,
    dueDay: 25,
    dueDate: null,
    lastPaidPeriod: null,
    isActive: true,
    ownerProfileId: "p-dinar",
    notes: "Honda Beat, tenor 24 bulan",
  },
  {
    id: "b-hutang",
    title: "Hutang Budi",
    type: "debt",
    amount: 300_000,
    paidAmount: 0,
    categoryId: "c-lain",
    walletId: null,
    creditCardId: null,
    counterparty: "Budi",
    frequency: null,
    dueDay: null,
    dueDate: ago(3),
    lastPaidPeriod: null,
    isActive: true,
    ownerProfileId: "p-dinar",
    notes: "Pinjam untuk servis motor",
  },
  {
    id: "b-cc",
    title: "Tagihan Kartu Kredit BCA",
    type: "credit_card_statement",
    amount: 1_000_000,
    paidAmount: 0,
    categoryId: "c-lain",
    walletId: null,
    creditCardId: "cc-bca",
    statementId: "st-bca",
    counterparty: "BCA",
    frequency: null,
    dueDay: 25,
    dueDate: null,
    lastPaidPeriod: null,
    isActive: true,
    ownerProfileId: "p-dinar",
    notes: "Statement bulan ini (terbentuk dari 3 transaksi kartu kredit)",
  },
];

const installments: Installment[] = [
  {
    id: "i-motor",
    billId: "b-motor",
    title: "Cicilan Motor",
    totalAmount: 12_000_000,
    installmentAmount: 500_000,
    tenor: 24,
    paidCount: 7,
    startDate: md(25, -17),
    dueDay: 25,
  },
];

const creditCards: CreditCard[] = [
  {
    id: "cc-bca",
    name: "Kartu Kredit BCA",
    issuer: "BCA",
    lastFour: "8842",
    statementDay: 5,
    dueDay: 25,
    creditLimit: 10_000_000,
  },
];

const statements: CreditCardStatement[] = [
  {
    id: "st-bca",
    creditCardId: "cc-bca",
    periodStart: startOfMonthISO(),
    periodEnd: endOfMonthISO(),
    statementAmount: 1_000_000,
    paidAmount: 0,
    dueDate: ago(3),
    status: "open",
  },
];

const budgets: Budget[] = [
  { id: "bg-makan", categoryId: "c-makan", amount: 1_200_000, ownerProfileId: null },
  { id: "bg-transport", categoryId: "c-transport", amount: 600_000, ownerProfileId: null },
  { id: "bg-belanja", categoryId: "c-belanja", amount: 800_000, ownerProfileId: null },
  { id: "bg-hiburan", categoryId: "c-hiburan", amount: 400_000, ownerProfileId: "p-dinar" },
];

const drafts: Draft[] = [
  {
    id: "d-tg",
    source: "telegram",
    transactionType: "expense",
    amount: 50_000,
    categoryId: "c-makan",
    walletId: null,
    occurredAt: todayISO(),
    merchant: "Beli makan",
    description: "Dari Telegram: beli makan 50rb",
    items: [],
    attachment: null,
    uncertainFields: [],
    status: "draft",
    ownerProfileId: "p-dinar",
    createdAt: todayISO(),
  },
  {
    id: "d-ocr",
    source: "receipt_ocr",
    transactionType: "expense",
    amount: 350_000,
    categoryId: "c-belanja",
    walletId: null,
    occurredAt: todayISO(),
    merchant: "Superindo",
    description: "Hasil scan struk: belanja mingguan",
    items: [
      { itemName: "Beras 5kg", quantity: 1, unitPrice: 85_000, totalPrice: 85_000 },
      { itemName: "Minyak goreng", quantity: 2, unitPrice: 22_000, totalPrice: 44_000 },
    ],
    attachment: attachments["att-struk"],
    uncertainFields: ["walletId", "paymentMethod"],
    status: "in_review",
    ownerProfileId: "p-dinar",
    createdAt: ago(1),
  },
  {
    id: "d-hrm",
    source: "hermes",
    transactionType: "expense",
    amount: 300_000,
    categoryId: null,
    walletId: null,
    occurredAt: todayISO(),
    merchant: "Hutang Budi",
    description: "Dari Hermes: catat pembayaran hutang Budi",
    items: [],
    attachment: null,
    uncertainFields: ["categoryId"],
    status: "draft",
    ownerProfileId: "p-dinar",
    createdAt: todayISO(),
  },
];

export function buildSeed(): AppData {
  return {
    group: { id: "g-dinar", name: "Keluarga Dinar", ownerProfileId: "p-dinar" },
    members,
    wallets,
    categories,
    transactions,
    bills,
    installments,
    creditCards,
    statements,
    budgets,
    drafts,
    notifications: [
      {
        id: "n1",
        kind: "draft",
        title: "Draft menunggu persetujuan",
        body: "3 draft dari Telegram, OCR, dan Hermes belum disetujui.",
        linkTo: "/approvals",
        read: false,
        createdAt: ago(0),
      },
      {
        id: "n2",
        kind: "due",
        title: "Netflix jatuh tempo bulan ini",
        body: "Tagihan Rp186.000 jatuh tempo tanggal 15.",
        linkTo: "/bills/b-netflix",
        read: false,
        createdAt: ago(0),
      },
      {
        id: "n3",
        kind: "overdue",
        title: "Hutang Budi melewati jatuh tempo",
        body: "Hutang Rp300.000 sudah 3 hari lewat jatuh tempo.",
        linkTo: "/bills/b-hutang",
        read: true,
        createdAt: ago(1),
      },
    ],
  };
}
