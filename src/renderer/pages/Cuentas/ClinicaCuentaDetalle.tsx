import { Fragment, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Wallet, FileBarChart, Ban, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { SelectorMes } from "../../components/ui/SelectorMes";
import { useClinica } from "../../features/clinicas/hooks";
import {
  useSaldosClinica,
  useMovimientosClinica,
  useResumenMesClinica,
  useResumenesMensualesClinica,
  useImprimirEstadoDeCuentaClinica,
  useVerPdfResumen
} from "../../features/cuentas/hooks";
import { formatearMoneda, formatearFecha, formatearFechaHora } from "../../lib/format";
import { RegistrarPagoModal } from "./RegistrarPagoModal";
import { AnularPagoModal } from "./AnularPagoModal";
import type { TrabajoFacturadoMes } from "@shared/types/entities";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const ESTADO_TRABAJO_TONO = { pendiente_facturar: "neutral", facturado: "exito", anulado: "error" } as const;
const ESTADO_TRABAJO_LABEL = { pendiente_facturar: "Pendiente", facturado: "Facturado", anulado: "Anulado" } as const;

/** `fechaFacturacion` es `comprobantes.fecha_emision`, que incluye hora
 * ("2026-10-01 21:41:01", no solo la fecha) — dos OTs facturadas el mismo
 * día pero en momentos distintos nunca coinciden como string exacto.
 * Agrupar por el día solo (los primeros 10 caracteres, "YYYY-MM-DD") es
 * lo correcto acá: nunca cambia qué se muestra (formatearFecha ya
 * ignoraba la hora), solo corrige qué cuenta como "la misma fecha". */
function soloFecha(fecha: string | null): string | null {
  return fecha ? fecha.slice(0, 10) : null;
}

/**
 * Agrupación puramente visual (Bloque 1-C) — mismo criterio que
 * CuentaDetalle.tsx: el backend sigue devolviendo los trabajos ordenados
 * por fecha ascendente (ese orden es el que usa también el PDF del
 * resumen mensual y no se toca). Reemplaza el `.reverse()` que ya hacía
 * esta pantalla (ver comentario viejo, abajo) por una agrupación real por
 * fecha, más reciente primero — cada OT sigue siendo su propia fila.
 */
function agruparPorFecha(trabajos: TrabajoFacturadoMes[]): Array<{ fecha: string | null; trabajos: TrabajoFacturadoMes[] }> {
  const ordenados = [...trabajos].sort((a, b) => (soloFecha(b.fechaFacturacion) ?? "").localeCompare(soloFecha(a.fechaFacturacion) ?? ""));
  const grupos: Array<{ fecha: string | null; trabajos: TrabajoFacturadoMes[] }> = [];
  for (const t of ordenados) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === soloFecha(t.fechaFacturacion)) {
      ultimo.trabajos.push(t);
    } else {
      grupos.push({ fecha: soloFecha(t.fechaFacturacion), trabajos: [t] });
    }
  }
  return grupos;
}

