import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useBillingEstado, useBillingCheckout, useBillingCancelar } from "../../features/billing/hooks";
import { PLANES_COMERCIALES, type PlanId } from "../../../shared/constants/planes";
import { monedaPorDefecto } from "../../lib/moneda";
import { trialVigente } from "../../../shared/utils/suscripcion";
import { toast } from "../../store/toastStore";
import type { Moneda } from "@shared/types/entities";

const ETIQUETA_PLAN: Record<string, string> = {
  trial: "Prueba gratis",
  essential: "Densz Essential",
  professional: "Densz Professional"
};

function badgeEstado(estadoSuscripcion: string, trialTerminaEn: string | null, exento: boolean) {
  if (exento) return <Badge tono="exito">Acceso sin cargo</Badge>;
  if (estadoSuscripcion === "active") return <Badge tono="exito">Activa</Badge>;
  if (estadoSuscripcion === "trialing") {
    return trialVigente(trialTerminaEn) ? <Badge tono="gold">En prueba</Badge> : <Badge tono="error">Prueba vencida</Badge>;
  }
  if (estadoSuscripcion === "past_due") return <Badge tono="error">Pago pendiente</Badge>;
  return <Badge tono="error">Cancelada</Badge>;
}

function diasRestantes(trialTerminaEn: string): number {
  const fin = new Date(trialTerminaEn.replace(" ", "T") + "Z").getTime();
  return Math.max(0, Math.ceil((fin - Date.now()) / (1000 * 60 * 60 * 24)));
}

function formatearPrecio(valor: number, moneda: Moneda): string {
  return moneda === "ARS" ? `$${valor.toLocaleString("es-AR")}` : `US$${valor.toLocaleString("en-US")}`;
}

/** Suscripción del laboratorio — solo ADMINISTRADOR la ve (ver
 * Configuracion/index.tsx). Cubre los tres casos reales: exento (Dental
 * Szymek), sin suscripción activa (elegir plan), y suscripción activa
 * (cambiar de plan / cancelar). */
export function SeccionSuscripcion() {
  const { data: info, isLoading } = useBillingEstado();
  const checkout = useBillingCheckout();
  const cancelar = useBillingCancelar();
  const [moneda, setMoneda] = useState<Moneda>(monedaPorDefecto);
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  // Vuelta del checkout (Mercado Pago/Stripe) — ver billingService.ts
  // (success_url/cancel_url/back_url). El webhook es quien de verdad
  // activa la suscripción (puede tardar unos segundos); acá solo se
  // refresca el estado y se avisa con un mensaje claro — nunca se asume
  // éxito solo por haber vuelto de la pasarela.
  useEffect(() => {
    const resultado = searchParams.get("suscripcion");
    if (!resultado) return;
    if (resultado === "exito" || resultado === "mp") {
      toast({ titulo: "¡Gracias!", descripcion: "Estamos confirmando tu pago — en unos segundos se activa tu plan.", tono: "exito" });
      qc.invalidateQueries({ queryKey: ["billing"] });
    } else if (resultado === "cancelado") {
      toast({ titulo: "Pago cancelado", descripcion: "No se completó la suscripción.", tono: "info" });
    }
    searchParams.delete("suscripcion");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard size={16} /> Suscripción
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-carbon/40">Cargando…</p>
        </CardContent>
      </Card>
    );
  }

  if (!info) return null;

  const suscripcionActivaAhora = info.estadoSuscripcion === "active" && !info.exentoFacturacion;
  const mostrarPlanes = !info.exentoFacturacion;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard size={16} /> Suscripción
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-carbon">{ETIQUETA_PLAN[info.plan] ?? info.plan}</span>
          {badgeEstado(info.estadoSuscripcion, info.trialTerminaEn, info.exentoFacturacion)}
        </div>

        {!info.exentoFacturacion && info.estadoSuscripcion === "trialing" && info.trialTerminaEn && (
          <p className="text-sm text-carbon/60 flex items-center gap-1.5">
            {trialVigente(info.trialTerminaEn) ? (
              <>
                <AlertTriangle size={14} className="text-gold-dim" />
                Quedan {diasRestantes(info.trialTerminaEn)} días de prueba gratis.
              </>
            ) : (
              <>
                <XCircle size={14} className="text-red-500" />
                Tu período de prueba terminó — elegí un plan para seguir usando Densz.
              </>
            )}
          </p>
        )}

        {info.exentoFacturacion && (
          <p className="text-sm text-carbon/50 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-green-600" /> Este laboratorio tiene acceso sin cargo.
          </p>
        )}

        {mostrarPlanes && (
          <div className="space-y-3 pt-2 border-t border-carbon/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-carbon">{suscripcionActivaAhora ? "Cambiar de plan" : "Elegí un plan"}</p>
              <div className="inline-flex rounded-lg border border-carbon/15 p-0.5 text-xs">
                {(["ARS", "USD"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMoneda(m)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      moneda === m ? "bg-gold text-carbon font-medium" : "text-carbon/50 hover:text-carbon/80"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLANES_COMERCIALES.map((plan) => {
                const esElActual = suscripcionActivaAhora && info.plan === plan.id;
                return (
                  <div key={plan.id} className="rounded-lg border border-carbon/10 px-4 py-3 flex flex-col gap-2">
                    <div>
                      <p className="text-sm font-medium text-carbon">{plan.nombre}</p>
                      <p className="text-sm text-carbon/60">
                        {formatearPrecio(moneda === "ARS" ? plan.precioArs : plan.precioUsd, moneda)}
                        <span className="text-carbon/35"> /mes</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={esElActual ? "secondary" : "primary"}
                      disabled={esElActual || checkout.isPending}
                      onClick={() => checkout.mutate({ plan: plan.id as PlanId, moneda })}
                    >
                      {esElActual ? "Plan actual" : checkout.isPending ? "Redirigiendo…" : "Suscribirme"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {suscripcionActivaAhora && (
          <div className="pt-2 border-t border-carbon/10">
            {!confirmandoCancelacion ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirmandoCancelacion(true)}>
                Cancelar suscripción
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-carbon/60">¿Seguro? Vas a perder el acceso a las funciones pagas.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={cancelar.isPending}
                  onClick={() => {
                    cancelar.mutate();
                    setConfirmandoCancelacion(false);
                  }}
                >
                  Sí, cancelar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmandoCancelacion(false)}>
                  No
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
