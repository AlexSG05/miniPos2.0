/**
 * ============================================================================
 * COMPONENTE: PosHeader (Barra Superior de Estado y Navegación del POS)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Muestra el encabezado principal del sistema POS con la información contextual 
 * de la sesión activa, estado de red, estado de caja y menú de navegación.
 *
 * FUNCIONALIDADES CLAVE:
 * 1. Indicadores de Estado: Muestra en tiempo real la sucursal, caja, cajero activo, 
 *    estado de la conexión a internet y estado del turno (abierto/cerrado).
 * 2. Menú Accesible con Teclado: Desplegable con soporte para navegación por 
 *    flechas (`ArrowUp` / `ArrowDown`), cierre con `Escape` y trampa de foco inicial.
 * 3. Cierre por Clic Exterior: Detecta clics fuera del contenedor (`mousedown`) 
 *    para ocultar automáticamente el menú desplegable.
 * 4. Acción de Cierre de Sesión: Expone el callback `onSignOut` para salir del sistema.
 * ============================================================================
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogOut, MapPin, Menu, Monitor, Store, UserRound, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import type { PosMenuItem } from "./pos.menu";

type Props = {
  businessName: string;
  cashierName: string;
  registerName: string;
  branchName: string;
  serverLabel: string;
  online: boolean;
  /** null mientras se consulta el estado del turno */
  shiftOpen: boolean | null;
  menuItems: PosMenuItem[];
  onSignOut: () => void;
};

function InfoChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={16} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:block">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function PosHeader({
  businessName, cashierName, registerName, branchName, serverLabel, online, shiftOpen, menuItems, onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Store size={18} />
        </span>
        <strong className="hidden max-w-40 truncate text-sm font-bold text-slate-900 xl:block">{businessName}</strong>
      </div>

      <div className="h-8 w-px shrink-0 bg-slate-200" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">
        <InfoChip icon={UserRound} label="Cajero" value={cashierName} />
        <InfoChip icon={Monitor} label="Caja" value={registerName} />
        <InfoChip icon={MapPin} label="Sucursal" value={branchName} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {shiftOpen === false && (
          <Link
            to="/caja"
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Turno cerrado · Abrir
          </Link>
        )}
        {shiftOpen === true && (
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Turno abierto
          </span>
        )}

        <span
          title={`Servidor: ${serverLabel}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            online ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {online ? <Wifi size={14} className="text-emerald-600" /> : <WifiOff size={14} />}
          {online ? "En línea" : "Sin conexión"}
          <span className="hidden font-normal text-slate-400 xl:inline">· {serverLabel}</span>
        </span>

        <div className="relative" ref={menuRef} onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            <Menu size={17} /> <span className="hidden sm:inline">Menú</span>
            <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              {menuItems.map(({ to, label, hint, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
                  </span>
                </Link>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onSignOut(); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-rose-50 focus:bg-rose-50 focus:outline-none"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <LogOut size={17} />
                </span>
                <span className="text-sm font-semibold text-rose-700">Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
