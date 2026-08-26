import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AppData,
  CategoryDirection,
  Draft,
  NewTransactionInput,
  PaymentMethod,
  Transaction,
  Wallet,
} from "../lib/types";
import * as api from "../lib/api";

const THEME_KEY = "catatin:theme";

function emptyData(): AppData {
  return {
    group: { id: "", name: "", ownerProfileId: "" },
    members: [],
    wallets: [],
    categories: [],
    transactions: [],
    bills: [],
    installments: [],
    creditCards: [],
    statements: [],
    budgets: [],
    drafts: [],
    notifications: [],
  };
}

function loadTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let seq = 100;
const nid = (p: string) => `${p}-${++seq}`;

export interface StoreCtx {
  data: AppData;
  sessionProfileId: string;
  activeProfileId: string;
  theme: "light" | "dark";
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveProfile: (id: string) => void;
  toggleTheme: () => void;
  resetData: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addWallet: (w: { name: string; scope: "personal" | "shared"; ownerProfileId: string | null }) => void;
  updateWallet: (id: string, patch: { name?: string; scope?: "personal" | "shared"; ownerProfileId?: string | null }) => void;
  deleteWallet: (id: string) => Promise<void>;
  transferBetweenWallets: (input: { fromWalletId: string; toWalletId: string; amount: number; occurredAt?: string; description?: string }) => void;
  addBudget: (b: { categoryId: string; amount: number; ownerProfileId: string | null }) => void;
  updateBudget: (id: string, patch: { categoryId?: string; amount?: number; ownerProfileId?: string | null }) => void;
  deleteBudget: (id: string) => void;
  updateCategory: (id: string, patch: { name?: string; direction?: CategoryDirection }) => void;
  deleteCategory: (id: string) => Promise<void>;
  addCreditCard: (input: { name: string; issuer?: string; lastFour?: string; statementDay: number; dueDay: number; creditLimit?: number }) => void;
  updateCreditCard: (id: string, patch: Partial<{ name: string; issuer: string; lastFour: string; statementDay: number; dueDay: number; creditLimit: number }>) => void;
  deleteCreditCard: (id: string) => Promise<void>;
  updateGroupName: (name: string) => void;
  payBill: (billId: string, opts: { amount: number; walletId: string; method: PaymentMethod | null; full?: boolean }) => void;
  approveDraft: (id: string, patch: Partial<Draft>) => void;
  rejectDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  markNotifRead: (id: string) => void;
  markNotifAllRead: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [sessionProfileId, setSessionProfileId] = useState("");
  const [activeProfileId, setActiveProfileId] = useState("all");
  const [theme, setTheme] = useState<"light" | "dark">(loadTheme);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (err) {
      // Jangan wipe data pada error transien (auto-refresh periodik).
      console.error("[store] Gagal memuat dashboard:", err);
    }
  };

  // Mount: coba restore session via cookie (tanpa auto-login mock).
  useEffect(() => {
    api
      .getMe()
      .then(async (me) => {
        setSessionProfileId(me.profile.id);
        await loadDashboard();
      })
      .catch(() => {
        setSessionProfileId("");
        setData(emptyData());
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-refresh periodik: data baru dari bot / anggota lain tampil tanpa reload manual.
  useEffect(() => {
    if (!sessionProfileId) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      loadDashboard().finally(() => {
        busy = false;
      });
    }, 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionProfileId]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* abaikan */ }
  }, [theme]);

  const apiCtx = useMemo<StoreCtx>(() => {
    const refresh = () => loadDashboard();
    const fail = (label: string, err: unknown) => {
      console.error(`[store] ${label}:`, err);
      refresh();
    };

    return {
      data,
      sessionProfileId,
      activeProfileId,
      theme,
      loading,

      login: async (email, password) => {
        const { profile } = await api.login(email, password);
        setSessionProfileId(profile.id);
        setActiveProfileId("all");
        await loadDashboard();
      },

      register: async (name, email, password) => {
        const { profile } = await api.register(name, email, password);
        setSessionProfileId(profile.id);
        setActiveProfileId("all");
        await loadDashboard();
      },

      logout: async () => {
        try {
          await api.logout();
        } catch { /* abaikan */ }
        setSessionProfileId("");
        setActiveProfileId("all");
        setData(emptyData());
      },

      setActiveProfile: (id) => setActiveProfileId(id),
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      resetData: async () => {
        await loadDashboard();
      },

      addTransaction: (input) => {
        const tmpId = nid("t");
        const tx: Transaction = {
          id: tmpId,
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
          createdBy: sessionProfileId || input.ownerProfileId,
          billId: null,
          installmentId: null,
          attachment: input.attachment,
          items: input.items ?? [],
          createdAt: new Date().toISOString(),
        };
        // Optimistic append (bill/installment menunggu refresh server).
        setData((d) => ({ ...d, transactions: [tx, ...d.transactions] }));
        api.createTransaction(input).then(refresh).catch((e) => fail("createTransaction", e));
      },

      updateTransaction: (id, patch) => {
        setData((d) => ({
          ...d,
          transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
        api.updateTransaction(id, patch).then(refresh).catch((e) => fail("updateTransaction", e));
      },

      deleteTransaction: (id) => {
        const prev = data.transactions;
        setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
        api.deleteTransaction(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, transactions: prev }));
          fail("deleteTransaction", e);
        });
      },

      addWallet: (w) => {
        setData((d) => ({
          ...d,
          wallets: [...d.wallets, { id: nid("w"), name: w.name, scope: w.scope, ownerProfileId: w.ownerProfileId }],
        }));
        api.createWallet(w).then(refresh).catch((e) => fail("addWallet", e));
      },

      updateWallet: (id, patch) => {
        setData((d) => ({
          ...d,
          wallets: d.wallets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }));
        api.updateWallet(id, patch).then(refresh).catch((e) => fail("updateWallet", e));
      },

      deleteWallet: (id) => {
        const prev = data.wallets;
        setData((d) => ({ ...d, wallets: d.wallets.filter((w) => w.id !== id) }));
        return api.deleteWallet(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, wallets: prev }));
          console.error("[store] deleteWallet:", e);
          throw e;
        });
      },

      transferBetweenWallets: (input) => {
        api.transferBetweenWallets(input).then(refresh).catch((e) => fail("transferBetweenWallets", e));
      },

      addBudget: (b) => {
        setData((d) => ({
          ...d,
          budgets: [...d.budgets, { id: nid("bg"), categoryId: b.categoryId, amount: b.amount, ownerProfileId: b.ownerProfileId }],
        }));
        api.createBudget(b).then(refresh).catch((e) => fail("addBudget", e));
      },

      updateBudget: (id, patch) => {
        setData((d) => ({
          ...d,
          budgets: d.budgets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }));
        api.updateBudget(id, patch).then(refresh).catch((e) => fail("updateBudget", e));
      },

      deleteBudget: (id) => {
        const prev = data.budgets;
        setData((d) => ({ ...d, budgets: d.budgets.filter((b) => b.id !== id) }));
        api.deleteBudget(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, budgets: prev }));
          fail("deleteBudget", e);
        });
      },

      updateCategory: (id, patch) => {
        if (id === "new") {
          api.createCategory({ name: patch.name ?? "Baru", direction: patch.direction ?? "expense" })
            .then(refresh)
            .catch((e) => fail("createCategory", e));
          return;
        }
        setData((d) => ({
          ...d,
          categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
        api.updateCategory(id, patch).then(refresh).catch((e) => fail("updateCategory", e));
      },

      deleteCategory: (id) => {
        const prev = data.categories;
        setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }));
        return api.deleteCategory(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, categories: prev }));
          console.error("[store] deleteCategory:", e);
          throw e;
        });
      },

      addCreditCard: (input) => {
        setData((d) => ({
          ...d,
          creditCards: [
            ...d.creditCards,
            { id: nid("cc"), name: input.name, issuer: input.issuer ?? "", lastFour: input.lastFour ?? "", statementDay: input.statementDay, dueDay: input.dueDay, creditLimit: input.creditLimit ?? 0 },
          ],
        }));
        api.createCreditCard(input).then(refresh).catch((e) => fail("addCreditCard", e));
      },

      updateCreditCard: (id, patch) => {
        setData((d) => ({
          ...d,
          creditCards: d.creditCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
        api.updateCreditCard(id, patch).then(refresh).catch((e) => fail("updateCreditCard", e));
      },

      deleteCreditCard: (id) => {
        const prev = data.creditCards;
        setData((d) => ({ ...d, creditCards: d.creditCards.filter((c) => c.id !== id) }));
        return api.deleteCreditCard(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, creditCards: prev }));
          console.error("[store] deleteCreditCard:", e);
          throw e;
        });
      },

      updateGroupName: (name) => {
        if (!data.group.id) return;
        setData((d) => ({ ...d, group: { ...d.group, name } }));
        api.updateGroupName(data.group.id, name).then(refresh).catch((e) => fail("updateGroupName", e));
      },

      payBill: (billId, opts) => {
        api.payBill(billId, opts).then(refresh).catch((e) => fail("payBill", e));
      },

      approveDraft: (id, patch) => {
        api.approveDraft(id, patch).then(refresh).catch((e) => fail("approveDraft", e));
      },

      rejectDraft: (id) => {
        api.rejectDraft(id).then(refresh).catch((e) => fail("rejectDraft", e));
      },

      deleteDraft: (id) => {
        const prev = data.drafts;
        setData((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== id) }));
        api.deleteDraft(id).then(refresh).catch((e) => {
          setData((d) => ({ ...d, drafts: prev }));
          fail("deleteDraft", e);
        });
      },

      markNotifRead: (id) => {
        setData((d) => ({
          ...d,
          notifications: d.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
        api.markNotifRead(id).catch((e) => fail("markNotifRead", e));
      },

      markNotifAllRead: () => {
        setData((d) => ({
          ...d,
          notifications: d.notifications.map((n) => ({ ...n, read: true })),
        }));
        api.markNotifAllRead().catch((e) => fail("markNotifAllRead", e));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sessionProfileId, activeProfileId, theme, loading]);

  return <Ctx.Provider value={apiCtx}>{children}</Ctx.Provider>;
}

export function useApp(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp harus dipakai di dalam AppProvider");
  return ctx;
}

export type { Wallet };
