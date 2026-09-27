import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";

const CLAVE = "impresora";

export function useImpresorasDisponibles() {
  // retry: false — en Web esta función no existe (es exclusiva de Electron/Windows)
  // y siempre va a fallar de la misma forma, así que reintentar no sirve de nada
  // y solo demora que se muestre el aviso de "no disponible en Web".
  return useQuery({ queryKey: [CLAVE, "disponibles"], queryFn: () => window.densz.impresoraListar(), retry: false });
}

export function useImpresoraSeleccionada() {
  return useQuery({ queryKey: [CLAVE, "seleccionada"], queryFn: () => window.densz.impresoraObtenerSeleccionada() });
}

export function useSeleccionarImpresora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nombreDispositivo, nombreVisible }: { nombreDispositivo: string; nombreVisible: string }) =>
      window.densz.impresoraSeleccionar(nombreDispositivo, nombreVisible),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE] });
      toast({ titulo: "Impresora predeterminada guardada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo guardar la impresora", descripcion: String(e), tono: "error" })
  });
}

export function useImprimirPaginaDePrueba() {
  return useMutation({
    mutationFn: (nombreDispositivo: string) => window.densz.impresoraPrueba(nombreDispositivo),
    onSuccess: () => toast({ titulo: "Página de prueba enviada", tono: "exito" }),
    onError: (e: unknown) => toast({ titulo: "No se pudo imprimir la página de prueba", descripcion: String(e), tono: "error" })
  });
}
