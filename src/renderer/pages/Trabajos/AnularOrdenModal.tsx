import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField } from "../../components/ui/Input";
import { useAnularOrden } from "../../features/ordenes/hooks";

export function AnularOrdenModal({
  open,
  onOpenChange,
  ordenId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ordenId: number;
}) {
  const [motivo, setMotivo] = useState("");
  const anular = useAnularOrden();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    await anular.mutateAsync({ id: ordenId, motivo });
    onOpenChange(false);
    setMotivo("");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Anular orden de trabajo" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-carbon/60">
          La orden no se elimina: queda marcada como anulada, con trazabilidad de quién y cuándo. Si ya estaba
          facturada, también se revierte el movimiento en la cuenta corriente.
        </p>
        <FormField label="Motivo">
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: cargado por error, el trabajo era para otro odontólogo…"
            className="w-full rounded-lg border border-carbon/15 bg-cream-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button type="submit" variant="destructive" disabled={motivo.trim().length < 3 || anular.isPending}>
            Anular orden
          </Button>
        </div>
      </form>
    </Modal>
  );
}
