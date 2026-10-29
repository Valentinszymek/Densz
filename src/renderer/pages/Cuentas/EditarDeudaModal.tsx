import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { useEditarDeuda } from "../../features/deudas/hooks";
import type { Moneda, MovimientoCuenta } from "@shared/types/entities";

/** Corrige una deuda agregada a mano ya cargada (ej. un importe mal
 * tipeado) — nunca una OT ni un pago, eso no se edita acá. */
export function EditarDeudaModal({
  open,
  onOpenChange,
  deuda
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deuda: MovimientoCuenta | null;
}) {
  const [fecha, setFecha] = useState("");
  const [importe, setImporte] = useState(0);
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const editar = useEditarDeuda();

  useEffect(() => {
    if (open && deuda) {
      setFecha(deuda.fecha.slice(0, 10));
      setImporte(deuda.importeCentavos);
      setMoneda(deuda.moneda);
      setDescripcion(deuda.descripcion);
      setError(null);
    }
  }, [open, deuda]);

  async function enviar() {
    if (!deuda) return;
    setError(null);
    if (importe <= 0) return setError("Ingresá un importe mayor a cero.");
    if (!descripcion.trim()) return setError("Ingresá una descripción.");

    await editar.mutateAsync({
      id: deuda.id,
      data: { fecha, importeCentavos: importe, moneda, descripcion: descripcion.trim() }
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar deuda" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-carbon/60">Corrige el importe, la fecha, la moneda o la descripción de esta deuda.</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Importe">
            <CurrencyInput autoFocus valueCentavos={importe} onChangeCentavos={setImporte} simbolo={moneda === "USD" ? "US$" : "$"} />
          </FormField>
          <FormField label="Moneda">
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
              className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </FormField>
        </div>
        <FormField label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="Descripción">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={editar.isPending}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  );
}
