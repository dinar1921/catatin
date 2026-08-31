import { db } from "../db/index.js";
import { getStatementCalc } from "./statement-domain.js";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function getGroupData(groupId: string): AppData {
  const group = db.prepare("SELECT id, name, owner_profile_id FROM groups WHERE id = ?").get(groupId) as {
    id: string; name: string; owner_profile_id: string;
  };
  if (!group) throw new Error("Group tidak ditemukan");

  const members = db
    .prepare("SELECT id, group_id, name, email, role, is_active, color FROM profiles WHERE group_id = ? AND is_active = 1")
    .all(groupId) as unknown as ProfileRow[];

  const wallets = db
    .prepare("SELECT id, group_id, name, owner_profile_id, scope FROM wallets WHERE group_id = ?")
    .all(groupId) as unknown as WalletRow[];

  const categories = db
    .prepare("SELECT id, group_id, name, direction, is_default FROM categories WHERE group_id = ?")
    .all(groupId) as unknown as CategoryRow[];

  const transactions = db
    .prepare("SELECT * FROM transactions WHERE group_id = ?")
    .all(groupId) as unknown as TransactionRow[];

  const bills = db
    .prepare("SELECT * FROM bills WHERE group_id = ?")
    .all(groupId) as unknown as BillRow[];

  const installments = db
    .prepare("SELECT * FROM installments WHERE group_id = ?")
    .all(groupId) as unknown as InstallmentRow[];

  const creditCards = db
    .prepare("SELECT * FROM credit_cards WHERE group_id = ?")
    .all(groupId) as unknown as CreditCardRow[];

  const statements = db
    .prepare("SELECT * FROM statements WHERE group_id = ?")
    .all(groupId) as unknown as StatementRow[];

  const budgets = db
    .prepare("SELECT * FROM budgets WHERE group_id = ?")
    .all(groupId) as unknown as BudgetRow[];

  const drafts = db
    .prepare("SELECT * FROM drafts WHERE group_id = ?")
    .all(groupId) as unknown as DraftRow[];

  const notifications = db
    .prepare("SELECT id, group_id, kind, title, body, link_to, read, created_at FROM notifications WHERE group_id = ?")
    .all(groupId) as unknown as NotificationRow[];

  return {
    group: { id: group.id, name: group.name, ownerProfileId: group.owner_profile_id },
    members: members.map((m) => ({
      id: m.id, name: m.name, email: m.email, role: m.role, isActive: m.is_active === 1, color: m.color,
    })),
    wallets: wallets.map((w) => ({
      id: w.id, name: w.name, ownerProfileId: w.owner_profile_id, scope: w.scope,
    })),
    categories: categories.map((c) => ({
      id: c.id, name: c.name, direction: c.direction, isDefault: c.is_default === 1,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      groupId: t.group_id,
      type: t.type,
      source: t.source,
      amount: t.amount,
      categoryId: t.category_id,
      walletId: t.wallet_id,
      paymentMethod: t.payment_method,
      creditCardId: t.credit_card_id,
      transferType: t.transfer_type,
      statementId: t.statement_id,
      occurredAt: t.occurred_at,
      merchant: t.merchant,
      description: t.description,
      ownerProfileId: t.owner_profile_id,
      createdBy: t.created_by,
      billId: t.bill_id,
      installmentId: t.installment_id,
      attachment: parseJson(t.attachment_json, null),
      items: parseJson(t.items_json, []),
      createdAt: t.created_at,
    })),
    bills: bills.map((b) => ({
      id: b.id,
      title: b.title,
      type: b.type,
      amount: b.amount,
      paidAmount: b.paid_amount,
      categoryId: b.category_id,
      walletId: b.wallet_id,
      creditCardId: b.credit_card_id,
      statementId: b.statement_id,
      counterparty: b.counterparty,
      frequency: b.frequency,
      dueDay: b.due_day,
      dueDate: b.due_date,
      lastPaidPeriod: b.last_paid_period,
      isActive: b.is_active === 1,
      ownerProfileId: b.owner_profile_id,
      notes: b.notes,
    })),
    installments: installments.map((i) => ({
      id: i.id,
      billId: i.bill_id,
      title: i.title,
      totalAmount: i.total_amount,
      installmentAmount: i.installment_amount,
      tenor: i.tenor,
      paidCount: i.paid_count,
      paidAmount: i.paid_amount,
      startDate: i.start_date,
      dueDay: i.due_day,
    })),
    creditCards: creditCards.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      lastFour: c.last_four,
      statementDay: c.statement_day,
      dueDay: c.due_day,
      creditLimit: c.credit_limit,
      ownerProfileId: c.owner_profile_id,
      scope: c.scope,
    })),
    statements: statements.map((s) => {
      // R09: ekspos nilai statement TERHITUNG (derived/official-aware) agar frontend
      // tidak menghitung ulang finansial. Kolom statement_amount bisa 0 untuk
      // statement hasil derivasi; remaining/status dihitung di backend.
      const calc = getStatementCalc(db, s.id);
      return {
        id: s.id,
        creditCardId: s.credit_card_id,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        statementAmount: calc ? calc.statementAmount : s.statement_amount,
        officialAmount: calc ? calc.officialAmount : (s as unknown as { official_amount: number | null }).official_amount,
        derivedAmount: calc ? calc.derivedAmount : undefined,
        paidAmount: calc ? calc.paidAmount : s.paid_amount,
        remainingAmount: calc ? calc.remainingAmount : Math.max(0, s.statement_amount - s.paid_amount),
        dueDate: s.due_date,
        status: calc ? calc.status : s.status,
      };
    }),
    budgets: budgets.map((b) => ({
      id: b.id,
      categoryId: b.category_id,
      amount: b.amount,
      ownerProfileId: b.owner_profile_id,
    })),
    drafts: drafts.map((d) => ({
      id: d.id,
      source: d.source,
      transactionType: d.transaction_type,
      amount: d.amount,
      categoryId: d.category_id,
      walletId: d.wallet_id,
      occurredAt: d.occurred_at,
      merchant: d.merchant,
      description: d.description,
      items: parseJson(d.items_json, []),
      attachment: parseJson(d.attachment_json, null),
      uncertainFields: parseJson(d.uncertain_fields_json, []),
      status: d.status,
      ownerProfileId: d.owner_profile_id,
      createdAt: d.created_at,
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      linkTo: n.link_to,
      read: n.read === 1,
      createdAt: n.created_at,
    })),
  };
}

