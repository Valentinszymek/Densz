import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Phone, MapPin, Building2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { useClinicas } from "../../features/clinicas/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { ClinicaForm } from "./ClinicaForm";

// El listado es solo para ver y navegar a la ficha — sin acciones de
// eliminar (ni fijas ni al hover): "Eliminar clínica" vive únicamente
// dentro de la ficha de cada clínica, en su propia zona de peligro.
export default function Clinicas() {
  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 200);
  const [soloActivas, setSoloActivas] = useState(true);
  const [formAbierto, setFormAbierto] = useState(false);
  const navigate = useNavigate();

  const { data: clinicas, isLoading } = useClinicas({ busqueda, soloActivas });

  return (
    <div>
      <PageHeader
        title="Clínicas"
        description="Clínicas con varios profesionales — la cuenta corriente es de la clínica, el profesional queda como referencia."
        actions={
          <Button onClick={() => setFormAbierto(true)}>
            <Plus size={16} /> Nueva clínica
          </Button>
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
          onClick={() => setSoloActivas((a) => !a)}
          className="text-xs text-carbon/50 hover:text-carbon underline underline-offset-2"
        >
          {soloActivas ? "Mostrar también inactivas" : "Mostrar solo activas"}
        </button>
      </div>

      {!isLoading && clinicas?.length === 0 && (
        <EmptyState
          icon={<Building2 size={28} />}
          title="Todavía no hay clínicas"
          description="Creá la primera y después asigná profesionales desde su ficha de odontólogo."
          action={
            <Button onClick={() => setFormAbierto(true)}>
              <Plus size={16} /> Nueva clínica
            </Button>
          }
        />
      )}

      {(isLoading || (clinicas && clinicas.length > 0)) && (
        <Table>
          <Thead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Teléfono</Th>
              <Th>Dirección</Th>
              <Th>Estado</Th>
            </Tr>
          </Thead>
          <Tbody>
            {clinicas?.map((c) => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/clinicas/${c.id}`)}>
                <Td className="font-medium">{c.nombre}</Td>
                <Td className="text-carbon/60">
                  {c.telefono ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone size={13} /> {c.telefono}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-carbon/60">
                  {c.direccion ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={13} /> {c.direccion}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <Badge tono={c.activo ? "exito" : "neutral"}>{c.activo ? "Activa" : "Inactiva"}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ClinicaForm open={formAbierto} onOpenChange={setFormAbierto} />
    </div>
  );
}
