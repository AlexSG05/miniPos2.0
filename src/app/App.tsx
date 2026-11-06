
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ProductsPage from "../features/products/ProductsPage";
import DashboardPage from "../features/dashboard/DashboardPage";
import SalesPage from "../features/sales/SalesPage";
import CashRegisterPage from "../features/cash-register/CashRegisterPage";
import ReportsPage from "../features/reports/ReportsPage";
import SettingsPage from "../features/settings/SettingsPage";
import AuthGate from "../features/auth/AuthGate";
import UsersPage from "../features/auth/UsersPage";
import SalesHistoryPage from "../features/sales/SalesHistoryPage";
import PurchasesPage from "../features/purchases/PurchasesPage";
import CustomersPage from "../features/customers/CustomersPage";
import { useAuth } from "../features/auth/useAuth";

function RoleRoutes() {
  const { user } = useAuth();
  if (!user) return null;
  const home = "/ventas";
  return <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      {user.role === "admin" && <Route path="/resumen" element={<DashboardPage />} />}
      <Route path="/ventas" element={<SalesPage />} />
      <Route path="/historial-ventas" element={<SalesHistoryPage />} />
      {(user.role === "admin" || user.role === "inventory") && <Route path="/productos" element={<ProductsPage />} />}
      {(user.role === "admin" || user.role === "inventory") && <Route path="/compras" element={<PurchasesPage />} />}
      {(user.role === "admin" || user.role === "cashier") && <Route path="/clientes" element={<CustomersPage />} />}
      {(user.role === "admin" || user.role === "cashier") && <Route path="/caja" element={<CashRegisterPage />} />}
      {user.role === "admin" && <Route path="/reportes" element={<ReportsPage />} />}
      {user.role === "admin" && <Route path="/configuracion" element={<SettingsPage />} />}
      {user.role === "admin" && <Route path="/usuarios" element={<UsersPage />} />}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </AppShell>;
}

export default function App() {
  return <AuthGate><RoleRoutes /></AuthGate>;
}
