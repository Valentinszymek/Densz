import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { etiquetaAccion } from "@shared/constants/auditoriaAcciones";
import { formatearFechaHoraCompleta } from "../../lib/format";
import type { RegistroAuditoria } from "@shared/types/entities";

interface Cambio {
  campo: string;
  anterior: string;
  nuevo: string;
}

function esArrayDeCambios(valor: unknown): valor is Cambio[] {
  return (
    Array.isArray(valor) &&
    valor.every((c) => c && typeof c === "object" && "campo" in c && "anterior" in c && "nuevo" in c)
  );
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/40 mb-0.5">{label}</p>
      <div className="text-sm text-carbon">{children}</div>
    </div>
  );
}

/** El panel se adapta al tipo de evento (§21): login muestra Resultado,
 * una edición con `detalle.cambios` muestra Campo/Antes/Después, el resto
 * cae en una lista genérica clave:valor — nunca se inventa un campo que
 * el registro no tenga. */
export function AuditoriaDetalle({
  open,
  onOpenChange,
  evento
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  evento: RegistroAuditoria;
}) {
  const esLogin = evento.accion === "login" || evento.accion === "login_fallido";
  const detalle = evento.detalle;
  const cambios = detalle && esArrayDeCambios(detalle.cambios) ? (detalle.cambios as Cambio[]) : null;

  const claveValor = (() => {
    if (!detalle || cambios) return [];
    return Object.entries(detalle).filter(([clave, valor]) => {
      if (valor === null || valor === undefined || typeof valor === "object") return false;
      // login_fallido guarda el usuario intentado en detalle.nombreUsuario
      // y ya se muestra aparte como "Usuario intentado" — no duplicar acá.
      if (esLogin && clave === "nombreUsuario") return false;
      return true;
    });
  })();

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Detalle de auditoría" size="sm">
      <div className="space-y-4">
        <Fila label="Fecha">{formatearFechaHoraCompleta(evento.fecha)}</Fila>

        <Fila label="Usuario">{evento.usuarioNombre ?? "—"}</Fila>
        {evento.usuarioLogin && <Fila label="Usuario de acceso">@{evento.usuarioLogin}</Fila>}

        <Fila label="Acción">{etiquetaAccion(evento.accion)}</Fila>

        {esLogin && (
          <Fila label="Resultado">
            <Badge tono={evento.accion === "login" ? "exito" : "error"}>
              {evento.accion === "login" ? "Exitoso" : "Fallido"}
            </Badge>
          </Fila>
        )}

        {esLogin && typeof detalle?.nombreUsuario === "string" && (
          <Fila label="Usuario intentado">@{detalle.nombreUsuario}</Fila>
        )}

        {!esLogin && (
          <div className="grid grid-cols-2 gap-4">
            <Fila label="Entidad">{evento.entidad}</Fila>
            <Fila label="ID">{evento.entidadId ?? "—"}</Fila>
          </div>
        )}

        <div className="rounded-lg border border-carbon/10 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/40 mb-2">
            {cambios ? "Campos modificados" : "Detalle"}
          </p>

          {cambios && cambios.length > 0 && (
            <div className="space-y-1.5">
              {cambios.map((c, i) => (
                <p key={i} className="text-sm text-carbon">
                  <span className="font-medium">{c.campo}:</span> {c.anterior || "—"} → {c.nuevo || "—"}
                </p>
              ))}
            </div>
          )}

          {!cambios && claveValor.length > 0 && (
            <div className="space-y-1">
              {claveValor.map(([clave, valor]) => (
                <p key={clave} className="text-sm text-carbon">
                  <span className="font-medium">{clave}:</span> {String(valor)}
                </p>
              ))}
            </div>
          )}

          {!cambios && claveValor.length === 0 && <p className="text-sm text-carbon/40">Sin detalles adicionales.</p>}
        </div>
      </div>
    </Modal>
  );
}