export default function ClinicaCuentaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const clinicaId = Number(id);
  const { data: clinica } = useClinica(clinicaId);
  const { data: saldos } = useSaldosClinica(clinicaId);

  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const periodo = useMemo(() => ({ anio, mes }), [anio, mes]);

  const { data: bloques, isLoading: cargandoResumen } = useResumenMesClinica(clinicaId, periodo);
  const { data: resumenesGenerados } = useResumenesMensualesClinica(clinicaId);
  const { data: movimientos } = useMovimientosClinica(clinicaId);
  const pagos = useMemo(() => (movimientos ?? []).filter((m) => m.tipo === "haber"), [movimientos]);

  const imprimir = useImprimirEstadoDeCuentaClinica();
  const verPdfResumen = useVerPdfResumen();

  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [pagoAAnular, setPagoAAnular] = useState<number | null>(null);

  return (
    <div className="max-w-4xl">
      <Link to="/cuentas" className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4">
        <ArrowLeft size={15} /> Cuentas
      </Link>

      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-display text-carbon">{clinica?.nombre ?? "—"}</h1>
        <div className="flex items-center gap-2">
          <ExportMenu
            grupos={[
              { tipo: "cuenta", etiqueta: "Cuenta", nombreSugerido: `cuenta-${clinica?.nombre ?? clinicaId}`, clinicaId },
              { tipo: "pagos", etiqueta: "Pagos", nombreSugerido: `pagos-${clinica?.nombre ?? clinicaId}`, clinicaId }
            ]}
          />
          <Button size="sm" onClick={() => setPagoAbierto(true)}>
            <Wallet size={14} /> Registrar pago
          </Button>
        </div>
      </div>

      {(saldos ?? []).length === 0 && <p className="text-sm text-carbon/40 mb-6">Sin movimientos todavía.</p>}

      {(saldos ?? []).map((s) => (
        <div key={s.moneda} className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2">{s.moneda}</p>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Debe (total facturado)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display">{formatearMoneda(s.totalDebeCentavos, s.moneda)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Haber (total pagado)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display text-emerald-700">{formatearMoneda(s.totalHaberCentavos, s.moneda)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Saldo pendiente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display text-amber-700">{formatearMoneda(s.saldoCentavos, s.moneda)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between mt-8 mb-3 flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40">Trabajos facturados</p>
          <p className="text-xs text-carbon/40 mt-0.5">
            La deuda pertenece a la clínica; cada trabajo conserva el profesional que lo realizó.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SelectorMes anio={anio} mes={mes} onChange={(a, m) => { setAnio(a); setMes(m); }} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => imprimir.mutate({ clinicaId, periodo })}
            disabled={imprimir.isPending}
          >
            <FileBarChart size={14} /> {imprimir.isPending ? "Generando…" : "Generar resumen mensual"}
          </Button>
        </div>
      </div>

      {!cargandoResumen &&
        bloques?.map((b) => (
          <div key={b.moneda} className="mb-8">
            {bloques.length > 1 && <Badge tono="neutral" className="mb-2">{b.moneda}</Badge>}

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-carbon/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-carbon/40">Saldo anterior</p>
                <p className="text-base font-semibold mt-0.5">{formatearMoneda(b.saldoAnteriorCentavos, b.moneda)}</p>
              </div>
              <div className="rounded-lg border border-carbon/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-carbon/40">Trabajos del mes</p>
                <p className="text-base font-semibold mt-0.5">{formatearMoneda(b.totalTrabajosCentavos, b.moneda)}</p>
              </div>
              <div className="rounded-lg border border-carbon/10 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-carbon/40">Pagos del mes</p>
                <p className="text-base font-semibold mt-0.5 text-emerald-700">{formatearMoneda(b.totalPagosCentavos, b.moneda)}</p>
              </div>
              <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gold-dim">Saldo pendiente</p>
                <p className="text-base font-semibold mt-0.5 text-gold-dim">{formatearMoneda(b.saldoPendienteCentavos, b.moneda)}</p>
              </div>
            </div>

            {b.trabajos.length === 0 ? (
              <p className="text-sm text-carbon/40">Sin trabajos facturados en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>N° OT</Th>
                      <Th>Fecha</Th>
                      <Th>Profesional</Th>
                      <Th>Paciente</Th>
                      <Th>Trabajo / prestaciones</Th>
                      <Th>Total</Th>
                      <Th>Estado</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {agruparPorFecha(b.trabajos).map((grupo) => (
                      <Fragment key={grupo.fecha ?? "sin-fecha"}>
                        <Tr className="hover:bg-transparent cursor-default">
                          <Td colSpan={7} className="bg-carbon/[0.03] py-1.5 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                            {grupo.fecha ? formatearFecha(grupo.fecha) : "Sin fecha"}
                          </Td>
                        </Tr>
                        {grupo.trabajos.map((t) => (
                          <Tr
                            key={`${t.ordenId}-${t.comprobanteNumero}`}
                            className={`cursor-pointer ${t.anulado ? "opacity-40" : ""}`}
                            onClick={() => navigate(`/trabajos/${t.ordenId}`)}
                          >
                            <Td className="font-mono text-xs text-carbon/60">{t.ordenNumero}</Td>
                            <Td className="text-carbon/60">{t.fechaFacturacion ? formatearFecha(t.fechaFacturacion) : "—"}</Td>
                            <Td className="text-carbon/70">{t.profesionalNombre}</Td>
                            <Td>{t.pacienteNombreCompleto}</Td>
                            <Td className={`text-carbon/70 ${t.anulado ? "line-through" : ""}`}>{t.prestacionesResumen}</Td>
                            <Td className={`font-medium ${t.anulado ? "line-through" : ""}`}>{formatearMoneda(t.importeCentavos, t.moneda)}</Td>
                            <Td>
                              <Badge tono={ESTADO_TRABAJO_TONO[t.estado]}>{ESTADO_TRABAJO_LABEL[t.estado]}</Badge>
                            </Td>
                          </Tr>
                        ))}
                      </Fragment>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </div>
        ))}

      {resumenesGenerados && resumenesGenerados.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2 mt-8">Resúmenes mensuales generados</p>
          <div className="space-y-2">
            {resumenesGenerados.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-carbon/10 bg-cream-card px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">
                    {NOMBRES_MES[r.mes - 1]} {r.anio}
                    <span className="ml-2 text-carbon/40 font-normal">{r.moneda}</span>
                  </p>
                  <p className="text-xs text-carbon/40">
                    Generado: {formatearFechaHora(r.generadoEn)}
                    {r.generadoPorNombre ? ` por ${r.generadoPorNombre}` : ""} · Trabajos:{" "}
                    {formatearMoneda(r.totalTrabajosCentavos, r.moneda)} · Pagos: {formatearMoneda(r.totalPagosCentavos, r.moneda)} · Saldo:{" "}
                    {formatearMoneda(r.saldoPendienteCentavos, r.moneda)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => verPdfResumen.mutate(r.id)}>
                  <FileText size={14} /> Ver PDF
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2 mt-8">Pagos registrados</p>
      {pagos.length === 0 && <p className="text-sm text-carbon/40">Sin pagos todavía.</p>}
      {pagos.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Descripción</Th>
              <Th>Importe</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {pagos.map((m) => (
              <Tr key={m.id} className={m.anulado ? "opacity-40" : ""}>
                <Td className="text-carbon/60">{formatearFecha(m.fecha)}</Td>
                <Td>
                  {m.descripcion}
                  <Badge tono="neutral" className="ml-2">{m.moneda}</Badge>
                  {m.anulado && <Badge tono="error" className="ml-2">Anulado</Badge>}
                </Td>
                <Td className="text-emerald-700 font-medium">{formatearMoneda(m.importeCentavos, m.moneda)}</Td>
                <Td>
                  {m.pagoId && !m.anulado && (
                    <Button variant="ghost" size="sm" onClick={() => setPagoAAnular(m.pagoId!)} title="Anular pago">
                      <Ban size={13} />
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <RegistrarPagoModal open={pagoAbierto} onOpenChange={setPagoAbierto} titular={{ clinicaId }} />
      {pagoAAnular !== null && (
        <AnularPagoModal open onOpenChange={(o) => !o && setPagoAAnular(null)} pagoId={pagoAAnular} />
      )}
    </div>
  );
}
