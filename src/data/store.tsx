import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AppData,
  Attachment,
  Bill,
  Draft,
  PaymentMethod,
  Transaction,
  TransactionType,
  Wallet,
} from "../lib/types";
import { buildSeed } from "./seed";
import { monthKey, todayISO } from "../lib/dates";

const LS_KEY = "catatin:phase1:v3";

interface Persisted {
  data: AppData;
  sessionProfileId: string;
  activeProfileId: string;
  theme: "light" | "dark";
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p?.data?.transactions) return p;
    }
  } catch {
    /* abaikan, pakai seed */
  }
  return {
    data: buildSeed(),
    sessionProfileId: "p-dinar",
    activeProfileId: "all",
    theme: "light",
  };
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
  walletId: string;
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

interface StoreCtx {
  data: AppData;
  sessionProfileId: string;
  activeProfileId: string;
  theme: "light" | "dark";
  login: (profileId: string) => void;
  logout: () => void;
  setActiveProfile: (id: string) => void;
  toggleTheme: () => void;
  resetData: () => void;
  addTransaction: (input: NewTransactionInput) => string;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addWallet: (w: { name: string; scope: "personal" | "shared"; ownerProfileId: string | null }) => void;
  addBudget: (b: { categoryId: string; amount: number; ownerProfileId: string | null }) => void;
  payBill: (billId: string, opts: { amount: number; walletId: string; method: PaymentMethod | null; full?: boolean }) => void;
  payStatement: (statementId: string, opts: { amount: number; walletId: string; method: PaymentMethod | null }) => void;
  approveDraft: (id: string, patch: Partial<Draft>) => void;
  rejectDraft: (id: string) => void;
  markNotifRead: (id: string) => void;
  markNotifAllRead: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

let seq = 100;
const nid = (p: string) => `${p}-${++seq}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* kuota penuh: abaikan */
    }
  }, [state]);

  const api = useMemo<StoreCtx>(() => {
    const mutate = (fn: (d: AppData) => AppData) =>
      setState((s) => ({ ...s, data: fn(s.data) }));

    return {
      data: state.data,
      sessionProfileId: state.sessionProfileId,
      activeProfileId: state.activeProfileId,
      theme: state.theme,
      login: (profileId) => setState((s) => ({ ...s, sessionProfileId: profileId })),
      logout: () => setState((s) => ({ ...s, sessionProfileId: "" })),
      setActiveProfile: (id) => setState((s) => ({ ...s, activeProfileId: id })),
      toggleTheme: () =>
        setState((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })),
      resetData: () =>
        setState({
          data: buildSeed(),
          sessionProfileId: "p-dinar",
          activeProfileId: "all",
          theme: "light",
        }),

      addTransaction: (input) => {
        const id = nid("t");
        mutate((d) => {
          let transactions = d.transactions;
          let bills = d.bills;
          let installments = d.installments;

          if (input.bill) {
            const billId = nid("b");
            const b: Bill = {
              id: billId,
              title: input.bill.title || input.merchant || "Tagihan",
              type: input.bill.kind,
              amount: input.bill.kind === "installment" ? (input.bill.amount ?? input.amount) : input.amount,
              paidAmount: 0,
              categoryId: input.categoryId,
              walletId: input.walletId,
              creditCardId: input.creditCardId,
              counterparty: null,
              frequency: input.bill.frequency,
              dueDay: input.bill.dueDay,
              dueDate: input.bill.dueDate,
              lastPaidPeriod: null,
              isActive: true,
              ownerProfileId: input.ownerProfileId,
              notes: "",
            };
            bills = [...bills, b];
            if (input.bill.kind === "installment" && input.bill.tenor && input.bill.installmentAmount) {
              installments = [
                ...installments,
                {
                  id: nid("i"),
                  billId,
                  title: b.title,
                  totalAmount: b.amount,
                  installmentAmount: input.bill.installmentAmount,
                  tenor: input.bill.tenor,
                  paidCount: 0,
                  startDate: input.occurredAt,
                  dueDay: input.bill.dueDay ?? 1,
                },
              ];
            }
            transactions = [
              ...transactions,
              {
                id,
                type: input.type,
                source: input.source ?? "manual",
                amount: input.amount,
                categoryId: input.categoryId,
                walletId: input.walletId,
                paymentMethod: input.paymentMethod,
                creditCardId: input.creditCardId,
                occurredAt: input.occurredAt,
                merchant: input.merchant,
                description: input.description,
                ownerProfileId: input.ownerProfileId,
                createdBy: state.sessionProfileId || input.ownerProfileId,
                billId,
                installmentId: input.bill?.kind === "installment" ? installments[installments.length - 1].id : null,
                attachment: input.attachment,
                items: input.items ?? [],
                createdAt: new Date().toISOString(),
              },
            ];
          } else {
            transactions = [
              ...transactions,
              {
                id,
                type: input.type,
                source: input.source ?? "manual",
                amount: input.amount,
                categoryId: input.categoryId,
                walletId: input.walletId,
                paymentMethod: input.paymentMethod,
                creditCardId: input.creditCardId,
                occurredAt: input.occurredAt,
                merchant: input.merchant,
                description: input.description,
                ownerProfileId: input.ownerProfileId,
                createdBy: state.sessionProfileId || input.ownerProfileId,
                billId: null,
                installmentId: null,
                attachment: input.attachment,
                items: input.items ?? [],
                createdAt: new Date().toISOString(),
              },
            ];
          }
          return { ...d, transactions, bills, installments };
        });
        return id;
      },

      updateTransaction: (id, patch) =>
        mutate((d) => ({
          ...d,
          transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTransaction: (id) =>
        mutate((d) => {
          const t = d.transactions.find((x) => x.id === id);
          let bills = d.bills;
          let installments = d.installments;
          if (t?.billId) {
            bills = bills.map((b) =>
              b.id === t.billId
                ? { ...b, paidAmount: Math.max(0, b.paidAmount - (t.type === "expense" ? t.amount : 0)) }
                : b,
            );
          }
          if (t?.installmentId) {
            installments = installments.map((i) =>
              i.id === t.installmentId ? { ...i, paidCount: Math.max(0, i.paidCount - 1) } : i,
            );
          }
          return {
            ...d,
            transactions: d.transactions.filter((x) => x.id !== id),
            bills,
            installments,
          };
        }),

      addWallet: (w) =>
        mutate((d) => ({
          ...d,
          wallets: [...d.wallets, { id: nid("w"), name: w.name, scope: w.scope, ownerProfileId: w.ownerProfileId }],
        })),

      addBudget: (b) =>
        mutate((d) => ({
          ...d,
          budgets: [...d.budgets, { id: nid("bg"), categoryId: b.categoryId, amount: b.amount, ownerProfileId: b.ownerProfileId }],
        })),

      payBill: (billId, opts) =>
        mutate((d) => {
          const bill = d.bills.find((b) => b.id === billId);
          if (!bill) return d;
          const isStatement = bill.type === "credit_card_statement";
          const pay = opts.full ? bill.amount - bill.paidAmount : Math.min(opts.amount, bill.amount - bill.paidAmount);
          if (pay <= 0) return d;
          const id = nid("t");
          const tx: Transaction = {
            id,
            type: isStatement ? "credit_card_settlement" : "expense",
            source: "manual",
            amount: pay,
            categoryId: bill.categoryId ?? "c-lain",
            walletId: opts.walletId,
            paymentMethod: opts.method,
            creditCardId: bill.creditCardId,
            occurredAt: todayISO(),
            merchant: bill.title,
            description: isStatement ? "Bayar tagihan kartu kredit" : "Pembayaran tagihan",
            ownerProfileId: bill.ownerProfileId,
            createdBy: state.sessionProfileId || bill.ownerProfileId,
            billId,
            installmentId: d.installments.find((i) => i.billId === billId)?.id ?? null,
            attachment: null,
            items: [],
            createdAt: new Date().toISOString(),
          };
          let bills = d.bills.map((b) =>
            b.id === billId
              ? {
                  ...b,
                  paidAmount: opts.full ? b.amount : Math.min(b.amount, b.paidAmount + pay),
                  lastPaidPeriod: b.type === "recurring" ? monthKey(todayISO()) : b.lastPaidPeriod,
                }
              : b,
          );
          let installments = d.installments;
          if (bill.type === "installment") {
            installments = d.installments.map((i) =>
              i.billId === billId
                ? {
                    ...i,
                    paidCount: opts.full ? i.tenor : Math.min(i.tenor, i.paidCount + 1),
                  }
                : i,
            );
          }
          let statements = d.statements;
          if (isStatement) {
            statements = d.statements.map((s) =>
              s.creditCardId === bill.creditCardId
                ? { ...s, paidAmount: Math.min(s.statementAmount, s.paidAmount + pay) }
                : s,
            );
          }
          return { ...d, transactions: [...d.transactions, tx], bills, installments, statements };
        }),

      payStatement: (statementId, opts) =>
        mutate((d) => {
          const st = d.statements.find((s) => s.id === statementId);
          if (!st) return d;
          const id = nid("t");
          const pay = Math.min(opts.amount, st.statementAmount - st.paidAmount);
          const tx: Transaction = {
            id,
            type: "credit_card_settlement",
            source: "manual",
            amount: pay,
            categoryId: "c-lain",
            walletId: opts.walletId,
            paymentMethod: opts.method,
            creditCardId: st.creditCardId,
            occurredAt: todayISO(),
            merchant: "Tagihan Kartu Kredit",
            description: "Bayar statement kartu kredit",
            ownerProfileId: "p-dinar",
            createdBy: state.sessionProfileId || "p-dinar",
            billId: d.bills.find((b) => b.creditCardId === st.creditCardId && b.type === "credit_card_statement")?.id ?? null,
            installmentId: null,
            attachment: null,
            items: [],
            createdAt: new Date().toISOString(),
          };
          return {
            ...d,
            transactions: [...d.transactions, tx],
            statements: d.statements.map((s) =>
              s.id === statementId
                ? { ...s, paidAmount: Math.min(s.statementAmount, s.paidAmount + pay) }
                : s,
            ),
          };
        }),

      approveDraft: (id, patch) =>
        mutate((d) => {
          const dr = d.drafts.find((x) => x.id === id);
          if (!dr) return d;
          const merged = { ...dr, ...patch };
          const tId = nid("t");
          const tx: Transaction = {
            id: tId,
            type: merged.transactionType,
            source: merged.source === "receipt_ocr" ? "receipt_ocr" : merged.source === "hermes" ? "hermes" : "telegram",
            amount: merged.amount,
            categoryId: merged.categoryId ?? "c-lain",
            walletId: merged.walletId ?? "w-cash",
            paymentMethod: null,
            creditCardId: null,
            occurredAt: merged.occurredAt ?? todayISO(),
            merchant: merged.merchant,
            description: merged.description,
            ownerProfileId: merged.ownerProfileId ?? state.sessionProfileId,
            createdBy: state.sessionProfileId,
            billId: null,
            installmentId: null,
            attachment: merged.attachment,
            items: merged.items,
            createdAt: new Date().toISOString(),
          };
          return {
            ...d,
            transactions: [...d.transactions, tx],
            drafts: d.drafts.map((x) =>
              x.id === id ? { ...x, status: "approved" as const, ...patch } : x,
            ),
            notifications: [
              {
                id: nid("n"),
                kind: "system",
                title: "Draft disetujui",
                body: `Transaksi "${merged.merchant}" sebesar ${merged.amount.toLocaleString("id-ID")} berhasil disimpan.`,
                linkTo: "/transactions",
                read: false,
                createdAt: todayISO(),
              },
              ...d.notifications,
            ],
          };
        }),

      rejectDraft: (id) =>
        mutate((d) => ({
          ...d,
          drafts: d.drafts.map((x) => (x.id === id ? { ...x, status: "rejected" as const } : x)),
        })),

      markNotifRead: (id) =>
        mutate((d) => ({
          ...d,
          notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markNotifAllRead: () =>
        mutate((d) => ({
          ...d,
          notifications: d.notifications.map((n) => ({ ...n, read: true })),
        })),
    };
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp harus dipakai di dalam AppProvider");
  return ctx;
}

export type { Wallet };
