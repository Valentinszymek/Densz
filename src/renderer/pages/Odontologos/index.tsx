import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Phone, MapPin } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { useOdontologos, useAsignarListaOdontologo, useUltimaActividadOdontologos } from "../../features/odontologos/hooks";
import { useListasPrecio } from "../../features/listasPrecio/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { OdontologoForm } from "./OdontologoForm";

export default function Odontologos() {
  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 200);
  const [soloActivos, setSoloActivos] = useState(true);
  const [formAbierto, setFormAbierto] = useState(false);
  const navigate = useNavigate();

  const { data: odontologos, isLoading } = useOdontologos({ busqueda, soloActivos });
  const { data: listas } = useListasPrecio(true);
  const asignarLista = useAsignarListaOdontologo();
  const { data: ultimaActividad } = useUltimaActividadOdontologos();

  // Orden fijo del listado: odontólogo con el trabajo más reciente primero.
  // Los que no tienen ningún trabajo registrado quedan al final, sin
  // eliminarse ni ocultarse — solo se mueven abajo.
  const odontologosOrdenados = useMemo(() => {
    if (!odontologos) return odontologos;
    const fechaPorId = new Map(ultimaActividad?.map((u) => [u.odontologoId, u.ultimoTrabajoFecha]));
    return [...odontologos].sort((a, b) => {
      const fa = fechaPorId.get(a.id);
      const fb = fechaPorId.get(b.id);
      if (fa && fb) return new Date(fb).getTime() - new Date(fa).getTime();
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });
  }, [odontologos, ultimaActividad]);

  return (
    <div>
      <PageHeader
        title="Odontólogos"
        description="Clientes del laboratorio: su cuenta, precios y trabajos se organizan por odontólogo."
        actions={
          <div className="flex gap-2">
            <ExportMenu tipo="odontologos" nombreSugerido="odontologos" />
            <Button onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nuevo odontólogo
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
          <Input
            value={busquedaCruda}
            onChange={(e) => setBusquedaCruda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setSoloActivos((a) => !a)}
          className="text-xs text-carbon/50 hover:text-carbon underline underline-offset-2"
        >
          {soloActivos ? "Mostrar también inactivos" : "Mostrar solo activos"}
        </button>
      </div>

      {!isLoading && odontologos?.length === 0 && (
        <EmptyState
          title="Todavía no hay odontólogos"
          description="Creá el primero para empezar a registrar trabajos."
          action={
            <Button onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nuevo odontólogo
            </Button>
          }
        />
      )}

      {(isLoading || (odontologos && odontologos.length > 0)) && (
        <Table>
          <Thead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Teléfono</Th>
              <Th>Ubicación</Th>
              <Th>Lista de precios</Th>
              <Th>Clínica</Th>
              <Th>Estado</Th>
            </Tr>
          </Thead>
          <Tbody>
            {odontologosOrdenados?.map((o) => (
              <Tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/odontologos/${o.id}`)}>
                <Td className="font-medium">{o.nombre}</Td>
                <Td className="text-carbon/60">
                  {o.telefono ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone size={13} /> {o.telefono}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-carbon/60">
                  {o.direccion ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={13} /> {o.direccion}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <select
                    value={o.listaPrecioId}
                    onChange={(e) => asignarLista.mutate({ id: o.id, listaPrecioId: Number(e.target.value) })}
                    className="h-8 rounded-md border border-carbon/15 bg-cream-card px-2 text-xs"
                  >
                    {listas?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre} ({l.moneda})
                      </option>
                    ))}
                  </select>
                </Td>
                <Td className="text-carbon/60">
                  {o.clinicaNombre ?? <span className="text-carbon/30">Independiente</span>}
                </Td>
                <Td>
                  <Badge tono={o.activo ? "exito" : "neutral"}>{o.activo ? "Activo" : "Inactivo"}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <OdontologoForm open={formAbierto} onOpenChange={setFormAbierto} />
    </div>
  );
}
