import type { LucideIcon } from "lucide-react";
import { navLinks } from "../../../components/layout/navLinks";
import type { UserRole } from "../../auth/auth.api";

export type PosMenuItem = { to: string; label: string; hint: string; icon: LucideIcon };

const COPY: Record<string, { label: string; hint: string }> = {
  "/": { label: "Resumen", hint: "Vista general del negocio" },
  "/productos": { label: "Catálogos", hint: "Productos, precios e inventario" },
  "/caja": { label: "Turno", hint: "Apertura, cierre y movimientos de caja" },
  "/reportes": { label: "Consultas e informes", hint: "Ventas, devoluciones y reportes" },
  "/usuarios": { label: "Usuarios", hint: "Cajeros y permisos" },
  "/configuracion": { label: "Configuración", hint: "Datos del negocio e impuestos" },
};

/** Destinos secundarios del menú del POS, filtrados por rol. */
export function posMenuFor(role: UserRole): PosMenuItem[] {
  return navLinks
    .filter((link) => link.to !== "/ventas" && link.roles.includes(role))
    .map((link) => ({
      to: link.to,
      icon: link.icon,
      label: COPY[link.to]?.label ?? link.label,
      hint: COPY[link.to]?.hint ?? "",
    }));
}
