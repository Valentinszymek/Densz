import { useMutation } from "@tanstack/react-query";
import type { RangoFechas, FiltroAuditoriaDto } from "@shared/types/entities";
import { toast } from "../../store/toastStore";

type TipoExport = "odontologos" | "clinicas" | "pacientes" | "trabajos" | "cuenta" | "pagos" | "estadisticas" | "auditoria";
type FormatoExport = "csv" | "xlsx" | "pdf";

export function useExportar() {
  return useMutation({
    mutationFn: ({
      tipo,
      formato,
      nombreSugerido,
      opciones
    }: {
      tipo: TipoExport;
      formato: FormatoExport;
      nombreSugerido: string;
      opciones?: { odontologoId?: number; clinicaId?: number; rango?: RangoFechas; filtroAuditoria?: FiltroAuditoriaDto };
    }) => window.densz.exportGenerar(tipo, formato, nombreSugerido, opciones),
    onSuccess: (ruta) => {
      if (ruta) toast({ titulo: "Exportación lista", descripcion: ruta, tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo exportar", descripcion: String(e), tono: "error" })
  });
}
