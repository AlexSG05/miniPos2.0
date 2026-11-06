import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { useAuth } from "../../features/auth/useAuth";
import { getOpenCashSession } from "../../features/cash-register/cash.api";
import { getBusinessSettings } from "../../features/settings/settings.api";
import PosHeader from "../../features/sales/pos/PosHeader";
import { useOnlineStatus } from "../../features/sales/pos/pos.hooks";
import { posMenuFor } from "../../features/sales/pos/pos.menu";
import { TERMINAL } from "../../features/sales/pos/terminal.config";
import { useLocation } from "react-router-dom";

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [cashIsOpen, setCashIsOpen] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState("MiniPOS");
  const online = useOnlineStatus();
  const isSalesPage = location.pathname === "/ventas";
  const menuItems = useMemo(() => user ? posMenuFor(user.role) : [], [user]);

  useEffect(() => {
    let active = true;
    const loadSettings = () => {
      void getBusinessSettings().then((settings) => {
        if (active) setBusinessName(settings.businessName);
      }).catch(() => undefined);
    };
    const loadCash = () => {
      if (user?.role === "inventory") {
        setCashIsOpen(null);
        return;
      }
      void getOpenCashSession().then((session) => {
        if (active) setCashIsOpen(session !== null);
      }).catch(() => {
        if (active) setCashIsOpen(null);
      });
    };

    loadSettings();
    loadCash();
    const interval = window.setInterval(loadCash, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user?.role]);

  return (
    <div className="app-frame flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-800">
      <PosHeader
        businessName={businessName}
        cashierName={user?.displayName ?? "—"}
        registerName={TERMINAL.registerName}
        branchName={TERMINAL.branchName}
        serverLabel={TERMINAL.serverLabel}
        online={online}
        shiftOpen={cashIsOpen}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />
      <main className={`main-area min-h-0 flex-1 overflow-hidden ${isSalesPage ? "bg-slate-100" : "bg-slate-50"}`}>
        <section className={`page-content h-full min-h-0 overflow-hidden ${isSalesPage ? "p-0" : "p-4 sm:p-5"}`}>
          {children}
        </section>
      </main>
      {!isSalesPage && (
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Activity size={12} /> Modo local</span>
          <span>MiniPOS · V0.1.0</span>
        </footer>
      )}
    </div>
  );
}
