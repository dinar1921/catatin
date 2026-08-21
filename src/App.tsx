import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./data/store";
import { ToastProvider } from "./components/ui";
import { AppShell, FilterProvider } from "./components/layout";
import { LoginPage } from "./features/auth/Login";
import { DashboardPage } from "./features/dashboard/Dashboard";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { AddTransactionPage } from "./features/transactions/AddTransaction";
import { ScanReceiptPage } from "./features/scan/ScanReceipt";
import { BillDetailPage, BillsPage } from "./features/bills/BillsPage";
import { WalletDetailPage, WalletsPage } from "./features/wallets/WalletsPage";
import { BudgetPage } from "./features/budget/BudgetPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { ApprovalsPage } from "./features/approvals/ApprovalsPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { GroupPage, InvitePage, MembersPage, ProfilePage } from "./features/profile/ProfilePages";
import {
  AiOcrSettingsPage,
  ApiSettingsPage,
  CategoriesSettingsPage,
  SettingsPage,
  TelegramSettingsPage,
  WalletsSettingsPage,
  WhatsAppSettingsPage,
} from "./features/settings/SettingsPages";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { sessionProfileId } = useApp();
  if (!sessionProfileId) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <FilterProvider>
                    <AppShell>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<DashboardPage />} />
                        <Route path="/transactions" element={<TransactionsPage />} />
                        <Route path="/add" element={<AddTransactionPage />} />
                        <Route path="/scan" element={<ScanReceiptPage />} />
                        <Route path="/bills" element={<BillsPage />} />
                        <Route path="/bills/:id" element={<BillDetailPage />} />
                        <Route path="/wallets" element={<WalletsPage />} />
                        <Route path="/wallets/:id" element={<WalletDetailPage />} />
                        <Route path="/budget" element={<BudgetPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/approvals" element={<ApprovalsPage />} />
                        <Route path="/notifications" element={<NotificationsPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/group" element={<GroupPage />} />
                        <Route path="/group/members" element={<MembersPage />} />
                        <Route path="/group/invite" element={<InvitePage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/settings/categories" element={<CategoriesSettingsPage />} />
                        <Route path="/settings/wallets" element={<WalletsSettingsPage />} />
                        <Route path="/settings/api" element={<ApiSettingsPage />} />
                        <Route path="/settings/telegram" element={<TelegramSettingsPage />} />
                        <Route path="/settings/whatsapp" element={<WhatsAppSettingsPage />} />
                        <Route path="/settings/ai-ocr" element={<AiOcrSettingsPage />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </AppShell>
                  </FilterProvider>
                </RequireAuth>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
