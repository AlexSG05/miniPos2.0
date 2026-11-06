import {
  Archive, BarChart3, Boxes, LayoutDashboard, ReceiptText, Settings, ShoppingCart, Users, Truck, UserRound,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "../../features/auth/auth.api";

export type NavLinkItem = { to: string; label: string; icon: LucideIcon; roles: UserRole[] };

export const navLinks: NavLinkItem[] = [
  { to: "/historial-ventas", label: "Ventas del día", icon: ReceiptText, roles: ["admin", "cashier", "inventory"] },
  { to: "/ventas", label: "Punto de venta", icon: ShoppingCart, roles: ["admin", "cashier", "inventory"] },
  { to: "/resumen", label: "Resumen", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin", "inventory"] },
  { to: "/compras", label: "Compras", icon: Truck, roles: ["admin", "inventory"] },
  { to: "/clientes", label: "Clientes / Fiado", icon: UserRound, roles: ["admin", "cashier"] },
  { to: "/caja", label: "Movimiento de caja", icon: Archive, roles: ["admin", "cashier"] },
  { to: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];
