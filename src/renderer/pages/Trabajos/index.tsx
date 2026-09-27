import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, ClipboardList } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { useOrdenes } from "../../features/ordenes/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { formatearMoneda, formatearFecha } from "../../lib/format";
import type { EstadoOrden } from "@shared/types/entities";

const ESTADO_LABEL: Record<EstadoOrden, string> = {
  pendiente_facturar: "Pendiente de facturar",
  facturado: "Facturado",
  anulado: "Anulado"
};

const ESTADO_TONO: Record<EstadoOrden, "neutral" | "exito" | "error"> = {
  pendiente_facturar: "neutral",
  facturado: "exito",
  anulado: "error"
};

export default function Trabajos() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const odontologoId = params.get("odontologo") ? Number(params.get("odontologo")) : undefined;
  const clinicaId = params.get("clinica") ? Number(params.get("clinica")) : undefined;
  const pacienteId = params.get("paciente") ? Number(params.get("paciente")) : undefined;

  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 200);
  const [estado, setEstado] = useState<EstadoOrden | "">("");

  const { data: ordenes, isLoading } = useOrdenes({
    odontologoId,
    clinicaId,
    pacienteId,
    busqueda,
    estado: estado || undefined
  });

  return (
    <div>
      <PageHeader
        title="Trabajos"
        description="Órdenes de trabajo registradas."
        actions={
          <div className="flex gap-2">
            <ExportMenu tipo="trabajos" nombreSugerido="trabajos" odontologoId={odontologoId} clinicaId={clinicaId} />
            <Button onClick={() => navigate("/trabajos/nuevo")}>
              <Plus size={16} /> Nuevo trabajo
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
          <Input
            value={busquedaCruda}
            onChange={(e) => setBusquedaCruda(e.target.value)}
            placeholder="Buscar por N° de OT, paciente u odontólogo…"
            className="pl-9"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoOrden | "")}
          className="h-10 rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente_facturar">Pendiente de facturar</option>
          <option value="facturado">Facturado</option>
          <option value="anulado">Anulado</option>
        </select>
      </div>

      {!isLoading && ordenes?.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="No hay trabajos que coincidan"
          description="Probá cambiar los filtros o creá un trabajo nuevo."
          action={
            <Button onClick={() => navigate("/trabajos/nuevo")}>
              <Plus size={16} /> Nuevo trabajo
            </Button>
          }
        />
      )}

      {(isLoading || (ordenes && ordenes.length > 0)) && (
        <div className="overflow-x-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>N° OT</Th>
                <Th>Fecha</Th>
                <Th>Paciente</Th>
                <Th>Odontólogo</Th>
                <Th>Piezas</Th>
                <Th>Total</Th>
                <Th>Estado</Th>
              </Tr>
            </Thead>
            <Tbody>
              {ordenes?.map((o) => (
                <Tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/trabajos/${o.id}`)}>
                  <Td className="font-mono font-medium">{o.numero}</Td>
                  <Td className="text-carbon/60">{formatearFecha(o.fechaTrabajo)}</Td>
                  <Td>{o.pacienteNombreCompleto}</Td>
                  <Td className="text-carbon/60">{o.odontologoNombre}</Td>
                  <Td className="text-carbon/60">{o.cantidadPiezas || "—"}</Td>
                  <Td className="font-medium">{formatearMoneda(o.totalCentavos, o.moneda)}</Td>
                  <Td>
                    <Badge tono={ESTADO_TONO[o.estado]}>{ESTADO_LABEL[o.estado]}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
