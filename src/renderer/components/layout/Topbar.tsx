import { Search, LogOut } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import { useLogout } from "../../features/auth/hooks";
import { SystemStatusBadge } from "./SystemStatusBadge";
import { formatearRol } from "../../lib/format";

export function Topbar() {
  const setBusquedaAbierta = useUiStore((s) => s.setBusquedaAbierta);
  const sesion = useAuthStore((s) => s.sesion);
  const logout = useLogout();

  return (
    <header className="h-16 shrink-0 flex items-center gap-4 px-6 border-b border-carbon/10 bg-cream">
      <button
        onClick={() => setBusquedaAbierta(true)}
        className="flex items-center gap-2 h-9 w-full max-w-sm rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm text-carbon/40 hover:border-gold/40 transition-colors"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="text-[10px] border border-carbon/15 rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      <SystemStatusBadge />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-carbon/70 hover:bg-carbon/5">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full bg-carbon text-gold text-[11px]"
              style={{ fontFamily: '"Densz Avatar", "Inter", system-ui, sans-serif', fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              {sesion?.nombreCompleto?.[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="hidden sm:inline">{sesion?.nombreCompleto ?? "—"}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[180px] rounded-lg bg-cream-card border border-carbon/10 shadow-lg py-1"
          >
            <div className="px-3 py-2 text-xs text-carbon/40 border-b border-carbon/10">
              {sesion?.rolNombre ? formatearRol(sesion.rolNombre) : ""}
            </div>
            <DropdownMenu.Item
              onSelect={() => logout.mutate()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-600/5 cursor-pointer outline-none"
            >
              <LogOut size={14} /> Cerrar sesión
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
