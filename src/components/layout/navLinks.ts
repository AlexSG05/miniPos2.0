import {
  Archive, BarChart3, Boxes, LayoutDashboard, Settings, ShoppingCart, Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "../../features/auth/auth.api";

export type NavLinkItem = { to: string; label: string; icon: LucideIcon; roles: UserRole[] };

export const navLinks: NavLinkItem[] = [
  { to: "/ventas", label: "Punto de venta", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { to: "/", label: "Resumen", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/productos", label: "Productos", icon: Boxes, roles: ["admin", "inventory"] },
  { to: "/caja", label: "Movimiento de caja", icon: Archive, roles: ["admin", "cashier"] },
  { to: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
  { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];
