import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/toastStore";

/** Usuarios activos para el selector de "¿Quién va a utilizar Densz?" —
 * se pide antes de autenticarse, así que nunca trae datos sensibles (ver
 * UsuarioParaSeleccion). Se resuelve dinámicamente desde la base: nada
 * hardcodeado acá ni en el componente que lo consume. */
export function useUsuariosDisponibles() {
  return useQuery({
    queryKey: ["auth", "usuariosDisponibles"],
    queryFn: () => window.densz.authUsuariosDisponibles()
  });
}

export function useLogin() {
  const setSesion = useAuthStore((s) => s.setSesion);
  return useMutation({
    mutationFn: ({ nombreUsuario, password }: { nombreUsuario: string; password: string }) =>
      window.densz.authLogin(nombreUsuario, password),
    onSuccess: (sesion) => setSesion(sesion)
  });
}

export function useLogout() {
  const setSesion = useAuthStore((s) => s.setSesion);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => window.densz.authLogout(),
    onSuccess: () => {
      setSesion(null);
      qc.clear();
      toast({ titulo: "Sesión cerrada", tono: "info" });
    }
  });
}
