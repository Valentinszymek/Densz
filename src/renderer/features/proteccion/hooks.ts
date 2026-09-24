import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";
import type {
  DatosActivarProteccionDto,
  DatosCambiarPasswordProteccionDto,
  DatosRestablecerProteccionDto
} from "@shared/types/ipc-contracts";

const CLAVE = "proteccion";

export function useEstadoProteccion() {
  return useQuery({ queryKey: [CLAVE, "estado"], queryFn: () => window.densz.proteccionEstado() });
}

function invalidarEstado(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

// A propósito NO existe un hook tipo "useEstaDesbloqueada" que consulte un
// estado de sesión: el desbloqueo de Cuentas/Estadísticas es puramente
// local al `<ProteccionGuard>` mientras esa sección sigue montada en
// pantalla (§ la autorización no debe persistir ni cachearse en ningún
// lado) — ver `ProteccionGuard.tsx`.

export function useDesbloquear() {
  return useMutation({
    mutationFn: (password: string) => window.densz.proteccionDesbloquear(password)
  });
}

/** Vuelve a exigir la contraseña — lo llama `ProteccionGuard` cada vez
 * que se sale de Cuentas/Estadísticas (navegación afuera, cambio entre
 * las dos, "Atrás", recarga). */
export function useBloquearProteccion() {
  return useMutation({
    mutationFn: () => window.densz.proteccionBloquear()
  });
}

export function useActivarProteccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosActivarProteccionDto) => window.densz.proteccionActivar(data),
    onSuccess: () => {
      invalidarEstado(qc);
      toast({ titulo: "Protección activada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo activar la protección", descripcion: String(e), tono: "error" })
  });
}

export function useDesactivarProteccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (passwordActual: string) => window.densz.proteccionDesactivar(passwordActual),
    onSuccess: () => {
      invalidarEstado(qc);
      toast({ titulo: "Protección desactivada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo desactivar la protección", descripcion: String(e), tono: "error" })
  });
}

export function useCambiarPasswordProteccion() {
  return useMutation({
    mutationFn: (data: DatosCambiarPasswordProteccionDto) => window.densz.proteccionCambiarPassword(data),
    onSuccess: () => toast({ titulo: "Contraseña actualizada", tono: "exito" }),
    onError: (e: unknown) => toast({ titulo: "No se pudo cambiar la contraseña", descripcion: String(e), tono: "error" })
  });
}

export function useGenerarCodigoProteccion() {
  return useMutation({
    mutationFn: () => window.densz.proteccionGenerarCodigo(),
    onError: (e: unknown) =>
      toast({ titulo: "No se pudo generar el código de recuperación", descripcion: String(e), tono: "error" })
  });
}

export function useVerificarCodigoRecuperacion() {
  return useMutation({
    mutationFn: (codigo: string) => window.densz.proteccionVerificarCodigo(codigo)
  });
}

export function useRestablecerConCodigo() {
  return useMutation({
    mutationFn: (data: DatosRestablecerProteccionDto) => window.densz.proteccionRestablecerConCodigo(data)
  });
}
