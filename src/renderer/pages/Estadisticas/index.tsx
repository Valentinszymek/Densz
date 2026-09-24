import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import { BarChart3, Stethoscope, Building2, ArrowUpRight, ArrowDownRight, Trophy, AlertTriangle, Sparkles, Grid3x3 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { PeriodoSelector } from "../../components/layout/PeriodoSelector";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { ExportMenu } from "../../components/ui/ExportMenu";
import { usePeriodo } from "../../lib/usePeriodo";
import { rangoAnterior } from "../../lib/periodos";
import { formatearMoneda } from "../../lib/format";
import { cn } from "../../lib/cn";
import {
  useKpisPeriodo,
  useEvolucion,
  useRankingOdontologos,
  useRankingClinicas,
  usePrestacionesRanking,
  useSaldosPendientesTop,
  useTrabajosPorCategoria
} from "../../features/estadisticas/hooks";
import type { Moneda, RankingOdontologo, RankingClinica, PrestacionRanking, TrabajoPorCategoria, KpisPeriodo } from "@shared/types/entities";

const COLOR_FACTURADO = "#0E0E10";
const COLOR_COBRADO = "#C9A24B";

// ============================================================
// Helpers
// ============================================================

function variacionPct(actual: number, anterior: number): number | null {
  // Sin datos del período anterior: no mostramos un porcentaje engañoso (§13).
  if (anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  const pct = variacionPct(actual, anterior);
  if (pct === null) return null;
  const positiva = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        positiva ? "text-emerald-700" : "text-red-600"
      )}
      title="Comparado con el período anterior de igual duración"
    >
      {positiva ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function TabsMoneda({ monedas, activa, onChange }: { monedas: Moneda[]; activa: Moneda; onChange: (m: Moneda) => void }) {
  if (monedas.length <= 1) return null;
  return (
    <div className="inline-flex rounded-lg border border-carbon/15 bg-cream-card p-0.5">
      {monedas.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            activa === m ? "bg-carbon text-gold" : "text-carbon/55 hover:bg-carbon/5"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function formatearBucket(bucket: string, granularidad: "dia" | "mes"): string {
  if (granularidad === "dia") {
    const [, m, d] = bucket.split("-");
    return `${d}/${m}`;
  }
  const [anio, mes] = bucket.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "short", year: "2-digit" }).format(new Date(anio, mes - 1, 1));
}

function TooltipEvolucion({ active, payload, label, moneda }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-carbon text-cream text-xs px-3 py-2 shadow-card space-y-0.5">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey}>
          {p.name}: {p.dataKey === "cantidadTrabajos" ? p.value : formatearMoneda(p.value, moneda)}
        </p>
      ))}
    </div>
  );
}

// ============================================================
// Página
// ============================================================

