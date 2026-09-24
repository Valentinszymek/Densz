import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField } from "../../components/ui/Input";
import { useEliminarOrden } from "../../features/ordenes/hooks";

export function EliminarOrdenModal({
  open,
  onOpenChange,
  ordenId,
  ordenNumero
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ordenId: number;
  ordenNumero: string;
}) {
  const navigate = useNavigate();
  const [motivo, setMotivo] = useState("");
  const eliminar = useEliminarOrden();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    await eliminar.mutateAsync({ id: ordenId, motivo });
    onOpenChange(false);
    setMotivo("");
    navigate("/trabajos");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Eliminar definitivamente la OT ${ordenNumero}`} size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-lg bg-red-600/5 border border-red-600/15 px-4 py-3 text-sm text-red-700 space-y-1">
          <p className="font-semibold">Esta acción eliminará la orden de trabajo y sus datos asociados.</p>
          <p>Se borran definitivamente la OT, su comprobante y el movimiento de cuenta que generó. Queda registrado en Auditoría, con el motivo que ingreses acá.</p>
          <p className="font-semibold">Esta acción no se puede deshacer.</p>
        </div>
        <p className="text-sm text-carbon/60">
          Usá esto solo para corregir un error de carga (por ejemplo, se facturó al odontólogo equivocado). Si el
          trabajo fue real pero ya no corresponde cobrarlo, usá <strong>Anular</strong> en cambio — esa opción
          conserva el historial.
        </p>
        <FormField label="Motivo (obligatorio)">
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: se facturó por error a Silvana Gomez, era para Silvana Furfaro…"
            className="w-full rounded-lg border border-carbon/15 bg-cream-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" disabled={motivo.trim().length < 3 || eliminar.isPending}>
            {eliminar.isPending ? "Eliminando…" : "Eliminar definitivamente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
