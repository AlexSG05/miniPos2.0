import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getOpenCashSession } from "../../features/cash-register/cash.api";
import { getBusinessSettings } from "../../features/settings/settings.api";
import {
  Activity, Archive, BarChart3, Boxes, LayoutDashboard, LogOut,
  Settings, ShoppingCart, Store, Users
} from "lucide-react";
import { useAuth } from "../../features/auth/useAuth";

const links = [
  
  { to: "/ventas", label: "Punto de venta", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { to: "/", label: "Resumen", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin", "inventory"] },
  { to: "/caja", label: "Movimiento de caja", icon: Archive, roles: ["admin", "cashier",] },
  { to: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [cashIsOpen, setCashIsOpen] = useState(false);
  const [businessName, setBusinessName] = useState("MiniPOS");
  const isSalesPage = location.pathname === "/ventas";
  const pageTitle = links.find((link) => link.to === location.pathname)?.label ?? "MiniPOS";

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (user?.role === "inventory") { setCashIsOpen(false); return; }
      void getOpenCashSession().then((session) => {
        if (active) setCashIsOpen(session !== null);
      }).catch(() => { if (active) setCashIsOpen(false); });
    };
    void getBusinessSettings().then((settings) => {
      if (active) setBusinessName(settings.businessName);
    }).catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [location.pathname, user?.role]);

  return (
    <div className={`app-frame flex flex-col bg-slate-50 text-slate-800 ${isSalesPage ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white shadow-sm"><Store size={19} /></div>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-bold text-slate-900">{businessName}</strong>
              <small className="text-xs text-slate-500">{pageTitle}</small>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 sm:flex">
              <span className={`h-2 w-2 rounded-full ${cashIsOpen ? "bg-emerald-500" : "bg-slate-400"}`} />
              {cashIsOpen ? "Caja abierta" : "Caja sin abrir"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700">
                {user?.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden max-w-36 truncate font-medium text-slate-700 sm:inline">{user?.displayName}</span>
              <button type="button" onClick={() => void signOut()} title="Cerrar sesión" className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-4" aria-label="Navegación principal">
          {links.filter((link) => user && link.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) =>
              `flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${
                isActive ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-blue-200 hover:text-blue-700"
              }`
            }>
              <Icon size={16} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={`main-area min-h-0 flex-1 bg-slate-50 ${isSalesPage ? "overflow-hidden" : ""}`}>
        <section className={`page-content p-4 sm:p-5 ${isSalesPage ? "h-full min-h-0 overflow-hidden" : ""}`}>{children}</section>
      </main>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Activity size={12} /> Modo local</span>
        <span>MiniPOS · V0.1.0</span>
      </footer>
    </div>
  );
}
