// Kontrak tipe Catatin — mencerminkan PRD v3.2 (machine value snake_case,
// label UI Bahasa Indonesia di layer presentasi).

export type Role = "admin" | "member";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  color: string; // warna avatar
}

export interface Group {
  id: string;
  name: string;
  ownerProfileId: string;
}

export type WalletScope = "personal" | "shared";

export interface Wallet {
  id: string;
  name: string;
  ownerProfileId: string | null; // null = shared
  scope: WalletScope;
}

export type CategoryDirection = "income" | "expense" | "both";

export interface Category {
  id: string;
  name: string;
  direction: CategoryDirection;
  isDefault: boolean;
}

export type TransactionType = "income" | "expense" | "transfer";

export type TransactionSource =
  | "manual"
  | "receipt_ocr"
  | "telegram"
  | "whatsapp"
  | "hermes"
  | "opening_balance"
  | "transfer_out"
  | "transfer_in";

export type PaymentMethod = "Cash" | "Debit Card" | "Credit Card" | "Transfer";

export interface ReceiptItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string; // mock: base64/data URL
}

export interface Transaction {
  id: string;
  groupId?: string;
  type: TransactionType;
  source: TransactionSource;
  amount: number;
  categoryId: string;
  walletId: string;
  paymentMethod: PaymentMethod | null;
  creditCardId: string | null;
  transferType?: string | null;
  statementId?: string | null;
  occurredAt: string; // ISO
  merchant: string;
  description: string;
  ownerProfileId: string;
  createdBy: string;
  billId: string | null;
  installmentId: string | null;
  attachment: Attachment | null;
  items: ReceiptItem[];
  createdAt: string;
}

export type BillType =
  | "regular"
  | "recurring"
  | "debt"
  | "receivable"
  | "installment"
  | "credit_card_statement";

export type BillStatus = "upcoming" | "due_today" | "unpaid" | "paid" | "overdue" | "paid_off";

export interface Bill {
  id: string;
  title: string;
  type: BillType;
  amount: number;
  paidAmount: number;
  categoryId: string | null;
  walletId: string | null;
  creditCardId: string | null;
  statementId?: string | null;
  counterparty: string | null;
  frequency: string | null;
  dueDay: number | null;
  dueDate: string | null; // ISO
  lastPaidPeriod: string | null; // YYYY-MM untuk recurring
  isActive: boolean;
  ownerProfileId: string;
  notes: string;
}

export interface Installment {
  id: string;
  billId: string;
  title: string;
  totalAmount: number;
  installmentAmount: number;
  tenor: number;
  paidCount: number;
  paidAmount?: number;
  startDate: string; // ISO
  dueDay: number;
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  lastFour: string;
  statementDay: number;
  dueDay: number;
  creditLimit: number;
  ownerProfileId?: string | null;
  scope?: WalletScope;
}

export type StatementStatus = "open" | "issued" | "overdue" | "paid";

export interface CreditCardStatement {
  id: string;
  creditCardId: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  statementAmount: number;
  officialAmount?: number | null;
  derivedAmount?: number;
  paidAmount: number;
  remainingAmount?: number;
  dueDate: string; // ISO
  status: StatementStatus;
}

export type UnifiedBillDomainType =
  | "regular"
  | "recurring"
  | "installment"
  | "debt"
  | "receivable"
  | "credit_card_statement";

export type UnifiedBillSourceType = "bills" | "statements" | "installments";

export interface UnifiedBillItem {
  id: string;
  domainType: UnifiedBillDomainType;
  sourceType: UnifiedBillSourceType;
  sourceId: string;
  title: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string | null;
  dueDay: number | null;
  status: string;
  ownerProfileId: string | null;
  categoryId: string | null;
  walletId: string | null;
  creditCardId: string | null;
  statementId: string | null;
  metadata: Record<string, unknown>;
}

export interface UnifiedBillSummary {
  totalUnpaid: number;
  dueTodayCount: number;
  overdueCount: number;
  upcomingCount: number;
}

export interface UnifiedBillsResponse {
  summary: UnifiedBillSummary;
  items: UnifiedBillItem[];
}

export interface UnifiedBillDetailResponse {
  item: UnifiedBillItem;
  history: Record<string, unknown>[];
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  ownerProfileId: string | null; // null = group budget
}

export type DraftSource = "receipt_ocr" | "telegram" | "whatsapp" | "hermes";
export type DraftStatus = "draft" | "in_review" | "approved" | "rejected";

export interface Draft {
  id: string;
  source: DraftSource;
  transactionType: "income" | "expense";
  amount: number;
  categoryId: string | null;
  walletId: string | null;
  occurredAt: string | null;
  merchant: string;
  description: string;
  items: ReceiptItem[];
  attachment: Attachment | null;
  uncertainFields: string[];
  status: DraftStatus;
  ownerProfileId: string | null;
  createdAt: string;
}

export type NotificationKind = "due" | "overdue" | "draft" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  linkTo: string; // route
  read: boolean;
  createdAt: string;
}

export type PeriodPreset = "today" | "7d" | "month" | "custom";

export interface PeriodFilter {
  preset: PeriodPreset;
  start: string | null; // ISO
  end: string | null; // ISO
}

export interface FilterState {
  period: PeriodFilter;
  profileId: string; // "all" | profileId
  type: "all" | "income" | "expense";
  categoryId: string;
  walletId: string;
}

export interface AppData {
  group: Group;
  members: Profile[];
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  bills: Bill[];
  installments: Installment[];
  creditCards: CreditCard[];
  statements: CreditCardStatement[];
  budgets: Budget[];
  drafts: Draft[];
  notifications: AppNotification[];
}

export interface NewBillInput {
  kind: "regular" | "recurring" | "installment";
  amount: number;
  dueDay: number | null;
  dueDate: string | null;
  frequency: string | null;
  tenor: number | null;
  installmentAmount: number | null;
  title: string;
}

export interface NewTransactionInput {
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId?: string | null;
  paymentMethod: PaymentMethod | null;
  creditCardId: string | null;
  occurredAt: string;
  merchant: string;
  description: string;
  ownerProfileId: string;
  attachment: Attachment | null;
  items?: { itemName: string; quantity: number; unitPrice: number; totalPrice: number }[];
  source?: Transaction["source"];
  bill?: NewBillInput | null;
}
