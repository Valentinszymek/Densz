import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosPacienteDto, FiltroPacientesDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "pacientes";

export function usePacientes(filtro: FiltroPacientesDto = {}) {
  return useQuery({
    queryKey: [CLAVE, "lista", filtro],
    queryFn: () => window.densz.pacientesListar(filtro)
  });
}

export function usePaciente(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "detalle", id],
    queryFn: () => window.densz.pacientesObtener(id!),
    enabled: id !== undefined
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

export function useCrearPaciente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosPacienteDto) => window.densz.pacientesCrear(data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Paciente creado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo crear", descripcion: String(err), tono: "error" })
  });
}

export function useActualizarPaciente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosPacienteDto }) =>
      window.densz.pacientesActualizar(id, data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Paciente actualizado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}

export function useSetActivoPaciente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.pacientesSetActivo(id, activo),
    onSuccess: (_d, vars) => {
      invalidar(qc);
      toast({ titulo: vars.activo ? "Paciente activado" : "Paciente desactivado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}

export function useCantidadTrabajosPaciente(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "cantidad-trabajos", id],
    queryFn: () => window.densz.pacientesCantidadTrabajos(id!),
    enabled: id !== undefined
  });
}

export function useEliminarPaciente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.pacientesEliminar(id),
    onSuccess: (resultado) => {
      invalidar(qc);
      if (resultado.eliminadoFisicamente) {
        toast({ titulo: "Paciente eliminado", tono: "exito" });
      } else {
        toast({
          titulo: "Paciente marcado como inactivo",
          descripcion: `Tenía ${resultado.cantidadTrabajos} trabajo(s) histórico(s) asociado(s), así que no se pudo eliminar sin perder esos registros.`,
          tono: "exito"
        });
      }
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo eliminar", descripcion: String(err), tono: "error" })
  });
}
