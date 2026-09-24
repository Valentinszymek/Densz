import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { formatearMoneda } from "../../lib/format";
import type { Moneda } from "@shared/types/entities";

/**
 * Confirmación obligatoria antes de guardar la edición de una OT que YA
 * está facturada (§14): muestra el importe anterior, el nuevo y la
 * diferencia, para que quede clarísimo el impacto en la cuenta antes de
 * tocar nada. Si además la cuenta tiene pagos registrados, se suma una
 * advertencia extra (§5) — nunca se borra ningún pago, pero el usuario
 * tiene que saber que el saldo va a cambiar.
 */
export function ConfirmarEdicionOrdenModal({
  open,
  onOpenChange,
  ordenNumero,
  importeAnteriorCentavos,
  importeNuevoCentavos,
  moneda,
  tienePagosRegistrados,
  guardando,
  onConfirmar
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ordenNumero: string;
  importeAnteriorCentavos: number;
  importeNuevoCentavos: number;
  moneda: Moneda;
  tienePagosRegistrados: boolean;
  guardando: boolean;
  onConfirmar: () => void;
}) {
  const diferencia = importeNuevoCentavos - importeAnteriorCentavos;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Confirmar edición de ${ordenNumero}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-carbon/60">
          Esta orden ya está facturada. Los cambios van a modificar su importe y el impacto que tiene en la cuenta
          corriente del odontólogo.
        </p>

        <div className="rounded-lg border border-carbon/10 divide-y divide-carbon/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-carbon/50">Importe anterior</span>
            <span className="font-medium">{formatearMoneda(importeAnteriorCentavos, moneda)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-carbon/50">Importe nuevo</span>
            <span className="font-medium">{formatearMoneda(importeNuevoCentavos, moneda)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-carbon/[0.03]">
            <span className="text-carbon/50">Diferencia</span>
            <span className={`font-semibold ${diferencia === 0 ? "" : diferencia > 0 ? "text-red-600" : "text-emerald-700"}`}>
              {diferencia > 0 ? "+" : ""}
              {formatearMoneda(diferencia, moneda)}
            </span>
          </div>
        </div>

        {tienePagosRegistrados && (
          <div className="rounded-lg bg-gold/10 border border-gold/25 px-4 py-3 text-sm text-carbon/70">
            Esta cuenta tiene pagos registrados. Al modificar el importe, el saldo puede quedar a favor o en contra del
            odontólogo — ningún pago se elimina ni se modifica.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirmar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
