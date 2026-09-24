import { useEffect, useState } from "react";
import { Plus, Pencil, Power, Trash2, Tags, ListTree, ChevronUp, ChevronDown, FileText } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { cn } from "../../lib/cn";
import { formatearMoneda } from "../../lib/format";
import {
  useListasPrecio,
  useItemsListaPrecio,
  useSetActivaListaPrecio,
  useUsoListaPrecio,
  useEliminarListaPrecio
} from "../../features/listasPrecio/hooks";
import {
  useCategorias,
  usePrestaciones,
  useMoverCategoria,
  useSetActivaPrestacion,
  useUsoCategoria,
  useEliminarCategoria,
  useUsoPrestacion,
  useEliminarPrestacion
} from "../../features/precios/hooks";
import { CategoriaForm } from "./CategoriaForm";
import { PrestacionForm } from "./PrestacionForm";
import { ListaPrecioForm } from "./ListaPrecioForm";
import { CambiarPrecioModal } from "./CambiarPrecioModal";
import { EliminarConUso } from "./EliminarConUso";
import { GenerarListaPreciosModal } from "./GenerarListaPreciosModal";
import type { Prestacion, PrestacionEnLista, CategoriaPrecio, ListaPrecio } from "@shared/types/entities";

export default function Precios() {
  const [vista, setVista] = useState<"listas" | "catalogo">("listas");
  const [listaPreciosAbierta, setListaPreciosAbierta] = useState(false);

  return (
    <div>
      <PageHeader
        title="Precios"
        description="Listas de precios (cada una en su propia moneda) y el catálogo de prestaciones del laboratorio."
        actions={
          <button
            type="button"
            onClick={() => setListaPreciosAbierta(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-carbon/15 px-3 py-2 text-sm text-carbon/60 hover:text-carbon hover:bg-carbon/5"
          >
            <FileText size={14} /> Lista de precios
          </button>
        }
      />
      <GenerarListaPreciosModal open={listaPreciosAbierta} onOpenChange={setListaPreciosAbierta} />

      <div className="flex gap-1 mb-6 border-b border-carbon/10">
        <button
          onClick={() => setVista("listas")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px",
            vista === "listas" ? "border-gold text-carbon" : "border-transparent text-carbon/45 hover:text-carbon"
          )}
        >
          <ListTree size={14} /> Listas de precios
        </button>
        <button
          onClick={() => setVista("catalogo")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px",
            vista === "catalogo" ? "border-gold text-carbon" : "border-transparent text-carbon/45 hover:text-carbon"
          )}
        >
          <Tags size={14} /> Categorías y prestaciones
        </button>
      </div>

      {vista === "listas" ? <VistaListas /> : <VistaCatalogo />}
    </div>
  );
}

