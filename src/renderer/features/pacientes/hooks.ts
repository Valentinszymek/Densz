import { useQuery } from "@tanstack/react-query";
import type { FiltroPacientesDto } from "@shared/types/ipc-contracts";

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

// Nota (Bloque 1-B): esta sección es de solo consulta — crear, editar,
// activar/desactivar y eliminar pacientes desde acá se eliminó a
// propósito (esos hooks de mutación ya no tienen ninguna UI que los use).
// Los pacientes se crean automáticamente desde Nuevo Trabajo (ver
// ordenService.ts, que llama a crearPaciente() del repositorio directo,
// nunca pasa por el endpoint pacientesCrear). Los endpoints
// pacientesCrear/Actualizar/SetActivo/Eliminar siguen existiendo en el
// backend (no se tocaron) y en window.densz (webApi.ts) — no son parte
// del alcance de este cambio, solo dejaron de tener hook/UI en Pacientes.

export function useCantidadTrabajosPaciente(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "cantidad-trabajos", id],
    queryFn: () => window.densz.pacientesCantidadTrabajos(id!),
    enabled: id !== undefined
  });
}
