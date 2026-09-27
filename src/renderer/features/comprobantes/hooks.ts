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
      toast({ titulo: "Comprobante generado", descripcion: comprobante.numero, tono: "exito" });
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
    onSuccess: () => toast({ titulo: "Enviado a la impresora", tono: "exito" }),
    onError: (e: unknown) => {
      // En Web, comprobantesImprimir todavía no tiene equivalente (es
      // impresión silenciosa, exclusiva de Electron) — en vez del error
      // técnico crudo, se explica en criollo. En Desktop esta función
      // funciona de verdad y nunca cae en esta rama.
      if (String(e).includes("no está conectado en la versión web")) {
        toast({
          titulo: "La impresión directa está disponible únicamente en Densz Desktop.",
          descripcion: "Desde la Web podés abrir o descargar el PDF e imprimirlo desde el navegador.",
          tono: "info"
        });
        return;
      }
      toast({ titulo: "No se pudo imprimir", descripcion: String(e), tono: "error" });
    }
  });
}
