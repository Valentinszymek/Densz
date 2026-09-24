import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosUsuarioDto, DatosUsuarioCrearDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "usuarios";

export function useUsuarios() {
  return useQuery({ queryKey: [CLAVE], queryFn: () => window.densz.usuariosListar() });
}

export function useRoles() {
  return useQuery({ queryKey: [CLAVE, "roles"], queryFn: () => window.densz.usuariosListarRoles() });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, password }: { data: DatosUsuarioCrearDto; password: string }) =>
      window.densz.usuariosCrear(data, password),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Usuario creado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo crear", descripcion: String(e), tono: "error" })
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosUsuarioDto }) => window.densz.usuariosActualizar(id, data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Usuario actualizado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(e), tono: "error" })
  });
}

export function useCambiarPasswordUsuario() {
  return useMutation({
    mutationFn: ({ id, nuevaPassword }: { id: number; nuevaPassword: string }) =>
      window.densz.usuariosCambiarPassword(id, nuevaPassword),
    onSuccess: () => toast({ titulo: "Contraseña actualizada", tono: "exito" }),
    onError: (e: unknown) => toast({ titulo: "No se pudo cambiar la contraseña", descripcion: String(e), tono: "error" })
  });
}

export function useSetActivoUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.usuariosSetActivo(id, activo),
    onSuccess: () => invalidar(qc),
    onError: (e: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(e), tono: "error" })
  });
}

export function useEliminarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.usuariosEliminar(id),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Usuario eliminado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo eliminar", descripcion: String(e), tono: "error" })
  });
}
