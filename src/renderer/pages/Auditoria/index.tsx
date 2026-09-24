import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { useAuditoria, useOpcionesFiltroAuditoria } from "../../features/auditoria/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { formatearFechaHora } from "../../lib/format";
import { etiquetaAccion } from "@shared/constants/auditoriaAcciones";
import { AuditoriaDetalle } from "./AuditoriaDetalle";
import type { PeriodoAuditoria, RegistroAuditoria } from "@shared/types/entities";

const OPCIONES_PERIODO: Array<{ valor: PeriodoAuditoria; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ultimos7", etiqueta: "Últimos 7 días" },
  { valor: "esteMes", etiqueta: "Este mes" },
  { valor: "mesAnterior", etiqueta: "Mes anterior" },
  { valor: "ultimos30", etiqueta: "Últimos 30 días" },
  { valor: "personalizado", etiqueta: "Personalizado" }
];

const CLASE_SELECT = "h-9 rounded-lg border border-carbon/15 bg-cream-card px-2.5 text-sm min-w-0";

/** Resumen de una sola línea del `detalle` de un evento, para la columna
 * de la tabla — el detalle completo (con campos modificados, etc.) vive
 * en AuditoriaDetalle, esto es solo un vistazo rápido. */
function resumenDetalle(detalle: RegistroAuditoria["detalle"]): string {
  if (!detalle) return "—";
  if (Array.isArray(detalle.cambios)) {
    const cambios = detalle.cambios as Array<{ campo: string; anterior: string; nuevo: string }>;
    if (cambios.length === 0) return "—";
    return cambios.map((c) => `${c.campo}: ${c.anterior} → ${c.nuevo}`).join(" · ");
  }
  const partes: string[] = [];
  for (const [clave, valor] of Object.entries(detalle)) {
    if (valor === null || valor === undefined || typeof valor === "object") continue;
    partes.push(`${clave}: ${valor}`);
  }
  return partes.length > 0 ? partes.join(" · ") : "—";
}

export default function Auditoria() {
  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 300);
  const [usuarioId, setUsuarioId] = useState<number | undefined>(undefined);
  const [accion, setAccion] = useState<string | undefined>(undefined);
  const [entidad, setEntidad] = useState<string | undefined>(undefined);
  const [periodo, setPeriodo] = useState<PeriodoAuditoria>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<RegistroAuditoria | null>(null);

  // Cualquier cambio de filtro vuelve a la página 1 — evita quedar "varado"
  // en una página que ya no existe para el nuevo resultado filtrado.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, usuarioId, accion, entidad, periodo, desde, hasta]);

  const filtro = {
    busqueda: busqueda || undefined,
    usuarioId,
    accion,
    entidad,
    periodo,
    desde: periodo === "personalizado" ? desde || undefined : undefined,
    hasta: periodo === "personalizado" ? hasta || undefined : undefined,
    pagina
  };

  const { data: opciones } = useOpcionesFiltroAuditoria();
  const { data: resultado, isLoading, isFetching, isError, refetch } = useAuditoria(filtro);

  const hayFiltrosActivos = !!busqueda || !!usuarioId || !!accion || !!entidad || periodo !== "todos";

  function limpiarFiltros() {
    setBusquedaCruda("");
    setUsuarioId(undefined);
    setAccion(undefined);
    setEntidad(undefined);
    setPeriodo("todos");
    setDesde("");
    setHasta("");
  }

  const total = resultado?.total ?? 0;
  const tamanoPagina = resultado?.tamanoPagina ?? 50;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanoPagina));
  const desdeFila = total === 0 ? 0 : (pagina - 1) * tamanoPagina + 1;
  const hastaFila = Math.min(pagina * tamanoPagina, total);

  return (
    <div>
      <PageHeader title="Auditoría" description="Registro de acciones sensibles realizadas en el sistema." />

      <div className="rounded-xl border border-carbon/10 bg-cream-card shadow-card mb-4">
        <div className="flex items-center gap-3 p-3.5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
            <Input
              value={busquedaCruda}
              onChange={(e) => setBusquedaCruda(e.target.value)}
              placeholder="Buscar en auditoría..."
              className="pl-9"
            />
          </div>
          <ExportMenu tipo="auditoria" nombreSugerido="auditoria" filtroAuditoria={filtro} />
        </div>

        <div className="flex items-center gap-2.5 px-3.5 pb-3.5 flex-wrap">
          <select
            value={usuarioId ?? ""}
            onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : undefined)}
            className={CLASE_SELECT}
          >
            <option value="">Todos los usuarios</option>
            {opciones?.usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>

          <select
            value={accion ?? ""}
            onChange={(e) => setAccion(e.target.value || undefined)}
            className={CLASE_SELECT}
          >
            <option value="">Todas las acciones</option>
            {opciones?.acciones.map((a) => (
              <option key={a} value={a}>
                {etiquetaAccion(a)}
              </option>
            ))}
          </select>

          <select
            value={entidad ?? ""}
            onChange={(e) => setEntidad(e.target.value || undefined)}
            className={CLASE_SELECT}
          >
            <option value="">Todas las entidades</option>
            {opciones?.entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoAuditoria)} className={CLASE_SELECT}>
            {OPCIONES_PERIODO.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>

          {periodo === "personalizado" && (
            <>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className={CLASE_SELECT}
                aria-label="Desde"
              />
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className={CLASE_SELECT}
                aria-label="Hasta"
              />
            </>
          )}

          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="text-xs text-carbon/45 hover:text-gold-dim underline underline-offset-2 ml-auto"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {isFetching && !isLoading && <p className="text-xs text-carbon/35 mb-2">Actualizando…</p>}

      {isLoading && <p className="text-sm text-carbon/40 py-8 text-center">Cargando auditoría...</p>}

      {isError && (
        <EmptyState
          title="No se pudo cargar la auditoría."
          action={
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          }
        />
      )}

      {!isLoading && !isError && total === 0 && (
        <EmptyState
          title={hayFiltrosActivos ? "No encontramos registros" : "Todavía no hay eventos registrados."}
          description={hayFiltrosActivos ? "Probá cambiar los filtros o ampliar el período." : undefined}
        />
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Fecha</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>ID</Th>
                <Th>Detalle</Th>
              </Tr>
            </Thead>
            <Tbody>
              {resultado?.items.map((e) => (
                <Tr key={e.id} className="cursor-pointer" onClick={() => setSeleccionado(e)}>
                  <Td className="text-carbon/50 text-xs whitespace-nowrap">{formatearFechaHora(e.fecha)}</Td>
                  <Td className="text-carbon/60">{e.usuarioNombre ?? "—"}</Td>
                  <Td className="font-medium whitespace-nowrap">{etiquetaAccion(e.accion)}</Td>
                  <Td className="text-carbon/60">{e.entidad}</Td>
                  <Td className="text-carbon/40">{e.entidadId ?? "—"}</Td>
                  <Td className="text-carbon/60 text-xs max-w-md truncate" title={resumenDetalle(e.detalle)}>
                    {resumenDetalle(e.detalle)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="flex items-center justify-between mt-3 text-sm">
            <p className="text-xs text-carbon/45">
              Mostrando {desdeFila}–{hastaFila} de {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                ← Anterior
              </Button>
              <span className="text-xs text-carbon/45 px-1">
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        </>
      )}

      {seleccionado && (
        <AuditoriaDetalle open onOpenChange={(o) => !o && setSeleccionado(null)} evento={seleccionado} />
      )}
    </div>
  );
}
