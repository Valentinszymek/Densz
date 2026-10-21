import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";
import type { Moneda } from "@shared/types/entities";

const CLAVE = "billing";

export function useBillingEstado() {
  return useQuery({ queryKey: [CLAVE, "estado"], queryFn: () => window.densz.billingEstado() });
}

/** En la web, redirige la pestaña a la URL de checkout que devuelve el
 * backend. En escritorio, `billingCheckout` ya abrió el navegador del
 * sistema del lado del proceso main y no devuelve URL — no hay nada más
 * que hacer acá en ese caso. */
export function useBillingCheckout() {
  return useMutation({
    mutationFn: ({ plan, moneda }: { plan: "essential" | "professional"; moneda: Moneda }) =>
      window.densz.billingCheckout(plan, moneda),
    onSuccess: (resultado) => {
      if (resultado && "url" in resultado && resultado.url) {
        window.location.href = resultado.url;
      }
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo iniciar el pago", descripcion: String(e), tono: "error" })
  });
}

export function useBillingCancelar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.densz.billingCancelar(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE] });
      toast({ titulo: "Suscripción cancelada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo cancelar", descripcion: String(e), tono: "error" })
  });
}