function VistaListas() {
  const { data: listas } = useListasPrecio();
  const [listaId, setListaId] = useState<number | null>(null);
  const [listaFormAbierto, setListaFormAbierto] = useState(false);
  const [listaEditando, setListaEditando] = useState<ListaPrecio | null>(null);
  const [prestacionPrecio, setPrestacionPrecio] = useState<PrestacionEnLista | null>(null);
  const [listaAEliminar, setListaAEliminar] = useState<ListaPrecio | null>(null);
  const setActivaLista = useSetActivaListaPrecio();

  useEffect(() => {
    if (!listaId && listas && listas.length > 0) setListaId(listas[0].id);
  }, [listas, listaId]);

  const lista = listas?.find((l) => l.id === listaId) ?? null;
  const { data: items, isLoading } = useItemsListaPrecio(listaId ?? undefined);

  const { data: usoLista, isLoading: cargandoUsoLista } = useUsoListaPrecio(listaAEliminar?.id);
  const eliminarLista = useEliminarListaPrecio();
  const bloqueadoLista = usoLista
    ? usoLista.odontologosAsignados > 0
      ? `Esta lista está asignada a ${usoLista.odontologosAsignados} odontólogo(s). No se puede eliminar sin antes reasignar esos odontólogos a otra lista.`
      : usoLista.usosHistoricos > 0
        ? `Esta lista se usó en ${usoLista.usosHistoricos} trabajo(s) histórico(s), que nunca se modifican. Desactivala en cambio para sacarla de uso sin perder esa referencia.`
        : null
    : null;

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40">Listas</p>
          <button
            onClick={() => {
              setListaEditando(null);
              setListaFormAbierto(true);
            }}
            className="text-gold-dim hover:opacity-70"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="space-y-0.5">
          {listas?.map((l) => (
            <div
              key={l.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm cursor-pointer",
                listaId === l.id ? "bg-gold/15 text-gold-dim font-medium" : "hover:bg-carbon/5 text-carbon/70"
              )}
              onClick={() => setListaId(l.id)}
            >
              <span className="flex-1 truncate">{l.nombre}</span>
              <Badge tono={l.moneda === "USD" ? "gold" : "neutral"}>{l.moneda}</Badge>
              {!l.activo && <Badge tono="neutral">Inactiva</Badge>}
              <button
                className="hidden group-hover:inline-flex text-carbon/40 hover:text-carbon"
                title="Editar lista"
                onClick={(e) => {
                  e.stopPropagation();
                  setListaEditando(l);
                  setListaFormAbierto(true);
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                className="hidden group-hover:inline-flex text-carbon/40 hover:text-red-600"
                title="Eliminar lista"
                onClick={(e) => {
                  e.stopPropagation();
                  setListaAEliminar(l);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {listas?.length === 0 && <p className="text-xs text-carbon/35 px-2.5">Sin listas todavía.</p>}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {lista && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-display text-carbon">{lista.nombre}</h2>
              <Badge tono={lista.moneda === "USD" ? "gold" : "neutral"}>{lista.moneda}</Badge>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActivaLista.mutate({ id: lista.id, activo: !lista.activo })}
            >
              <Power size={14} /> {lista.activo ? "Desactivar" : "Activar"}
            </Button>
          </div>
        )}

        {!isLoading && items?.length === 0 && (
          <EmptyState title="Sin prestaciones" description="Creá prestaciones desde la pestaña Categorías y prestaciones." />
        )}

        {lista && (isLoading || (items && items.length > 0)) && (
          <Table>
            <Thead>
              <Tr>
                <Th>Categoría</Th>
                <Th>Trabajo</Th>
                <Th>Precio ({lista.moneda})</Th>
                <Th>Estado</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items?.map((it) => (
                <Tr key={it.id}>
                  <Td className="text-carbon/50 text-xs">{it.categoriaNombre}</Td>
                  <Td className="font-medium">{it.nombre}</Td>
                  <Td>
                    <button
                      onClick={() => setPrestacionPrecio(it)}
                      className={cn(
                        "font-medium underline decoration-dotted underline-offset-4",
                        it.precioCentavos === null ? "text-red-600" : "text-carbon hover:text-gold-dim"
                      )}
                    >
                      {it.precioCentavos !== null ? formatearMoneda(it.precioCentavos, lista.moneda) : "Sin precio"}
                    </button>
                  </Td>
                  <Td>
                    <Badge tono={it.activo ? "exito" : "neutral"}>{it.activo ? "Activa" : "Inactiva"}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <ListaPrecioForm
        open={listaFormAbierto}
        onOpenChange={setListaFormAbierto}
        lista={listaEditando}
        onCreated={(id) => setListaId(id)}
      />
      <CambiarPrecioModal
        open={prestacionPrecio !== null}
        onOpenChange={(o) => !o && setPrestacionPrecio(null)}
        listaId={listaId}
        moneda={lista?.moneda ?? "ARS"}
        prestacion={prestacionPrecio}
      />
      <EliminarConUso
        open={listaAEliminar !== null}
        onOpenChange={(o) => !o && setListaAEliminar(null)}
        titulo={`Eliminar lista "${listaAEliminar?.nombre ?? ""}"`}
        cargando={cargandoUsoLista}
        bloqueadoPor={bloqueadoLista}
        eliminando={eliminarLista.isPending}
        onConfirmar={() => {
          if (!listaAEliminar) return;
          eliminarLista.mutate(listaAEliminar.id, {
            onSuccess: () => {
              if (listaId === listaAEliminar.id) setListaId(null);
              setListaAEliminar(null);
            }
          });
        }}
      />
    </div>
  );
}

function VistaCatalogo() {
  const { data: categorias } = useCategorias();
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const { data: prestaciones, isLoading } = usePrestaciones(categoriaId ? { categoriaId } : {});
  const moverCategoria = useMoverCategoria();
  const setActivaPrestacion = useSetActivaPrestacion();

  const [categoriaFormAbierto, setCategoriaFormAbierto] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaPrecio | null>(null);
  const [categoriaAEliminar, setCategoriaAEliminar] = useState<CategoriaPrecio | null>(null);
  const [prestacionFormAbierto, setPrestacionFormAbierto] = useState(false);
  const [prestacionEditando, setPrestacionEditando] = useState<Prestacion | null>(null);
  const [prestacionAEliminar, setPrestacionAEliminar] = useState<Prestacion | null>(null);

  useEffect(() => {
    if (!categoriaId && categorias && categorias.length > 0) setCategoriaId(categorias[0].id);
  }, [categorias, categoriaId]);

  const { data: usoCategoria, isLoading: cargandoUsoCategoria } = useUsoCategoria(categoriaAEliminar?.id);
  const eliminarCategoria = useEliminarCategoria();
  const bloqueadoCategoria =
    usoCategoria && usoCategoria.prestacionesConHistorial > 0
      ? `Esta categoría contiene ${usoCategoria.prestacionesConHistorial} prestación(es) usada(s) en trabajos históricos, que nunca se modifican. Desactivalas o movelas a otra categoría antes de eliminar la categoría.`
      : null;
  const advertenciaCategoria =
    usoCategoria && !bloqueadoCategoria && usoCategoria.cantidadPrestaciones > 0
      ? `Esta categoría contiene ${usoCategoria.cantidadPrestaciones} prestación(es) (sin uso histórico). Se eliminarán junto con la categoría.`
      : null;

  const { data: usoPrestacion, isLoading: cargandoUsoPrestacion } = useUsoPrestacion(prestacionAEliminar?.id);
  const eliminarPrestacion = useEliminarPrestacion();
  const bloqueadoPrestacion =
    usoPrestacion && usoPrestacion.enTrabajosHistoricos > 0
      ? `Esta prestación está siendo utilizada actualmente: se usó en ${usoPrestacion.enTrabajosHistoricos} trabajo(s) histórico(s), que nunca se modifican. Desactivala en cambio para sacarla del catálogo activo sin perder esa referencia.`
      : null;
  const advertenciaPrestacion =
    usoPrestacion && !bloqueadoPrestacion && usoPrestacion.enListasActuales > 0
      ? `Esta prestación está siendo utilizada actualmente: ${usoPrestacion.odontologosAfectados} odontólogo(s) la tienen en su lista de precios (${usoPrestacion.enListasActuales} lista(s)). Se le va a quitar el precio de esas listas. Los trabajos históricos no se modifican.`
      : null;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => {
            setPrestacionEditando(null);
            setPrestacionFormAbierto(true);
          }}
        >
          <Plus size={16} /> Nueva prestación
        </Button>
      </div>

      <div className="flex gap-6">
        <aside className="w-56 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40">Categorías</p>
            <button
              onClick={() => {
                setCategoriaEditando(null);
                setCategoriaFormAbierto(true);
              }}
              className="text-gold-dim hover:opacity-70"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="space-y-0.5">
            {categorias?.map((c, idx) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm cursor-pointer",
                  categoriaId === c.id ? "bg-gold/15 text-gold-dim font-medium" : "hover:bg-carbon/5 text-carbon/70"
                )}
                onClick={() => setCategoriaId(c.id)}
              >
                <span className="flex-1 truncate">{c.nombre}</span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    disabled={idx === 0}
                    title="Subir"
                    onClick={(e) => {
                      e.stopPropagation();
                      moverCategoria.mutate({ id: c.id, direccion: "arriba" });
                    }}
                    className="disabled:opacity-20"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    disabled={idx === (categorias?.length ?? 0) - 1}
                    title="Bajar"
                    onClick={(e) => {
                      e.stopPropagation();
                      moverCategoria.mutate({ id: c.id, direccion: "abajo" });
                    }}
                    className="disabled:opacity-20"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    title="Editar categoría"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoriaEditando(c);
                      setCategoriaFormAbierto(true);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    title="Eliminar categoría"
                    className="hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoriaAEliminar(c);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            {categorias?.length === 0 && <p className="text-xs text-carbon/35 px-2.5">Sin categorías todavía.</p>}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {!isLoading && prestaciones?.length === 0 && (
            <EmptyState title="Sin prestaciones en esta categoría" description="Creá la primera para poder usarla en órdenes de trabajo." />
          )}

          {(isLoading || (prestaciones && prestaciones.length > 0)) && (
            <Table>
              <Thead>
                <Tr>
                  <Th>Trabajo</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {prestaciones?.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">{p.nombre}</Td>
                    <Td>
                      <Badge tono={p.activo ? "exito" : "neutral"}>{p.activo ? "Activa" : "Inactiva"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPrestacionEditando(p);
                            setPrestacionFormAbierto(true);
                          }}
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActivaPrestacion.mutate({ id: p.id, activo: !p.activo })}
                          title={p.activo ? "Desactivar" : "Activar"}
                        >
                          <Power size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPrestacionAEliminar(p)}
                          title="Eliminar"
                          className="hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </div>

      <CategoriaForm open={categoriaFormAbierto} onOpenChange={setCategoriaFormAbierto} categoria={categoriaEditando} />
      <PrestacionForm
        open={prestacionFormAbierto}
        onOpenChange={setPrestacionFormAbierto}
        prestacion={prestacionEditando}
        categoriaIdPorDefecto={categoriaId ?? undefined}
      />
      <EliminarConUso
        open={categoriaAEliminar !== null}
        onOpenChange={(o) => !o && setCategoriaAEliminar(null)}
        titulo={`Eliminar categoría "${categoriaAEliminar?.nombre ?? ""}"`}
        cargando={cargandoUsoCategoria}
        bloqueadoPor={bloqueadoCategoria}
        advertencia={advertenciaCategoria}
        eliminando={eliminarCategoria.isPending}
        onConfirmar={() => {
          if (!categoriaAEliminar) return;
          eliminarCategoria.mutate(categoriaAEliminar.id, {
            onSuccess: () => {
              if (categoriaId === categoriaAEliminar.id) setCategoriaId(null);
              setCategoriaAEliminar(null);
            }
          });
        }}
      />
      <EliminarConUso
        open={prestacionAEliminar !== null}
        onOpenChange={(o) => !o && setPrestacionAEliminar(null)}
        titulo={`Eliminar prestación "${prestacionAEliminar?.nombre ?? ""}"`}
        cargando={cargandoUsoPrestacion}
        bloqueadoPor={bloqueadoPrestacion}
        advertencia={advertenciaPrestacion}
        eliminando={eliminarPrestacion.isPending}
        onConfirmar={() => {
          if (!prestacionAEliminar) return;
          eliminarPrestacion.mutate(prestacionAEliminar.id, { onSuccess: () => setPrestacionAEliminar(null) });
        }}
      />
    </div>
  );
}
