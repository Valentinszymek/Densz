import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DatosNuevaDeudaDto, DatosEditarDeudaDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

// Una deuda agregada a mano (o su anulación) afecta el saldo de un
// odontólogo o de una clínica — mismo criterio que features/pagos/hooks.ts:
// más simple y seguro invalidar todo el árbol "cuentas" que acertar la
// clave exacta en cada caso.
function invalidarCuenta(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cuentas"] });
  qc.invalidateQueries({ queryKey: ["system-status"] });
}

export function useRegistrarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosNuevaDeudaDto) => window.densz.deudasRegistrar(data),
    onSuccess: () => {
      invalidarCuenta(qc);
      toast({ titulo: "Deuda agregada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo agregar la deuda", descripcion: String(e), tono: "error" })
  });
}

export function useEditarDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosEditarDeudaDto }) => window.densz.deudasEditar(id, data),
    onSuccess: () => {
      invalidarCuenta(qc);
      toast({ titulo: "Deuda actualizada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo editar", descripcion: String(e), tono: "error" })
  });
}

export function useAnularDeuda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => window.densz.deudasAnular(id, motivo),
    onSuccess: () => {
      invalidarCuenta(qc);
      toast({ titulo: "Deuda anulada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo anular", descripcion: String(e), tono: "error" })
  });
}
