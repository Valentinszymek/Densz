import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField } from "../../components/ui/Input";
import { useAnularPago } from "../../features/pagos/hooks";

export function AnularPagoModal({
  open,
  onOpenChange,
  pagoId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pagoId: number;
}) {
  const [motivo, setMotivo] = useState("");
  const anular = useAnularPago();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) return;
    await anular.mutateAsync({ id: pagoId, motivo });
    onOpenChange(false);
    setMotivo("");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Anular pago" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-carbon/60">
          El pago no se elimina: queda marcado como anulado y su movimiento deja de contar en el saldo.
        </p>
        <FormField label="Motivo">
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej: cheque rechazado, importe cargado por error…"
            className="w-full rounded-lg border border-carbon/15 bg-cream-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button type="submit" variant="destructive" disabled={motivo.trim().length < 3 || anular.isPending}>
            Anular pago
          </Button>
        </div>
      </form>
    </Modal>
  );
}
