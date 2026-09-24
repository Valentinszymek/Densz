import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../store/toastStore";
import type { PeriodoMesDto } from "@shared/types/ipc-contracts";

const CLAVE = "cuentas";

export function useSaldosTodos() {
  return useQuery({ queryKey: [CLAVE, "saldos-todos"], queryFn: () => window.densz.cuentasListarSaldos() });
}

export function useSaldosTodosClinicas() {
  return useQuery({ queryKey: [CLAVE, "saldos-todos-clinicas"], queryFn: () => window.densz.cuentasListarSaldosClinicas() });
}

/** Solo un booleano — nunca un importe — y a propósito NUNCA queda detrás
 * de la protección por contraseña de Cuentas: lo usa Nuevo Trabajo para
 * advertir al editar una OT facturada (§5), que no es "entrar a Cuentas". */
export function useTienePagos(titular: { odontologoId?: number | null; clinicaId?: number | null } | undefined) {
  return useQuery({
    queryKey: [CLAVE, "tiene-pagos", titular?.odontologoId, titular?.clinicaId],
    queryFn: () => window.densz.cuentasTienePagos(titular!),
    enabled: titular !== undefined && (titular.odontologoId != null || titular.clinicaId != null)
  });
}

export function useSaldos(odontologoId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "saldo", odontologoId],
    queryFn: () => window.densz.cuentasSaldos(odontologoId!),
    enabled: odontologoId !== undefined
  });
}

export function useSaldosClinica(clinicaId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "saldo-clinica", clinicaId],
    queryFn: () => window.densz.cuentasSaldosClinica(clinicaId!),
    enabled: clinicaId !== undefined
  });
}

export function useMovimientos(odontologoId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "movimientos", odontologoId],
    queryFn: () => window.densz.cuentasMovimientos(odontologoId!),
    enabled: odontologoId !== undefined
  });
}

export function useMovimientosClinica(clinicaId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "movimientos-clinica", clinicaId],
    queryFn: () => window.densz.cuentasMovimientosClinica(clinicaId!),
    enabled: clinicaId !== undefined
  });
}

export function useResumenMes(odontologoId: number | undefined, periodo: PeriodoMesDto) {
  return useQuery({
    queryKey: [CLAVE, "resumen-mes", odontologoId, periodo.anio, periodo.mes],
    queryFn: () => window.densz.cuentasResumenMes(odontologoId!, periodo),
    enabled: odontologoId !== undefined
  });
}

export function useResumenMesClinica(clinicaId: number | undefined, periodo: PeriodoMesDto) {
  return useQuery({
    queryKey: [CLAVE, "resumen-mes-clinica", clinicaId, periodo.anio, periodo.mes],
    queryFn: () => window.densz.cuentasResumenMesClinica(clinicaId!, periodo),
    enabled: clinicaId !== undefined
  });
}

export function useResumenesMensuales(odontologoId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "resumenes", odontologoId],
    queryFn: () => window.densz.cuentasListarResumenes(odontologoId!),
    enabled: odontologoId !== undefined
  });
}

export function useResumenesMensualesClinica(clinicaId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "resumenes-clinica", clinicaId],
    queryFn: () => window.densz.cuentasListarResumenesClinica(clinicaId!),
    enabled: clinicaId !== undefined
  });
}

export function useVerPdfResumen() {
  return useMutation({
    mutationFn: (resumenId: number) => window.densz.cuentasVerPdfResumen(resumenId),
    onError: (e: unknown) => toast({ titulo: "No se pudo abrir el PDF", descripcion: String(e), tono: "error" })
  });
}

export function useImprimirEstadoDeCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ odontologoId, periodo }: { odontologoId: number; periodo: PeriodoMesDto }) =>
      window.densz.cuentasImprimirEstadoDeCuenta(odontologoId, periodo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE, "resumenes"] });
      toast({ titulo: "Resumen mensual generado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo generar el resumen mensual", descripcion: String(e), tono: "error" })
  });
}

export function useImprimirEstadoDeCuentaClinica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clinicaId, periodo }: { clinicaId: number; periodo: PeriodoMesDto }) =>
      window.densz.cuentasImprimirEstadoDeCuentaClinica(clinicaId, periodo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLAVE, "resumenes-clinica"] });
      toast({ titulo: "Resumen mensual generado", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo generar el resumen mensual", descripcion: String(e), tono: "error" })
  });
}
