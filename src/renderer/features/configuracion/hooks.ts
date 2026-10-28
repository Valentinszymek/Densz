import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";
import type { TamanoImpresionComprobante } from "../../../shared/types/entities";

const CLAVE = "configuracion";

export function useLaboratorioNombre() {
  return useQuery({ queryKey: [CLAVE, "laboratorio-nombre"], queryFn: () => window.densz.configLaboratorioObtener() });
}

export function useGuardarLaboratorioNombre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => window.densz.configLaboratorioGuardar(nombre),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE] });
      toast({ titulo: "Identidad del laboratorio guardada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo guardar", descripcion: String(e), tono: "error" })
  });
}

export function useTamanoImpresionComprobante() {
  return useQuery({
    queryKey: [CLAVE, "tamano-impresion-comprobante"],
    queryFn: () => window.densz.configTamanoImpresionObtener()
  });
}

export function useGuardarTamanoImpresionComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (valor: TamanoImpresionComprobante) => window.densz.configTamanoImpresionGuardar(valor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE] });
      toast({ titulo: "Tamaño de impresión guardado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo guardar", descripcion: String(e), tono: "error" })
  });
}
