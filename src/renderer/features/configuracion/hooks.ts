import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";

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
