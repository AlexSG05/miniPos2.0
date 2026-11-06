/**
 * ============================================================================
 * UTILIDAD: Módulo de Menú Secundario para el POS (pos.menu.ts)
 * ============================================================================
 * 
 * PROPÓSITO:
 * Construye dinámicamente las opciones del menú secundario o de navegación lateral 
 * dentro del módulo POS, adaptando la interfaz según el rol del usuario activo.
 *
 * FUNCIONALIDADES CLAVE:
 * 1. Control de Acceso basado en Roles (RBAC): Filtra los enlaces globales (`navLinks`)
 *    asegurando que solo se muestren las opciones permitidas para el `UserRole` dado.
 * 2. Adaptación de Textos (COPY): Reemplaza los títulos globales de las rutas por 
 *    nombres y descripciones (*hints*) enfocados en la operación diaria del POS.
 * 3. Filtrado de Ruta Principal: Excluye explícitamente `/ventas` para evitar 
 *    redundancia visual mientras el cajero opera la pantalla de cobro.
 * ============================================================================
 */
import type { LucideIcon } from "lucide-react";
import { navLinks } from "../../../components/layout/navLinks";
import type { UserRole } from "../../auth/auth.api";

export type PosMenuItem = { to: string; label: string; hint: string; icon: LucideIcon };

const COPY: Record<string, { label: string; hint: string }> = {
  "/": { label: "Resumen", hint: "Vista general del negocio" },
  "/productos": { label: "Catálogos", hint: "Productos, precios e inventario" },
  "/compras": { label: "Compras", hint: "Proveedores y recepción de mercancía" },
  "/clientes": { label: "Clientes / Fiado", hint: "Saldos, vencimientos y abonos" },
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
