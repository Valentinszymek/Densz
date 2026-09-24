import {
  LayoutDashboard,
  Stethoscope,
  Building2,
  Users,
  ClipboardList,
  Tags,
  Landmark,
  Receipt,
  BarChart3,
  DatabaseBackup,
  Settings,
  UserCog,
  History,
  type LucideIcon
} from "lucide-react";

export interface ItemNavegacion {
  path: string;
  label: string;
  icon: LucideIcon;
  soloAdmin?: boolean;
}

export const NAVEGACION_PRINCIPAL: ItemNavegacion[] = [
  { path: "/", label: "Inicio", icon: LayoutDashboard },
  { path: "/odontologos", label: "Odontólogos", icon: Stethoscope },
  { path: "/clinicas", label: "Clínicas", icon: Building2 },
  { path: "/pacientes", label: "Pacientes", icon: Users },
  { path: "/trabajos", label: "Trabajos", icon: ClipboardList },
  { path: "/precios", label: "Precios", icon: Tags, soloAdmin: true },
  { path: "/cuentas", label: "Cuentas", icon: Landmark, soloAdmin: true },
  { path: "/comprobantes", label: "Comprobantes", icon: Receipt, soloAdmin: true },
  { path: "/estadisticas", label: "Estadísticas", icon: BarChart3, soloAdmin: true }
];

export const NAVEGACION_SECUNDARIA: ItemNavegacion[] = [
  { path: "/backups", label: "Backups", icon: DatabaseBackup, soloAdmin: true },
  { path: "/usuarios", label: "Usuarios", icon: UserCog, soloAdmin: true },
  { path: "/auditoria", label: "Auditoría", icon: History, soloAdmin: true },
  { path: "/configuracion", label: "Configuración", icon: Settings, soloAdmin: true }
];
