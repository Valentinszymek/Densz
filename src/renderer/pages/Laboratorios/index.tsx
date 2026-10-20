import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { useLaboratorios } from "../../features/laboratorios/hooks";
import { formatearFecha } from "../../lib/format";
import type { LaboratorioParaAdmin } from "@shared/types/entities";

const TONO_ESTADO: Record<string, "exito" | "gold" | "error" | "neutral"> = {
  active: "exito",
  trialing: "gold",
  past_due: "error",
  canceled: "neutral"
};

const ETIQUETA_ESTADO: Record<string, string> = {
  active: "Activo",
  trialing: "Trial",
  past_due: "Pago vencido",
  canceled: "Cancelado"
};

function FilaLaboratorio({ lab }: { lab: LaboratorioParaAdmin }) {
  return (
    <Tr>
      <Td>
        <p className="font-medium text-carbon truncate">{lab.nombre}</p>
        <p className="text-carbon/40 text-xs truncate">{lab.emailContacto}</p>
      </Td>
      <Td className="text-carbon/60 text-sm">{lab.plan}</Td>
      <Td>
        <Badge tono={TONO_ESTADO[lab.estadoSuscripcion] ?? "neutral"}>
          {ETIQUETA_ESTADO[lab.estadoSuscripcion] ?? lab.estadoSuscripcion}
        </Badge>
      </Td>
      <Td className="text-carbon/50 text-xs">{lab.trialTerminaEn ? formatearFecha(lab.trialTerminaEn) : "—"}</Td>
      <Td className="text-carbon/50 text-xs">{formatearFecha(lab.creadoEn)}</Td>
      <Td>{!lab.activo && <Badge tono="error">Inactivo</Badge>}</Td>
    </Tr>
  );
}

/** Panel privado del dueño de Densz — lista todos los laboratorios
 * registrados en la plataforma (no uno por uno, como el resto de la app).
 * Solo visible/accesible si la sesión es superAdmin (ver navigation.ts,
 * RutaSoloSuperAdmin, y requireSuperAdmin del lado del servidor). */
export default function Laboratorios() {
  const { data: laboratorios, isLoading } = useLaboratorios();

  return (
    <div>
      <PageHeader title="Laboratorios" description="Todos los laboratorios registrados en Densz." />

      <Table>
        <Thead>
          <Tr>
            <Th>Laboratorio</Th>
            <Th>Plan</Th>
            <Th>Estado</Th>
            <Th>Trial vence</Th>
            <Th>Registrado</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {!isLoading && laboratorios?.map((lab) => <FilaLaboratorio key={lab.id} lab={lab} />)}
        </Tbody>
      </Table>

      {!isLoading && laboratorios?.length === 0 && (
        <p className="text-carbon/40 text-sm text-center py-12">Todavía no se registró ningún laboratorio.</p>
      )}
    </div>
  );
}
