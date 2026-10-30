import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getOpenCashSession } from "../../features/cash-register/cash.api";
import { getBusinessSettings } from "../../features/settings/settings.api";
import {
  Activity, Archive, BarChart3, Boxes,
  LayoutDashboard, LogOut, Settings, ShoppingCart, Store, Users
} from "lucide-react";
import { useAuth } from "../../features/auth/useAuth";

const links = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/ventas", label: "Punto de venta", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin", "inventory"] },
  { to: "/caja", label: "Caja", icon: Archive, roles: ["admin", "cashier"] },
  { to: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] }
];

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [cashIsOpen, setCashIsOpen] = useState(false);
  const [businessName, setBusinessName] = useState("MiniPOS");
  const pageTitle = links.find((link) => link.to === location.pathname)?.label ?? "MiniPOS";

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (user?.role === "inventory") { setCashIsOpen(false); return; }
      void getOpenCashSession().then((session) => { if (active) setCashIsOpen(session !== null); }).catch(() => { if (active) setCashIsOpen(false); });
    };
    void getBusinessSettings().then((settings) => { if (active) setBusinessName(settings.businessName); }).catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [location.pathname, user?.role]);

  return (
    <div className="app-frame flex flex-col min-h-screen">
      <header className="top-navbar bg-white border-b border-zinc-200 sticky top-0 z-50">
        <div className="topbar-main flex items-center justify-between px-4 py-2 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="brand-mark bg-zinc-900 text-white p-1.5 rounded-lg">
              <Store size={18} />
            </div>
            <div>
              <strong className="text-sm font-semibold block leading-none">{businessName}</strong>
              <small className="text-xs text-zinc-500">{pageTitle}</small>
            </div>
          </div>

          <div className="topbar-right flex items-center gap-3">
            <div className="cash-pill text-xs px-2.5 py-1 rounded-full border border-zinc-200 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${cashIsOpen ? "bg-emerald-500" : "bg-zinc-400"}`} />
              {cashIsOpen ? "Caja abierta" : "Caja sin abrir"}
            </div>
            
            <div className="profile-chip flex items-center gap-2 text-xs">
              <span className="profile-avatar bg-zinc-200 font-bold px-2 py-1 rounded">
                {user?.displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden sm:inline">
                {user?.displayName} · {user?.role === "admin" ? "Admin" : user?.role === "cashier" ? "Cajero" : "Inventario"}
              </span>
              <button 
                type="button" 
                onClick={() => void signOut()} 
                title="Cerrar sesión" 
                className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-red-600"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>

        <nav className="nav-horizontal flex items-center gap-1 px-4 overflow-x-auto" aria-label="Navegación principal">
          {links.filter((link) => user && link.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
            <NavLink 
              key={to} 
              to={to} 
              end={to === "/"} 
              className={({ isActive }) => 
                `flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive 
                    ? "border-zinc-900 text-zinc-900 font-semibold" 
                    : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
                }`
              }
            >
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="main-area flex-1 bg-zinc-50">
        <section className="page-content p-4">{children}</section>
      </main>

      <footer className="app-footer border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 flex items-center justify-between bg-white">
        <span className="flex items-center gap-1"><Activity size={12} /> Modo local</span>
        <span>MiniPOS · V0.1.0</span>
      </footer>
    </div>
  );
}