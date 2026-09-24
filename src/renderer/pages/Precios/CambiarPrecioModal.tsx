import { useState, type FormEvent } from "react";
import { History } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField } from "../../components/ui/Input";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { useHistorialItemLista, useCambiarPrecioLista } from "../../features/listasPrecio/hooks";
import { formatearMoneda, formatearFechaHora } from "../../lib/format";
import type { PrestacionEnLista, Moneda } from "@shared/types/entities";

export function CambiarPrecioModal({
  open,
  onOpenChange,
  listaId,
  moneda,
  prestacion
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  listaId: number | null;
  moneda: Moneda;
  prestacion: PrestacionEnLista | null;
}) {
  const [nuevoPrecio, setNuevoPrecio] = useState(0);
  const { data: historial } = useHistorialItemLista(listaId ?? undefined, prestacion?.id);
  const cambiar = useCambiarPrecioLista();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prestacion || !listaId || nuevoPrecio <= 0) return;
    await cambiar.mutateAsync({ listaId, prestacionId: prestacion.id, precioCentavos: nuevoPrecio });
    onOpenChange(false);
  }

  if (!prestacion) return null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Cambiar precio — ${prestacion.nombre}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-carbon/60">
          Precio vigente en esta lista:{" "}
          <strong>{prestacion.precioCentavos !== null ? formatearMoneda(prestacion.precioCentavos, moneda) : "sin precio"}</strong>
        </p>
        <FormField label={`Nuevo precio (${moneda})`}>
          <CurrencyInput autoFocus valueCentavos={nuevoPrecio} onChangeCentavos={setNuevoPrecio} simbolo={moneda === "USD" ? "US$" : "$"} />
        </FormField>
        <p className="text-xs text-carbon/40">
          Las OT ya registradas con el precio anterior no se ven afectadas: el precio queda congelado en cada una.
        </p>

        {historial && historial.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-carbon/50 uppercase tracking-wide mb-2">
              <History size={13} /> Historial en esta lista
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1 text-sm">
              {historial.map((h) => (
                <div key={h.id} className="flex justify-between text-carbon/60">
                  <span>{formatearFechaHora(h.vigenteDesde)}</span>
                  <span className={h.vigenteHasta === null ? "font-medium text-carbon" : ""}>
                    {formatearMoneda(h.precioCentavos, moneda)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={nuevoPrecio <= 0}>
            Guardar nuevo precio
          </Button>
        </div>
      </form>
    </Modal>
  );
}
