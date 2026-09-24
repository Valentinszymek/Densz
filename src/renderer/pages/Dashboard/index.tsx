import { useNavigate } from "react-router-dom";
import { ClipboardList, Wallet, AlertCircle, Plus, Stethoscope, Landmark, Receipt, Clock, CheckCircle2, Ban } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { PeriodoSelector } from "../../components/layout/PeriodoSelector";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { useEstadoSistema } from "../../features/system/hooks";
import { useResumenOperativo } from "../../features/estadisticas/hooks";
import { useOrdenes } from "../../features/ordenes/hooks";
import { useComprobantes } from "../../features/comprobantes/hooks";
import { usePeriodo } from "../../lib/usePeriodo";
import { formatearFecha } from "../../lib/format";

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isError: errorSistema } = useEstadoSistema();
  const { periodo, setPeriodo, personalizado, setPersonalizado, rango } = usePeriodo("mes");

  const { data: kpis, isLoading: cargandoKpis } = useResumenOperativo(rango);
  const { data: ultimosTrabajos } = useOrdenes({ limite: 5 });
  const { data: pendientesFacturar } = useOrdenes({ estado: "pendiente_facturar", limite: 5 });
  const { data: ultimasAnuladas } = useOrdenes({ estado: "anulado", limite: 5 });
  const { data: comprobantesRecientes } = useComprobantes({ limite: 5 });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <PageHeader title={`${saludo()}.`} description="Panel principal de Densz." />
        <PeriodoSelector
          periodo={periodo}
          onChangePeriodo={setPeriodo}
          personalizado={personalizado}
          onChangePersonalizado={setPersonalizado}
        />
      </div>

      {errorSistema && (
        <div className="flex items-center gap-2 rounded-lg bg-red-600/10 text-red-700 text-sm px-4 py-3 mb-6">
          <AlertCircle size={16} />
          No se pudo conectar con la base de datos.
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => navigate("/trabajos/nuevo")}>
          <Plus size={15} /> Nuevo trabajo
        </Button>
        <Button variant="secondary" onClick={() => navigate("/odontologos")}>
          <Stethoscope size={15} /> Nuevo odontólogo
        </Button>
        <Button variant="secondary" onClick={() => navigate("/cuentas")}>
          <Wallet size={15} /> Registrar pago
        </Button>
        <Button variant="secondary" onClick={() => navigate("/cuentas")}>
          <Landmark size={15} /> Ver cuentas
        </Button>
      </div>

      {/* Resumen operativo — a propósito SIN ningún importe: Inicio es la
          pantalla que cualquiera puede ver de pasada, así que solo muestra
          cantidades de trabajo, nunca dinero. El detalle financiero vive
          en Estadísticas y, sobre todo, en Cuentas. */}
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40">Resumen operativo</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle>Trabajos del período</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums">
              {cargandoKpis ? "—" : kpis?.cantidadTrabajos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle className="flex items-center gap-1.5">
              <Clock size={13} className="text-amber-600" /> Pendientes de facturar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums text-amber-700">
              {cargandoKpis ? "—" : kpis?.cantidadPendientesFacturar}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" /> Facturados
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums text-emerald-700">
              {cargandoKpis ? "—" : kpis?.cantidadFacturados}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle className="flex items-center gap-1.5">
              <Ban size={13} className="text-red-500" /> Anulados
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums text-red-600">
              {cargandoKpis ? "—" : kpis?.cantidadAnulados}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40">Trabajos recientes</p>
              <button onClick={() => navigate("/trabajos")} className="text-xs text-gold-dim hover:underline">
                Ver todos
              </button>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>N° OT</Th>
                  <Th>Paciente</Th>
                  <Th>Odontólogo</Th>
                  <Th>Estado</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ultimosTrabajos?.map((o) => (
                  <Tr key={o.id} className="cursor-pointer" onClick={() => navigate(`/trabajos/${o.id}`)}>
                    <Td className="font-mono">{o.numero}</Td>
                    <Td className="text-carbon/70">{o.pacienteNombreCompleto}</Td>
                    <Td className="text-carbon/70">{o.odontologoNombre}</Td>
                    <Td>
                      <Badge tono={o.estado === "facturado" ? "exito" : o.estado === "anulado" ? "error" : "neutral"}>
                        {o.estado === "facturado" ? "Facturado" : o.estado === "anulado" ? "Anulado" : "Pendiente"}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
                {ultimosTrabajos?.length === 0 && (
                  <Tr>
                    <Td colSpan={4} className="text-center text-carbon/40">
                      Sin trabajos todavía.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2 flex items-center gap-1.5">
              <ClipboardList size={13} /> Pendientes de facturación
            </p>
            {pendientesFacturar?.length === 0 ? (
              <p className="text-sm text-carbon/40">No hay trabajos pendientes de facturar.</p>
            ) : (
              <div className="space-y-1">
                {pendientesFacturar?.map((o) => (
                  <div
                    key={o.id}
                    className="flex justify-between text-sm px-3 py-2 rounded-lg hover:bg-carbon/5 cursor-pointer"
                    onClick={() => navigate(`/trabajos/${o.id}`)}
                  >
                    <span className="font-mono text-carbon/60">{o.numero}</span>
                    <span className="text-carbon/50">{o.pacienteNombreCompleto}</span>
                    <span className="text-carbon/40">{formatearFecha(o.fechaTrabajo)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 flex items-center gap-1.5">
                <Receipt size={13} /> Comprobantes recientes
              </p>
              <button onClick={() => navigate("/comprobantes")} className="text-xs text-gold-dim hover:underline">
                Ver todos
              </button>
            </div>
            {comprobantesRecientes?.length === 0 ? (
              <p className="text-sm text-carbon/40">Sin comprobantes todavía.</p>
            ) : (
              <div className="space-y-1">
                {comprobantesRecientes?.map((c) => (
                  <div
                    key={c.id}
                    className="flex justify-between text-sm px-3 py-2 rounded-lg hover:bg-carbon/5 cursor-pointer"
                    onClick={() => navigate(`/trabajos/${c.ordenId}`)}
                  >
                    <span className="font-mono text-carbon/60">{c.numero}</span>
                    <span className="text-carbon/70">{c.odontologoNombre}</span>
                    <span className="text-carbon/40">{formatearFecha(c.fechaEmision)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2 flex items-center gap-1.5">
              <Ban size={13} /> Últimas OT anuladas
            </p>
            {ultimasAnuladas?.length === 0 ? (
              <p className="text-sm text-carbon/40">No hay órdenes anuladas recientes.</p>
            ) : (
              <div className="space-y-1">
                {ultimasAnuladas?.map((o) => (
                  <div
                    key={o.id}
                    className="flex justify-between text-sm px-3 py-2 rounded-lg hover:bg-carbon/5 cursor-pointer"
                    onClick={() => navigate(`/trabajos/${o.id}`)}
                  >
                    <span className="font-mono text-carbon/60">{o.numero}</span>
                    <span className="text-carbon/50">{o.pacienteNombreCompleto}</span>
                    <span className="text-carbon/40">{formatearFecha(o.fechaTrabajo)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
