import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";

const CLAVE = "comprobantes";

export function useComprobantePorOrden(ordenId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "por-orden", ordenId],
    queryFn: () => window.densz.comprobantesObtenerPorOrden(ordenId!),
    enabled: ordenId !== undefined
  });
}

export function useComprobantes(filtro: { odontologoId?: number; clinicaId?: number; busqueda?: string; limite?: number } = {}) {
  return useQuery({ queryKey: [CLAVE, "lista", filtro], queryFn: () => window.densz.comprobantesListar(filtro) });
}

export function useGenerarComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordenId: number) => window.densz.comprobantesGenerar(ordenId),
    onSuccess: (comprobante) => {
      qc.invalidateQueries({ queryKey: [CLAVE] });
      qc.invalidateQueries({ queryKey: ["ordenes"] });
      qc.invalidateQueries({ queryKey: ["cuentas"] });
      qc.invalidateQueries({ queryKey: ["system-status"] });
      // Corrección (Bloque 1-A): el trabajo y el comprobante pueden quedar
      // guardados y facturados correctamente aunque el PDF en sí no se
      // haya podido generar (ver comprobanteService.generarComprobante) —
      // `pdfPath` en null es la señal real de ese caso. Nunca se muestra
      // como si la operación entera hubiera fallado, pero tampoco como un
      // éxito completo: es un estado intermedio real, con una acción clara.
      if (comprobante.pdfPath) {
        toast({ titulo: "Comprobante generado", descripcion: comprobante.numero, tono: "exito" });
      } else {
        toast({
          titulo: `Comprobante ${comprobante.numero} guardado`,
          descripcion: 'El trabajo quedó facturado, pero el PDF no se pudo generar todavía. Probá de nuevo desde "Ver PDF".',
          tono: "info"
        });
      }
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo generar el comprobante", descripcion: String(e), tono: "error" })
  });
}

export function useVerPdfComprobante() {
  return useMutation({
    mutationFn: (comprobanteId: number) => window.densz.comprobantesVerPdf(comprobanteId),
    onError: (e: unknown) => toast({ titulo: "No se pudo abrir el PDF", descripcion: String(e), tono: "error" })
  });
}

export function useImprimirComprobante() {
  return useMutation({
    mutationFn: (comprobanteId: number) => window.densz.comprobantesImprimir(comprobanteId),
    // Mensaje neutral a propósito: en Desktop ya se mandó de verdad, en
    // silencio, a la impresora elegida; en Web se abrió el PDF con el
    // diálogo de impresión del navegador ya disparado, pendiente de que la
    // persona lo confirme ahí — "listo para imprimir" es honesto en los dos casos.
    onSuccess: () => toast({ titulo: "Comprobante listo para imprimir", tono: "exito" }),
    onError: (e: unknown) => toast({ titulo: "No se pudo imprimir", descripcion: String(e), tono: "error" })
  });
}
