import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosClinicaDto, FiltroClinicasDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "clinicas";

export function useClinicas(filtro: FiltroClinicasDto = {}) {
  return useQuery({
    queryKey: [CLAVE, "lista", filtro],
    queryFn: () => window.densz.clinicasListar(filtro)
  });
}

export function useClinica(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "detalle", id],
    queryFn: () => window.densz.clinicasObtener(id!),
    enabled: id !== undefined
  });
}

export function useEstadisticasClinica(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "estadisticas", id],
    queryFn: () => window.densz.clinicasEstadisticas(id!),
    enabled: id !== undefined
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

export function useCrearClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosClinicaDto) => window.densz.clinicasCrear(data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Clínica creada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo crear", descripcion: String(err), tono: "error" })
  });
}

export function useActualizarClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosClinicaDto }) => window.densz.clinicasActualizar(id, data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Clínica actualizada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}

export function useSetActivaClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.clinicasSetActiva(id, activo),
    onSuccess: (_d, vars) => {
      invalidar(qc);
      toast({ titulo: vars.activo ? "Clínica activada" : "Clínica desactivada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}

export function useUsoClinica(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "uso", id],
    queryFn: () => window.densz.clinicasUso(id!),
    enabled: id !== undefined
  });
}

export function useEliminarClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.clinicasEliminar(id),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Clínica eliminada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo eliminar", descripcion: String(err), tono: "error" })
  });
}
