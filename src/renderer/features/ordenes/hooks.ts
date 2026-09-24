import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosCrearOrdenDto, DatosEditarOrdenDto, FiltroOrdenesDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "ordenes";

export function useOrdenes(filtro: FiltroOrdenesDto = {}) {
  return useQuery({ queryKey: [CLAVE, "lista", filtro], queryFn: () => window.densz.ordenesListar(filtro) });
}

export function useOrden(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "detalle", id],
    queryFn: () => window.densz.ordenesObtener(id!),
    enabled: id !== undefined
  });
}

function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
  qc.invalidateQueries({ queryKey: ["cuentas"] });
  qc.invalidateQueries({ queryKey: ["system-status"] });
  // Crear una OT crea (o puede afectar) un paciente nuevo — sin esto, la
  // lista de Pacientes quedaba con datos viejos hasta recargar la app.
  qc.invalidateQueries({ queryKey: ["pacientes"] });
  // El listado de Odontólogos se ordena por fecha del último trabajo —
  // sin esto, quedaba desactualizado hasta recargar la app.
  qc.invalidateQueries({ queryKey: ["odontologos"] });
}

export function useCrearOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosCrearOrdenDto) => window.densz.ordenesCrear(data),
    onSuccess: (orden) => {
      invalidarTodo(qc);
      toast({ titulo: "Trabajo guardado", descripcion: `Orden ${orden.numero}`, tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo guardar el trabajo", descripcion: String(e), tono: "error" })
  });
}

export function useEditarOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosEditarOrdenDto }) => window.densz.ordenesEditar(id, data),
    onSuccess: (orden) => {
      invalidarTodo(qc);
      // El comprobante (si tenía) se regeneró con los datos nuevos — su
      // consulta también queda vieja en caché hasta invalidarla.
      qc.invalidateQueries({ queryKey: ["comprobantes"] });
      toast({ titulo: "OT actualizada", descripcion: `Orden ${orden.numero}`, tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo guardar la edición", descripcion: String(e), tono: "error" })
  });
}

export function useAnularOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => window.densz.ordenesAnular(id, motivo),
    onSuccess: () => {
      invalidarTodo(qc);
      toast({ titulo: "Orden anulada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo anular", descripcion: String(e), tono: "error" })
  });
}

export function useEliminarOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => window.densz.ordenesEliminar(id, motivo),
    onSuccess: () => {
      invalidarTodo(qc);
      toast({ titulo: "OT eliminada definitivamente", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo eliminar", descripcion: String(e), tono: "error" })
  });
}
