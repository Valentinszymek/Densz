import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Lock } from "lucide-react";
import { NAVEGACION_PRINCIPAL, NAVEGACION_SECUNDARIA, type ItemNavegacion } from "../../app/navigation";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import { useEstadoProteccion } from "../../features/proteccion/hooks";
import { DenszIsotipo, DenszLogo } from "../brand/DenszLogo";
import { cn } from "../../lib/cn";

/** Rutas que quedan detrás de la protección opcional por contraseña —
 * mismo criterio que el `<ProteccionGuard>` del router. */
const RUTAS_PROTEGIBLES = new Set(["/cuentas", "/estadisticas"]);

function ItemSidebar({ item, colapsado, protegido }: { item: ItemNavegacion; colapsado: boolean; protegido: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive ? "bg-gold/15 text-gold" : "text-cream/60 hover:bg-cream/5 hover:text-cream"
        )
      }
      title={colapsado ? (protegido ? `${item.label} (protegido)` : item.label) : undefined}
    >
      <Icon size={18} className="shrink-0" />
      {!colapsado && (
        <span className="flex-1 flex items-center justify-between min-w-0">
          <span className="truncate">{item.label}</span>
          {/* Candado discreto, no un aviso grande — solo informa que esta
              sección pide contraseña, no cambia nada más de la interfaz. */}
          {protegido && <Lock size={12} className="shrink-0 text-cream/35" />}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const colapsado = useUiStore((s) => s.sidebarColapsado);
  const alternar = useUiStore((s) => s.alternarSidebar);
  const esAdmin = useAuthStore((s) => s.sesion?.rolNombre === "ADMINISTRADOR");
  const principal = NAVEGACION_PRINCIPAL.filter((item) => !item.soloAdmin || esAdmin);
  const secundaria = NAVEGACION_SECUNDARIA.filter((item) => !item.soloAdmin || esAdmin);
  const { data: proteccion } = useEstadoProteccion();

  return (
    <aside
      className={cn(
        "flex flex-col bg-carbon text-cream shrink-0 transition-[width] duration-150",
        colapsado ? "w-[68px]" : "w-64"
      )}
    >
      {/* El logo oficial ya trae "Densz" / "DENTAL LAB" incluido en la
          pieza — no se repite como texto aparte al lado (§ verse limpio,
          sin duplicar la marca). Colapsado, el lockup completo sería
          ilegible a ese ancho, así que se usa el isotipo (mismo criterio
          que el ícono de Windows: el diente solo cuando el espacio no
          alcanza para el logo completo).
          Cabecera más alta a propósito (antes h-16/64px) para darle al
          logo el "respiro" pedido — el `height` de `DenszLogo` fija solo
          el alto y el ancho fluye solo (`width: auto`), así que nunca se
          deforma ni se estira, en ninguna resolución. */}
      <div
        className={cn(
          "flex items-center justify-center px-4 py-5 min-h-28 border-b border-cream/10",
          colapsado && "px-0 min-h-24"
        )}
      >
        {colapsado ? <DenszIsotipo size={52} /> : <DenszLogo height={88} className="max-w-full" />}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-invisible px-3 py-4 space-y-1">
        {principal.map((item) => (
          <ItemSidebar
            key={item.path}
            item={item}
            colapsado={colapsado}
            protegido={!!proteccion?.activada && RUTAS_PROTEGIBLES.has(item.path)}
          />
        ))}
      </nav>

      <div className="px-3 py-4 space-y-1 border-t border-cream/10">
        {secundaria.map((item) => (
          <ItemSidebar
            key={item.path}
            item={item}
            colapsado={colapsado}
            protegido={!!proteccion?.activada && RUTAS_PROTEGIBLES.has(item.path)}
          />
        ))}
        <button
          onClick={alternar}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-cream/40 hover:text-cream hover:bg-cream/5 transition-colors"
        >
          {colapsado ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!colapsado && <span>Contraer</span>}
        </button>
      </div>
    </aside>
  );
}
