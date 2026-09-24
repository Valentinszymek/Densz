import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosNuevoPagoDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "pagos";

export function usePagos(odontologoId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "odontologo", odontologoId],
    queryFn: () => window.densz.pagosListar(odontologoId!),
    enabled: odontologoId !== undefined
  });
}

export function usePagosClinica(clinicaId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "clinica", clinicaId],
    queryFn: () => window.densz.pagosListarClinica(clinicaId!),
    enabled: clinicaId !== undefined
  });
}

export function usePagosUltimos(limite = 5) {
  return useQuery({ queryKey: [CLAVE, "ultimos", limite], queryFn: () => window.densz.pagosListarUltimos(limite) });
}

export function useMediosPago() {
  return useQuery({ queryKey: [CLAVE, "medios"], queryFn: () => window.densz.mediosPagoListar() });
}

// Un pago (o su anulación) puede afectar el saldo de un odontólogo o de
// una clínica — más simple y seguro invalidar todo el árbol "cuentas" y
// "pagos" que tratar de acertar la clave exacta en cada caso.
function invalidarCuenta(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
  qc.invalidateQueries({ queryKey: ["cuentas"] });
  qc.invalidateQueries({ queryKey: ["system-status"] });
}

export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, confirmarDuplicado }: { data: DatosNuevoPagoDto; confirmarDuplicado?: boolean }) =>
      window.densz.pagosRegistrar(data, confirmarDuplicado),
    onSuccess: (resultado) => {
      if (resultado.creado) {
        invalidarCuenta(qc);
        toast({ titulo: "Pago registrado", tono: "exito" });
      }
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo registrar el pago", descripcion: String(e), tono: "error" })
  });
}

export function useAnularPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => window.densz.pagosAnular(id, motivo),
    onSuccess: () => {
      invalidarCuenta(qc);
      toast({ titulo: "Pago anulado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo anular", descripcion: String(e), tono: "error" })
  });
}
