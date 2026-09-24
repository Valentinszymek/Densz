import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { usePacientes } from "../../features/pacientes/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { PacienteForm } from "./PacienteForm";
import type { FiltroPacientesDto } from "@shared/types/ipc-contracts";

type OrdenPacientes = NonNullable<FiltroPacientesDto["orden"]>;

const OPCIONES_ORDEN: Array<{ valor: OrdenPacientes; etiqueta: string }> = [
  { valor: "nombre_asc", etiqueta: "Nombre A → Z" },
  { valor: "nombre_desc", etiqueta: "Nombre Z → A" },
  { valor: "reciente", etiqueta: "Más recientes" },
  { valor: "antiguo", etiqueta: "Más antiguos" }
];

// Pacientes es el ÚNICO lugar donde se crean pacientes: Nuevo Trabajo solo
// los selecciona (nunca los crea) — el flujo definitivo pedido.
export default function Pacientes() {
  const navigate = useNavigate();
  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 200);
  const [soloActivos, setSoloActivos] = useState(true);
  // Orden por defecto al entrar: Nombre A → Z, como ya era el comportamiento.
  const [orden, setOrden] = useState<OrdenPacientes>("nombre_asc");
  const [formAbierto, setFormAbierto] = useState(false);

  const { data: pacientes, isLoading } = usePacientes({ busqueda, soloActivos, orden });

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Pacientes asociados a cada odontólogo."
        actions={
          <div className="flex gap-2">
            <ExportMenu tipo="pacientes" nombreSugerido="pacientes" />
            <Button onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nuevo paciente
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative max-w-xs w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
          <Input
            value={busquedaCruda}
            onChange={(e) => setBusquedaCruda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <label htmlFor="orden-pacientes" className="text-carbon/45 text-xs">
            Ordenar por
          </label>
          <select
            id="orden-pacientes"
            value={orden}
            onChange={(e) => setOrden(e.target.value as OrdenPacientes)}
            className="h-9 rounded-lg border border-carbon/15 bg-cream-card px-2.5 text-sm"
          >
            {OPCIONES_ORDEN.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setSoloActivos((a) => !a)}
          className="text-xs text-carbon/50 hover:text-carbon underline underline-offset-2"
        >
          {soloActivos ? "Mostrar también inactivos" : "Mostrar solo activos"}
        </button>
      </div>

      {!isLoading && pacientes?.length === 0 && (
        <EmptyState
          title="Todavía no hay pacientes"
          description="Creá el primero para empezar a registrar trabajos."
          action={
            <Button onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nuevo paciente
            </Button>
          }
        />
      )}

      {(isLoading || (pacientes && pacientes.length > 0)) && (
        <Table>
          <Thead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Odontólogo</Th>
              <Th>Estado</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pacientes?.map((p) => (
              <Tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/pacientes/${p.id}`)}>
                <Td className="font-medium">{p.nombreCompleto}</Td>
                <Td className="text-carbon/60">{p.odontologoNombre}</Td>
                <Td>
                  <Badge tono={p.activo ? "exito" : "neutral"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <PacienteForm open={formAbierto} onOpenChange={setFormAbierto} />
    </div>
  );
}
