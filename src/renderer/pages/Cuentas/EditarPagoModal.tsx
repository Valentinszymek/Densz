import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { SelectorMes } from "../../components/ui/SelectorMes";
import { useMediosPago, useEditarPago } from "../../features/pagos/hooks";
import type { Moneda, Pago } from "@shared/types/entities";

/**
 * Mismos campos que "Registrar pago" (RegistrarPagoModal.tsx), pero
 * precargados con los datos del pago elegido — pensado sobre todo para
 * corregirle a mano el mes a un pago viejo que quedó mal clasificado,
 * sin tener que anularlo y cargarlo de nuevo. Edita el pago EN EL LUGAR
 * (nunca anula uno y crea otro — misma razón que editar una OT: evita
 * una fila fantasma en Cuentas). El titular (odontólogo/clínica) no es
 * editable acá, por eso no se pide.
 */
export function EditarPagoModal({
  open,
  onOpenChange,
  pago
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pago: Pago;
}) {
  const [fecha, setFecha] = useState(pago.fecha.slice(0, 10));
  const [importe, setImporte] = useState(pago.importeCentavos);
  const [moneda, setMoneda] = useState<Moneda>(pago.moneda);
  const [medioPagoId, setMedioPagoId] = useState<number | null>(pago.medioPagoId ?? null);
  const [referencia, setReferencia] = useState(pago.referencia ?? "");
  // Un pago viejo sin mes asignado todavía (periodoAnio/periodoMes en
  // null) arranca con el mes de su propia fecha — mismo criterio de
  // respaldo que usa el resto de Cuentas, nunca Enero 2026 a ciegas.
  const [periodoAnio, setPeriodoAnio] = useState(pago.periodoAnio ?? Number(pago.fecha.slice(0, 4)));
  const [periodoMes, setPeriodoMes] = useState(pago.periodoMes ?? Number(pago.fecha.slice(5, 7)));
  const [error, setError] = useState<string | null>(null);

  const { data: medios } = useMediosPago();
  const editar = useEditarPago();

  useEffect(() => {
    if (open) {
      setFecha(pago.fecha.slice(0, 10));
      setImporte(pago.importeCentavos);
      setMoneda(pago.moneda);
      setMedioPagoId(pago.medioPagoId ?? null);
      setReferencia(pago.referencia ?? "");
      setPeriodoAnio(pago.periodoAnio ?? Number(pago.fecha.slice(0, 4)));
      setPeriodoMes(pago.periodoMes ?? Number(pago.fecha.slice(5, 7)));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pago.id]);

  async function enviar() {
    setError(null);
    if (importe <= 0) return setError("Ingresá un importe mayor a cero.");
    if (!medioPagoId) return setError("Seleccioná un medio de pago.");
    await editar.mutateAsync({
      id: pago.id,
      data: { fecha, importeCentavos: importe, moneda, medioPagoId, referencia: referencia || null, periodoAnio, periodoMes }
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Editar pago" size="sm">
      <div className="space-y-4">
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
        <FormField label="¿A qué mes corresponde?">
          <SelectorMes anio={periodoAnio} mes={periodoMes} onChange={(a, m) => { setPeriodoAnio(a); setPeriodoMes(m); }} />
          <p className="mt-1 text-xs text-carbon/40">
            No tiene que ser el mes de la fecha de arriba — si este pago en realidad era de otro mes, elegilo acá.
          </p>
        </FormField>
        <FormField label="Medio de pago">
          <select
            value={medioPagoId ?? ""}
            onChange={(e) => setMedioPagoId(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
          >
            {medios?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Referencia (opcional)">
          <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de transferencia, cheque, etc." />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={editar.isPending}>
            {editar.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
