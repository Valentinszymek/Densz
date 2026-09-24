import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

interface EliminarConUsoProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  cargando: boolean;
  /** Mensaje de por qué NO se puede eliminar — si está presente, no se ofrece la acción de eliminar. */
  bloqueadoPor: string | null;
  /** Mensaje de advertencia (se puede eliminar, pero hay algo que el usuario debería saber antes). */
  advertencia?: string | null;
  /** Mensaje afirmativo cuando SÍ se puede eliminar sin problemas (ej: "no tiene historial asociado"). */
  mensajeSeguro?: string | null;
  onConfirmar: () => void;
  eliminando: boolean;
  /** Reemplaza el botón "Entendido" del estado bloqueado por una acción alternativa
   * (ej: "Marcar como inactiva") cuando el borrado físico no es posible. */
  accionBloqueada?: { label: string; onClick: () => void; pendiente?: boolean };
}

/**
 * Diálogo de borrado seguro compartido por prestaciones, categorías y
 * listas de precios: primero verifica el uso real (vía la query que ya
 * trajo `bloqueadoPor`/`advertencia`) y solo ofrece "Eliminar" cuando de
 * verdad es seguro — nunca borra en silencio (§3-§6 del pedido).
 */
export function EliminarConUso({
  open,
  onOpenChange,
  titulo,
  cargando,
  bloqueadoPor,
  advertencia,
  mensajeSeguro,
  onConfirmar,
  eliminando,
  accionBloqueada
}: EliminarConUsoProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={titulo} size="sm">
      <div className="space-y-4">
        {cargando && <p className="text-sm text-carbon/40">Verificando…</p>}

        {!cargando && bloqueadoPor && (
          <>
            <div className="flex gap-2.5 rounded-lg bg-red-600/5 border border-red-600/15 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>{bloqueadoPor}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                {accionBloqueada ? "Cancelar" : "Entendido"}
              </Button>
              {accionBloqueada && (
                <Button size="sm" onClick={accionBloqueada.onClick} disabled={accionBloqueada.pendiente}>
                  {accionBloqueada.pendiente ? "Guardando…" : accionBloqueada.label}
                </Button>
              )}
            </div>
          </>
        )}

        {!cargando && !bloqueadoPor && (
          <>
            {mensajeSeguro && (
              <div className="flex gap-2.5 rounded-lg bg-emerald-600/5 border border-emerald-600/15 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <p>{mensajeSeguro}</p>
              </div>
            )}
            {advertencia && (
              <div className="flex gap-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>{advertencia}</p>
              </div>
            )}
            <p className="text-sm text-carbon/60">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={onConfirmar} disabled={eliminando}>
                {eliminando ? "Eliminando…" : "Eliminar"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
