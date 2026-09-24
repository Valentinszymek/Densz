import { Database, DatabaseZap } from "lucide-react";
import { useEstadoSistema } from "../../features/system/hooks";
import { Tooltip } from "../ui/Tooltip";
import { cn } from "../../lib/cn";

export function SystemStatusBadge() {
  const { data, isError } = useEstadoSistema();

  const ok = !isError && data?.integridadOk;
  const Icono = ok ? Database : DatabaseZap;

  const detalle = isError
    ? "No se pudo consultar la base de datos."
    : data
      ? `${data.dbPath} — integridad ${data.integridadOk ? "OK" : "FALLÓ"}`
      : "Consultando…";

  return (
    <Tooltip content={detalle}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          ok ? "bg-emerald-600/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
        )}
      >
        <Icono size={13} />
        <span>{ok ? "Base de datos OK" : "Verificando…"}</span>
      </div>
    </Tooltip>
  );
}