interface ProfileRow { id: string; group_id: string; name: string; email: string; role: "admin" | "member"; is_active: number; color: string }
interface WalletRow { id: string; group_id: string; name: string; owner_profile_id: string | null; scope: "personal" | "shared" }
interface CategoryRow { id: string; group_id: string; name: string; direction: "income" | "expense" | "both"; is_default: number }
interface TransactionRow {
  id: string; group_id: string; type: "income" | "expense" | "transfer"; source: string; amount: number;
  category_id: string | null; wallet_id: string | null; payment_method: string | null; credit_card_id: string | null;
  transfer_type: string | null;
  statement_id: string | null;
  occurred_at: string; merchant: string; description: string; owner_profile_id: string | null; created_by: string | null;
  bill_id: string | null; installment_id: string | null; attachment_json: string | null; items_json: string; created_at: string;
}
interface BillRow {
  id: string; title: string; type: string; amount: number; paid_amount: number; category_id: string | null; wallet_id: string | null;
  credit_card_id: string | null; statement_id: string | null; counterparty: string | null; frequency: string | null; due_day: number | null; due_date: string | null;
  last_paid_period: string | null; is_active: number; owner_profile_id: string | null; notes: string;
}
interface InstallmentRow { id: string; bill_id: string | null; title: string; total_amount: number; installment_amount: number; tenor: number; paid_count: number; paid_amount: number; start_date: string; due_day: number }
interface CreditCardRow { id: string; name: string; issuer: string; last_four: string; statement_day: number; due_day: number; credit_limit: number; owner_profile_id: string | null; scope: string }
interface StatementRow { id: string; credit_card_id: string | null; period_start: string; period_end: string; statement_amount: number; paid_amount: number; due_date: string; status: string }
interface BudgetRow { id: string; category_id: string | null; amount: number; owner_profile_id: string | null }
interface DraftRow {
  id: string; source: string; transaction_type: "income" | "expense"; amount: number; category_id: string | null; wallet_id: string | null;
  occurred_at: string | null; merchant: string; description: string; items_json: string; attachment_json: string | null;
  uncertain_fields_json: string; status: string; owner_profile_id: string | null; created_at: string;
}
interface NotificationRow { id: string; group_id: string; kind: string; title: string; body: string; link_to: string; read: number; created_at: string }

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkTo: string;
  read: boolean;
  createdAt: string;
}

export interface AppData {
  group: { id: string; name: string; ownerProfileId: string };
  members: { id: string; name: string; email: string; role: string; isActive: boolean; color: string }[];
  wallets: { id: string; name: string; ownerProfileId: string | null; scope: string }[];
  categories: { id: string; name: string; direction: string; isDefault: boolean }[];
  transactions: Record<string, unknown>[];
  bills: Record<string, unknown>[];
  installments: Record<string, unknown>[];
  creditCards: Record<string, unknown>[];
  statements: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  drafts: Record<string, unknown>[];
  notifications: NotificationItem[];
}
