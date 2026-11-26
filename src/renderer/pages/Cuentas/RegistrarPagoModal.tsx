import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { SelectorMes } from "../../components/ui/SelectorMes";
import { useMediosPago, useRegistrarPago } from "../../features/pagos/hooks";
import { useOdontologo } from "../../features/odontologos/hooks";
import type { Moneda } from "@shared/types/entities";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mismos nombres que NOMBRES_MES en pagoService.ts — para que el ejemplo
// de "Sobrante de Octubre 2026" en pantalla coincida exactamente con lo
// que va a aparecer después en Pagos registrados.
const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

type Titular = { odontologoId: number } | { clinicaId: number };

export function RegistrarPagoModal({
  open,
  onOpenChange,
  titular,
  monedaSugerida,
  periodoInicial
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titular: Titular;
  /** Para clínicas (sin lista de precios propia, a diferencia de un
   * odontólogo): la pantalla que abre el modal ya sabe en qué moneda tiene
   * saldo esa clínica — sin esto, siempre caía en ARS por defecto. */
  monedaSugerida?: Moneda;
  /** Mes al que se le precarga el pago — el mismo que ya estás mirando
   * en Cuentas al tocar "Registrar pago" (pedido explícito: un pago no
   * se reparte solo entre meses, lo elegís vos — ver SelectorMes abajo,
   * que deja cambiarlo antes de guardar si corresponde a otro mes). */
  periodoInicial: { anio: number; mes: number };
}) {
  const [fecha, setFecha] = useState(hoyISO());
  const [importe, setImporte] = useState(0);
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [medioPagoId, setMedioPagoId] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [periodoAnio, setPeriodoAnio] = useState(periodoInicial.anio);
  const [periodoMes, setPeriodoMes] = useState(periodoInicial.mes);
  const [advertenciaDuplicado, setAdvertenciaDuplicado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const odontologoId = "odontologoId" in titular ? titular.odontologoId : undefined;
  const { data: odontologo } = useOdontologo(odontologoId);
  const { data: medios } = useMediosPago();
  const registrar = useRegistrarPago();

  useEffect(() => {
    if (open) {
      setFecha(hoyISO());
      setImporte(0);
      setMoneda(odontologo?.listaPrecioMoneda ?? monedaSugerida ?? "ARS");
      setMedioPagoId(medios?.[0]?.id ?? null);
      setReferencia("");
      setPeriodoAnio(periodoInicial.anio);
      setPeriodoMes(periodoInicial.mes);
      setAdvertenciaDuplicado(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, odontologo, monedaSugerida, periodoInicial.anio, periodoInicial.mes]);

  async function enviar(confirmarDuplicado: boolean) {
    setError(null);
    if (importe <= 0) return setError("Ingresá un importe mayor a cero.");
    if (!medioPagoId) return setError("Seleccioná un medio de pago.");

    const resultado = await registrar.mutateAsync({
      data: {
        odontologoId: "odontologoId" in titular ? titular.odontologoId : null,
        clinicaId: "clinicaId" in titular ? titular.clinicaId : null,
        fecha,
        importeCentavos: importe,
        moneda,
        medioPagoId,
        referencia: referencia || null,
        periodoAnio,
        periodoMes
      },
      confirmarDuplicado
    });

    if (!resultado.creado) {
      setAdvertenciaDuplicado(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Registrar pago" size="sm">
      <div className="space-y-4">
        {advertenciaDuplicado ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-4 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle size={16} /> Ya existe un pago igual
            </p>
            <p className="text-sm text-amber-800/80">
              Ya hay un pago registrado con el mismo importe, moneda, fecha y medio de pago. ¿Confirmás que querés
              registrarlo de todas formas?
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAdvertenciaDuplicado(false)}>
                Volver
              </Button>
              <Button size="sm" onClick={() => enviar(true)} disabled={registrar.isPending}>
                Registrar igual
              </Button>
            </div>
          </div>
        ) : (
          <>
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
                No tiene que ser el mes de la fecha de arriba — si cobra hoy algo de un mes anterior, elegí ese mes.
                Si el importe es mayor a lo pendiente de este mes, el sobrante se asigna solo a los meses siguientes
                con saldo pendiente (queda registrado como "Sobrante de {NOMBRES_MES[periodoMes - 1]} {periodoAnio}").
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
              <Button onClick={() => enviar(false)} disabled={registrar.isPending}>
                Registrar pago
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
