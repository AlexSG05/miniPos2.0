
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
import { useAuth } from "../features/auth/useAuth";

function RoleRoutes() {
  const { user } = useAuth();
  if (!user) return null;
  const home = user.role === "cashier" || "inventory" || "admin" ? "/ventas" : "/ventas";
  return <AppShell>
    <Routes>
      <Route path="/" element={user.role === "admin" ? <DashboardPage /> : <Navigate to={home} replace />} />
      {(user.role === "admin" || user.role === "cashier") && <Route path="/ventas" element={<SalesPage />} />}
      {(user.role === "admin" || user.role === "inventory") && <Route path="/productos" element={<ProductsPage />} />}
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