export default function Estadisticas() {
  const navigate = useNavigate();
  const { periodo, setPeriodo, personalizado, setPersonalizado, rango } = usePeriodo("mes");
  const rangoPrev = useMemo(() => rangoAnterior(rango), [rango]);

  const { data: kpis, isLoading: cargandoKpis } = useKpisPeriodo(rango);
  const { data: kpisPrev } = useKpisPeriodo(rangoPrev);
  const { data: evolucion } = useEvolucion(rango);
  const { data: rankingOdo } = useRankingOdontologos(rango);
  const { data: rankingCli } = useRankingClinicas(rango);
  const { data: prestaciones } = usePrestacionesRanking(rango);
  const { data: saldosTop } = useSaldosPendientesTop(10);
  const { data: porCategoria } = useTrabajosPorCategoria(rango);

  const monedasDisponibles = useMemo<Moneda[]>(() => {
    const set = new Set<Moneda>(["ARS"]);
    kpis?.porMoneda.forEach((k) => set.add(k.moneda));
    return Array.from(set);
  }, [kpis]);

  const [monedaEvolucion, setMonedaEvolucion] = useState<Moneda>("ARS");
  const [monedaOdo, setMonedaOdo] = useState<Moneda>("ARS");
  const [monedaCli, setMonedaCli] = useState<Moneda>("ARS");
  const [monedaPrest, setMonedaPrest] = useState<Moneda>("ARS");

  const sinDatos = (kpis?.cantidadTrabajos ?? 0) === 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <PageHeader title="Estadísticas" description="Cómo funcionó el laboratorio en el período seleccionado." />
        <div className="flex items-center gap-2">
          <PeriodoSelector
            periodo={periodo}
            onChangePeriodo={setPeriodo}
            personalizado={personalizado}
            onChangePersonalizado={setPersonalizado}
          />
          <ExportMenu tipo="estadisticas" nombreSugerido="estadisticas" rango={rango} />
        </div>
      </div>

      {/* ── Resumen del período (§14) — lo primero que se ve ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle>Trabajos</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem] gap-2">
            <p className="text-3xl font-display leading-none tabular-nums">{cargandoKpis ? "—" : kpis?.cantidadTrabajos}</p>
            {kpis && kpisPrev && <Variacion actual={kpis.cantidadTrabajos} anterior={kpisPrev.cantidadTrabajos} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle>Piezas trabajadas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums">
              {cargandoKpis ? "—" : kpis?.cantidadPiezasTotal}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle>Odontólogos activos</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums">
              {cargandoKpis ? "—" : kpis?.cantidadOdontologosConTrabajos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="!pb-0">
            <CardTitle>Clínicas activas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[4.5rem]">
            <p className="text-3xl font-display leading-none tabular-nums">
              {cargandoKpis ? "—" : kpis?.cantidadClinicasConTrabajos}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Resumen financiero (§6) — ARS y USD siempre separados ── */}
      <Card className="mb-8">
        <CardHeader className="!pb-0">
          <CardTitle>Resumen financiero</CardTitle>
        </CardHeader>
        <CardContent>
          {!cargandoKpis && (kpis?.porMoneda.length ?? 0) === 0 && (
            <p className="text-carbon/40 text-sm">Sin movimientos en el período.</p>
          )}
          <div className="space-y-5">
            {kpis?.porMoneda.map((k) => {
              const prev = kpisPrev?.porMoneda.find((p) => p.moneda === k.moneda);
              return (
                <div key={k.moneda} className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-start gap-x-6 gap-y-1 text-sm">
                  <Badge tono={k.moneda === "USD" ? "gold" : "neutral"} className="mt-0.5">
                    {k.moneda}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-carbon/40 text-xs">Total facturado</p>
                    <p className="font-display text-lg tabular-nums tracking-wide leading-snug break-words">
                      {formatearMoneda(k.totalRegistradoCentavos, k.moneda)}
                    </p>
                    {prev && <Variacion actual={k.totalRegistradoCentavos} anterior={prev.totalRegistradoCentavos} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-carbon/40 text-xs">Total cobrado</p>
                    <p className="font-display text-lg text-emerald-700 tabular-nums tracking-wide leading-snug break-words">
                      {formatearMoneda(k.pagosRecibidosCentavos, k.moneda)}
                    </p>
                    {prev && <Variacion actual={k.pagosRecibidosCentavos} anterior={prev.pagosRecibidosCentavos} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-carbon/40 text-xs">Total pendiente (actual)</p>
                    <p className="font-display text-lg text-amber-700 tabular-nums tracking-wide leading-snug break-words">
                      {formatearMoneda(k.pendienteCobroCentavos, k.moneda)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-carbon/40 text-xs">Ticket promedio</p>
                    <p className="font-display text-lg tabular-nums tracking-wide leading-snug break-words">
                      {k.cantidadTrabajos > 0 ? formatearMoneda(k.ticketPromedioCentavos, k.moneda) : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {sinDatos ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="Sin trabajos en este período"
          description="Elegí otro período o registrá trabajos desde Nuevo Trabajo."
        />
      ) : (
        <div className="space-y-8 mb-8">
          {/* ── Análisis del laboratorio (§22) — la lectura rápida de "cómo venimos" ── */}
          <AnalisisLaboratorio
            prestaciones={prestaciones}
            rankingOdo={rankingOdo}
            porCategoria={porCategoria}
            kpis={kpis}
            kpisPrev={kpisPrev}
          />

          {/* ── Evolución (§7) ── */}
          <SeccionEvolucion
            evolucion={evolucion}
            monedasDisponibles={monedasDisponibles}
            moneda={monedaEvolucion}
            onChangeMoneda={setMonedaEvolucion}
          />

          {/* ── Rankings de odontólogos y clínicas (§8, §9) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RankingCard
              titulo="Ranking de odontólogos"
              icono={<Stethoscope size={13} />}
              filas={rankingOdo}
              monedasDisponibles={monedasDisponibles}
              moneda={monedaOdo}
              onChangeMoneda={setMonedaOdo}
              nombreDe={(f) => f.odontologoNombre}
              onVer={(f) => navigate(`/odontologos/${f.odontologoId}`)}
            />
            <RankingCard
              titulo="Ranking de clínicas"
              icono={<Building2 size={13} />}
              filas={rankingCli}
              monedasDisponibles={monedasDisponibles}
              moneda={monedaCli}
              onChangeMoneda={setMonedaCli}
              nombreDe={(f) => f.clinicaNombre}
              onVer={(f) => navigate(`/clinicas/${f.clinicaId}`)}
            />
          </div>

          {/* ── Prestaciones (§10, §11) ── */}
          <Card>
            <CardHeader className="!pb-0 flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Prestaciones del período</CardTitle>
              <TabsMoneda monedas={monedasDisponibles} activa={monedaPrest} onChange={setMonedaPrest} />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ListaPrestaciones
                  titulo="Más realizadas"
                  datos={(prestaciones ?? []).filter((p) => p.moneda === monedaPrest)}
                  ordenarPor="cantidad"
                  moneda={monedaPrest}
                />
                <ListaPrestaciones
                  titulo="Mayor facturación"
                  datos={(prestaciones ?? []).filter((p) => p.moneda === monedaPrest)}
                  ordenarPor="totalCentavos"
                  moneda={monedaPrest}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Mayores saldos pendientes (§12) — no depende del período ── */}
      <Card>
        <CardHeader className="!pb-0">
          <CardTitle className="flex items-center gap-1.5">
            <AlertTriangle size={13} /> Mayores saldos pendientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(saldosTop?.length ?? 0) === 0 ? (
            <p className="text-sm text-carbon/40">Nadie tiene saldo pendiente en este momento.</p>
          ) : (
            <div className="divide-y divide-carbon/8">
              {saldosTop?.map((s) => (
                <button
                  key={`${s.tipo}-${s.id}-${s.moneda}`}
                  onClick={() => navigate(s.tipo === "odontologo" ? `/odontologos/${s.id}` : `/clinicas/${s.id}`)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-carbon/5 rounded-lg px-2 -mx-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {s.tipo === "odontologo" ? (
                      <Stethoscope size={13} className="text-carbon/35 shrink-0" />
                    ) : (
                      <Building2 size={13} className="text-carbon/35 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{s.nombre}</span>
                    <Badge tono={s.moneda === "USD" ? "gold" : "neutral"}>{s.moneda}</Badge>
                  </span>
                  <span className="font-display text-sm text-amber-700 tabular-nums shrink-0">
                    {formatearMoneda(s.saldoCentavos, s.moneda)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Análisis del laboratorio
// ============================================================

/** Suma `campo` agrupando por `clave` a través de todas las monedas —
 * para "¿cuál se hizo más?" la moneda no importa, solo el volumen. Nunca
 * se usa para sumar dinero de monedas distintas, solo cantidades. */
function agruparSumando<T>(filas: T[], clave: (f: T) => string, campo: (f: T) => number): Array<{ clave: string; total: number }> {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const k = clave(f);
    mapa.set(k, (mapa.get(k) ?? 0) + campo(f));
  }
  return Array.from(mapa.entries())
    .map(([clave, total]) => ({ clave, total }))
    .sort((a, b) => b.total - a.total);
}

function AnalisisLaboratorio({
  prestaciones,
  rankingOdo,
  porCategoria,
  kpis,
  kpisPrev
}: {
  prestaciones: PrestacionRanking[] | undefined;
  rankingOdo: RankingOdontologo[] | undefined;
  porCategoria: TrabajoPorCategoria[] | undefined;
  kpis: KpisPeriodo | undefined;
  kpisPrev: KpisPeriodo | undefined;
}) {
  const prestacionTop = useMemo(
    () => agruparSumando(prestaciones ?? [], (p) => p.prestacionNombre, (p) => p.cantidad)[0],
    [prestaciones]
  );
  const categoriaTop = useMemo(
    () => agruparSumando(porCategoria ?? [], (c) => c.categoriaNombre, (c) => c.cantidad)[0],
    [porCategoria]
  );
  // Mayor facturación: se prioriza ARS (la moneda más habitual del
  // laboratorio) y si no hay actividad ahí, se toma la que sí tenga —
  // nunca se comparan importes de monedas distintas entre sí.
  const odontologoTop = useMemo(() => {
    const filas = rankingOdo ?? [];
    const enArs = filas.filter((f) => f.moneda === "ARS");
    const base = enArs.length > 0 ? enArs : filas;
    return base.slice().sort((a, b) => b.facturadoCentavos - a.facturadoCentavos)[0];
  }, [rankingOdo]);

  const variacionTrabajos = kpis && kpisPrev ? variacionPct(kpis.cantidadTrabajos, kpisPrev.cantidadTrabajos) : null;

  const items: Array<{ icono: React.ReactNode; etiqueta: string; valor: string; detalle?: string }> = [
    {
      icono: <Trophy size={14} className="text-gold-dim" />,
      etiqueta: "Prestación más realizada",
      valor: prestacionTop ? prestacionTop.clave : "—",
      detalle: prestacionTop ? `${prestacionTop.total} vez/veces` : "Sin datos en el período"
    },
    {
      icono: <Stethoscope size={14} className="text-gold-dim" />,
      etiqueta: "Odontólogo con mayor facturación",
      valor: odontologoTop ? odontologoTop.odontologoNombre : "—",
      detalle: odontologoTop ? formatearMoneda(odontologoTop.facturadoCentavos, odontologoTop.moneda) : "Sin datos en el período"
    },
    {
      icono: <Grid3x3 size={14} className="text-gold-dim" />,
      etiqueta: "Categoría predominante",
      valor: categoriaTop ? categoriaTop.clave : "—",
      detalle: categoriaTop ? `${categoriaTop.total} trabajo(s)` : "Sin datos en el período"
    },
    {
      icono:
        variacionTrabajos !== null && variacionTrabajos < 0 ? (
          <ArrowDownRight size={14} className="text-red-600" />
        ) : (
          <ArrowUpRight size={14} className="text-emerald-700" />
        ),
      etiqueta: "Trabajos vs. período anterior",
      valor: variacionTrabajos !== null ? `${variacionTrabajos >= 0 ? "+" : ""}${variacionTrabajos.toFixed(1)}%` : "—",
      detalle: variacionTrabajos !== null ? "Misma duración, período previo" : "Sin datos del período anterior"
    }
  ];

  return (
    <Card>
      <CardHeader className="!pb-0">
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles size={13} /> Análisis del laboratorio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <div key={it.etiqueta} className="rounded-lg border border-carbon/10 bg-cream px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-carbon/40 uppercase tracking-wide mb-1.5">
                {it.icono} {it.etiqueta}
              </p>
              <p className="font-display text-base text-carbon truncate" title={it.valor}>
                {it.valor}
              </p>
              {it.detalle && <p className="text-xs text-carbon/45 mt-0.5">{it.detalle}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Evolución
// ============================================================

function SeccionEvolucion({
  evolucion,
  monedasDisponibles,
  moneda,
  onChangeMoneda
}: {
  evolucion: { granularidad: "dia" | "mes"; puntos: Array<{ bucket: string; moneda: Moneda; cantidadTrabajos: number; facturadoCentavos: number; cobradoCentavos: number }> } | undefined;
  monedasDisponibles: Moneda[];
  moneda: Moneda;
  onChangeMoneda: (m: Moneda) => void;
}) {
  const granularidad = evolucion?.granularidad ?? "dia";

  const datosFinancieros = useMemo(() => {
    const puntos = (evolucion?.puntos ?? []).filter((p) => p.moneda === moneda);
    return puntos.map((p) => ({
      bucket: formatearBucket(p.bucket, granularidad),
      Facturado: p.facturadoCentavos,
      Cobrado: p.cobradoCentavos
    }));
  }, [evolucion, moneda, granularidad]);

  const datosTrabajos = useMemo(() => {
    const porBucket = new Map<string, number>();
    for (const p of evolucion?.puntos ?? []) {
      porBucket.set(p.bucket, (porBucket.get(p.bucket) ?? 0) + p.cantidadTrabajos);
    }
    return Array.from(porBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, cantidad]) => ({ bucket: formatearBucket(bucket, granularidad), Trabajos: cantidad }));
  }, [evolucion, granularidad]);

  return (
    <Card>
      <CardHeader className="!pb-0 flex items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>Evolución del período</CardTitle>
          <p className="text-[11px] text-carbon/35 mt-0.5">
            {granularidad === "dia" ? "Agrupado por día." : "Agrupado por mes."} Facturación y cobros en {moneda}.
          </p>
        </div>
        <TabsMoneda monedas={monedasDisponibles} activa={moneda} onChange={onChangeMoneda} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosFinancieros}>
                <CartesianGrid vertical={false} stroke="#0E0E1010" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={<TooltipEvolucion moneda={moneda} />} />
                <Bar dataKey="Facturado" fill={COLOR_FACTURADO} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cobrado" fill={COLOR_COBRADO} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64">
            <p className="text-[11px] text-carbon/40 mb-1 text-center">Trabajos realizados (todas las monedas)</p>
            <ResponsiveContainer width="100%" height="90%">
              <ComposedChart data={datosTrabajos}>
                <CartesianGrid vertical={false} stroke="#0E0E1010" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip content={<TooltipEvolucion moneda={moneda} />} />
                <Line type="monotone" dataKey="Trabajos" stroke="#C9A24B" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Ranking de odontólogos / clínicas
// ============================================================

type FilaRanking = RankingOdontologo | RankingClinica;
type OrdenRanking = "facturadoCentavos" | "cantidadTrabajos" | "saldoPendienteCentavos";

const OPCIONES_ORDEN_RANKING: Array<{ valor: OrdenRanking; etiqueta: string }> = [
  { valor: "facturadoCentavos", etiqueta: "Mayor facturación" },
  { valor: "cantidadTrabajos", etiqueta: "Más trabajos" },
  { valor: "saldoPendienteCentavos", etiqueta: "Mayor saldo pendiente" }
];

function RankingCard<F extends FilaRanking>({
  titulo,
  icono,
  filas,
  monedasDisponibles,
  moneda,
  onChangeMoneda,
  nombreDe,
  onVer
}: {
  titulo: string;
  icono: React.ReactNode;
  filas: F[] | undefined;
  monedasDisponibles: Moneda[];
  moneda: Moneda;
  onChangeMoneda: (m: Moneda) => void;
  nombreDe: (f: F) => string;
  onVer: (f: F) => void;
}) {
  const [ordenarPor, setOrdenarPor] = useState<OrdenRanking>("facturadoCentavos");

  const filtradasYOrdenadas = useMemo(() => {
    return (filas ?? [])
      .filter((f) => f.moneda === moneda)
      .slice()
      .sort((a, b) => b[ordenarPor] - a[ordenarPor])
      .slice(0, 8);
  }, [filas, moneda, ordenarPor]);

  const maximo = Math.max(1, ...filtradasYOrdenadas.map((f) => f[ordenarPor]));

  return (
    <Card>
      <CardHeader className="!pb-0 flex items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-1.5">
          {icono} {titulo}
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={ordenarPor}
            onChange={(e) => setOrdenarPor(e.target.value as OrdenRanking)}
            className="h-7 rounded-md border border-carbon/15 bg-cream-card px-2 text-[11px]"
          >
            {OPCIONES_ORDEN_RANKING.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
          <TabsMoneda monedas={monedasDisponibles} activa={moneda} onChange={onChangeMoneda} />
        </div>
      </CardHeader>
      <CardContent>
        {filtradasYOrdenadas.length === 0 ? (
          <p className="text-sm text-carbon/40">Sin actividad en {moneda} durante este período.</p>
        ) : (
          <div className="divide-y divide-carbon/8">
            {filtradasYOrdenadas.map((f, idx) => {
              const pct = Math.round((f[ordenarPor] / maximo) * 100);
              return (
                <button key={idx} onClick={() => onVer(f)} className="block w-full text-left py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-dim text-xs font-semibold">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-medium text-sm truncate">{nombreDe(f)}</p>
                        <p className="font-display text-sm tabular-nums shrink-0">
                          {formatearMoneda(f.facturadoCentavos, f.moneda)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-carbon/8 overflow-hidden">
                        <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-carbon/45">
                        <span>{f.cantidadTrabajos} trabajo(s)</span>
                        <span className="text-emerald-700">{formatearMoneda(f.cobradoCentavos, f.moneda)} cobrado</span>
                        {f.saldoPendienteCentavos > 0 && (
                          <span className="text-amber-700">{formatearMoneda(f.saldoPendienteCentavos, f.moneda)} pendiente</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Prestaciones
// ============================================================

function ListaPrestaciones({
  titulo,
  datos,
  ordenarPor,
  moneda
}: {
  titulo: string;
  datos: Array<{ prestacionNombre: string; cantidad: number; totalCentavos: number }>;
  ordenarPor: "cantidad" | "totalCentavos";
  moneda: Moneda;
}) {
  const top = useMemo(
    () =>
      datos
        .slice()
        .sort((a, b) => b[ordenarPor] - a[ordenarPor])
        .slice(0, 6),
    [datos, ordenarPor]
  );
  const maximo = Math.max(1, ...top.map((d) => d[ordenarPor]));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 mb-2 flex items-center gap-1.5">
        <Trophy size={12} /> {titulo}
      </p>
      {top.length === 0 ? (
        <p className="text-sm text-carbon/40">Sin prestaciones en {moneda} durante este período.</p>
      ) : (
        <div className="space-y-2.5">
          {top.map((p, idx) => {
            const pct = Math.round((p[ordenarPor] / maximo) * 100);
            return (
              <div key={idx}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{p.prestacionNombre}</span>
                  <span className="font-medium tabular-nums shrink-0">
                    {ordenarPor === "cantidad" ? p.cantidad : formatearMoneda(p.totalCentavos, moneda)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-carbon/8 overflow-hidden">
                  <div className="h-full bg-carbon rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
