import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Ban, Stethoscope, User, Calendar, Receipt, FileText, Printer, Trash2, Building2, Pencil } from "lucide-react";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useOrden } from "../../features/ordenes/hooks";
import {
  useComprobantePorOrden,
  useGenerarComprobante,
  useVerPdfComprobante,
  useImprimirComprobante
} from "../../features/comprobantes/hooks";
import { formatearMoneda, formatearFecha } from "../../lib/format";
import { esAdministrador } from "../../store/authStore";
import { AnularOrdenModal } from "./AnularOrdenModal";
import { EliminarOrdenModal } from "./EliminarOrdenModal";
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

export default function OrdenDetalle() {
  const navigate = useNavigate();
  const { id } = useParams();
  const idNum = Number(id);
  const { data: orden, isLoading } = useOrden(idNum);
  const { data: comprobante } = useComprobantePorOrden(orden?.id);
  const generarComprobante = useGenerarComprobante();
  const verPdf = useVerPdfComprobante();
  const imprimir = useImprimirComprobante();
  const [anulando, setAnulando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  if (isLoading) return <p className="text-carbon/40 text-sm">Cargando…</p>;
  if (!orden) return <p className="text-carbon/40 text-sm">Orden no encontrada.</p>;

  return (
    <div className="max-w-3xl">
      <Link to="/trabajos" className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4">
        <ArrowLeft size={15} /> Trabajos
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-carbon font-mono">{orden.numero}</h1>
            <Badge tono={ESTADO_TONO[orden.estado]}>{ESTADO_LABEL[orden.estado]}</Badge>
            <Badge tono={orden.moneda === "USD" ? "gold" : "neutral"}>{orden.moneda}</Badge>
          </div>
          <p className="text-sm text-carbon/50 mt-1">
            {orden.prestaciones.length === 1 ? "1 prestación" : `${orden.prestaciones.length} prestaciones`} · Lista: {orden.listaPrecioNombre}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {orden.estado === "pendiente_facturar" && (
            <Button size="sm" onClick={() => generarComprobante.mutate(orden.id)} disabled={generarComprobante.isPending}>
              <Receipt size={14} /> {generarComprobante.isPending ? "Generando…" : "Generar comprobante"}
            </Button>
          )}
          {comprobante && !comprobante.anulado && (
            <>
              <Button variant="secondary" size="sm" onClick={() => verPdf.mutate(comprobante.id)}>
                <FileText size={14} /> Ver PDF ({comprobante.numero})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => imprimir.mutate(comprobante.id)}
                disabled={imprimir.isPending}
              >
                <Printer size={14} /> {imprimir.isPending ? "Imprimiendo…" : "Imprimir"}
              </Button>
            </>
          )}
          {orden.estado !== "anulado" && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/trabajos/${orden.id}/editar`)}>
              <Pencil size={14} /> Editar OT
            </Button>
          )}
          {orden.estado !== "anulado" && (
            <Button variant="secondary" size="sm" onClick={() => setAnulando(true)}>
              <Ban size={14} /> Anular
            </Button>
          )}
          {esAdministrador() && (
            <Button variant="destructive" size="sm" onClick={() => setEliminando(true)}>
              <Trash2 size={14} /> Eliminar OT
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {orden.clinicaNombre && (
              <div className="flex items-center gap-2 col-span-2">
                <Building2 size={15} className="text-gold-dim" />
                <span>
                  <strong>{orden.clinicaNombre}</strong>{" "}
                  <span className="text-carbon/40">— profesional: {orden.odontologoNombre}</span>
                </span>
              </div>
            )}
            {!orden.clinicaNombre && (
              <div className="flex items-center gap-2">
                <Stethoscope size={15} className="text-gold-dim" />
                <span>{orden.odontologoNombre ?? "—"}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <User size={15} className="text-gold-dim" />
              <span>{orden.pacienteNombreCompleto ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-gold-dim" />
              <span>{formatearFecha(orden.fechaTrabajo)}</span>
            </div>
          </div>

          <div className="border-t border-carbon/10 pt-4 space-y-3">
            {orden.prestaciones.map((p) => (
              <div key={p.id} className="rounded-lg border border-carbon/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{p.prestacionNombre}</p>
                    <p className="text-xs text-carbon/40">{p.categoriaNombre}</p>
                  </div>
                  {p.origenPrecio === "manual" && <Badge tono="gold">Precio manual</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.piezasFdi.length === 0 && <span className="text-xs text-carbon/35">Sin piezas</span>}
                  {p.piezasFdi.map((pieza) => (
                    <span key={pieza} className="inline-flex items-center rounded-full bg-gold/15 text-gold-dim text-xs font-medium px-2 py-0.5">
                      {pieza}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mt-3">
                  <div>
                    <p className="text-carbon/40 text-xs mb-0.5">Cantidad</p>
                    <p className="font-medium">{p.cantidad}</p>
                  </div>
                  <div>
                    <p className="text-carbon/40 text-xs mb-0.5">Precio unitario</p>
                    <p className="font-medium">{formatearMoneda(p.precioUnitarioCentavos, orden.moneda)}</p>
                  </div>
                  <div>
                    <p className="text-carbon/40 text-xs mb-0.5">Subtotal</p>
                    <p className="font-semibold">{formatearMoneda(p.subtotalCentavos, orden.moneda)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-carbon text-cream px-5 py-4">
            <span className="text-sm text-cream/60">Total</span>
            <span className="text-2xl font-display text-gold">{formatearMoneda(orden.totalCentavos, orden.moneda)}</span>
          </div>

          {orden.estado === "anulado" && orden.motivoAnulacion && (
            <div className="rounded-lg bg-red-600/5 border border-red-600/15 px-4 py-3 text-sm text-red-700">
              <strong>Motivo de anulación:</strong> {orden.motivoAnulacion}
            </div>
          )}
        </CardContent>
      </Card>

      <AnularOrdenModal open={anulando} onOpenChange={setAnulando} ordenId={orden.id} />
      <EliminarOrdenModal open={eliminando} onOpenChange={setEliminando} ordenId={orden.id} ordenNumero={orden.numero} />
    </div>
  );
}
