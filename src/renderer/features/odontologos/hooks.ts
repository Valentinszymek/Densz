import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosOdontologoDto, FiltroOdontologosDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "odontologos";

export function useOdontologos(filtro: FiltroOdontologosDto = {}) {
  return useQuery({
    queryKey: [CLAVE, "lista", filtro],
    queryFn: () => window.densz.odontologosListar(filtro)
  });
}

export function useOdontologo(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "detalle", id],
    queryFn: () => window.densz.odontologosObtener(id!),
    enabled: id !== undefined
  });
}

export function useEstadisticasOdontologo(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "estadisticas", id],
    queryFn: () => window.densz.odontologosEstadisticas(id!),
    enabled: id !== undefined
  });
}

export function useUltimaActividadOdontologos() {
  return useQuery({
    queryKey: [CLAVE, "ultima-actividad"],
    queryFn: () => window.densz.odontologosUltimaActividad()
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

export function useCrearOdontologo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosOdontologoDto) => window.densz.odontologosCrear(data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Odontólogo creado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo crear", descripcion: String(err), tono: "error" })
  });
}

export function useActualizarOdontologo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosOdontologoDto }) =>
      window.densz.odontologosActualizar(id, data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Odontólogo actualizado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}

export function useAsignarListaOdontologo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, listaPrecioId }: { id: number; listaPrecioId: number }) =>
      window.densz.odontologosAsignarLista(id, listaPrecioId),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Lista de precios actualizada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo cambiar la lista", descripcion: String(err), tono: "error" })
  });
}

export function useAsignarClinicaOdontologo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, clinicaId }: { id: number; clinicaId: number | null }) =>
      window.densz.odontologosAsignarClinica(id, clinicaId),
    onSuccess: () => {
      invalidar(qc);
      qc.invalidateQueries({ queryKey: ["clinicas"] });
      toast({ titulo: "Clínica actualizada", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo cambiar la clínica", descripcion: String(err), tono: "error" })
  });
}

export function useSetActivoOdontologo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.odontologosSetActivo(id, activo),
    onSuccess: (_d, vars) => {
      invalidar(qc);
      toast({ titulo: vars.activo ? "Odontólogo activado" : "Odontólogo desactivado", tono: "exito" });
    },
    onError: (err: unknown) => toast({ titulo: "No se pudo actualizar", descripcion: String(err), tono: "error" })
  });
}
