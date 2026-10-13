import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { useRegistrarDeuda } from "../../features/deudas/hooks";
import { useOdontologo } from "../../features/odontologos/hooks";
import type { Moneda } from "@shared/types/entities";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Titular = { odontologoId: number } | { clinicaId: number };

/** Para cargar un saldo que un odontólogo/clínica ya arrastraba de ANTES de
 * usar Densz (ej. de otra app) — sin ningún trabajo real de por medio, a
 * diferencia de una OT facturada. Suma directo al saldo pendiente. */
export function AgregarDeudaModal({
  open,
  onOpenChange,
  titular
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titular: Titular;
}) {
  const [fecha, setFecha] = useState(hoyISO());
  const [importe, setImporte] = useState(0);
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const odontologoId = "odontologoId" in titular ? titular.odontologoId : undefined;
  const { data: odontologo } = useOdontologo(odontologoId);
  const registrar = useRegistrarDeuda();

  useEffect(() => {
    if (open) {
      setFecha(hoyISO());
      setImporte(0);
      setMoneda(odontologo?.listaPrecioMoneda ?? "ARS");
      setDescripcion("Deuda previa a Densz");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, odontologo]);

  async function enviar() {
    setError(null);
    if (importe <= 0) return setError("Ingresá un importe mayor a cero.");
    if (!descripcion.trim()) return setError("Ingresá una descripción.");

    await registrar.mutateAsync({
      odontologoId: "odontologoId" in titular ? titular.odontologoId : null,
      clinicaId: "clinicaId" in titular ? titular.clinicaId : null,
      fecha,
      importeCentavos: importe,
      moneda,
      descripcion: descripcion.trim()
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Agregar deuda" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-carbon/60">
          Suma directo al saldo pendiente, sin crear ningún trabajo — pensado para cargar lo que ya se debía antes de
          usar Densz.
        </p>
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
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Deuda previa a Densz" maxLength={200} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={registrar.isPending}>
            Agregar deuda
          </Button>
        </div>
      </div>
    </Modal>
  );
}
