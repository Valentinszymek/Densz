import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useCrearOdontologo, useActualizarOdontologo } from "../../features/odontologos/hooks";
import { useListasPrecio } from "../../features/listasPrecio/hooks";
import { useClinicas } from "../../features/clinicas/hooks";
import type { Odontologo } from "@shared/types/entities";

interface OdontologoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  odontologo?: Odontologo | null;
  onCreated?: (id: number) => void;
  /** Preselecciona una clínica (ej. al crear un profesional desde la ficha de la clínica). */
  clinicaIdPorDefecto?: number;
}

export function OdontologoForm({ open, onOpenChange, odontologo, onCreated, clinicaIdPorDefecto }: OdontologoFormProps) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [listaPrecioId, setListaPrecioId] = useState<number | null>(null);
  const [clinicaId, setClinicaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: listas } = useListasPrecio(true);
  const { data: clinicas } = useClinicas({ soloActivas: true });
  const crear = useCrearOdontologo();
  const actualizar = useActualizarOdontologo();
  const enviando = crear.isPending || actualizar.isPending;

  useEffect(() => {
    if (open) {
      setNombre(odontologo?.nombre ?? "");
      setTelefono(odontologo?.telefono ?? "");
      setDireccion(odontologo?.direccion ?? "");
      setListaPrecioId(odontologo?.listaPrecioId ?? listas?.[0]?.id ?? null);
      setClinicaId(odontologo?.clinicaId ?? clinicaIdPorDefecto ?? null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, odontologo, listas, clinicaIdPorDefecto]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!listaPrecioId) {
      setError("Asigná una lista de precios.");
      return;
    }
    const data = { nombre, telefono: telefono || null, direccion: direccion || null, listaPrecioId, clinicaId };
    try {
      if (odontologo) {
        await actualizar.mutateAsync({ id: odontologo.id, data });
      } else {
        const id = await crear.mutateAsync(data);
        onCreated?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={odontologo ? "Editar odontólogo" : "Nuevo odontólogo"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nombre">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Dr. Juan Pérez" />
        </FormField>
        <FormField label="Teléfono">
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="341-555-1234" />
        </FormField>
        <FormField label="Ubicación / dirección del consultorio">
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Av. Siempre Viva 123" />
        </FormField>
        <FormField label="Lista de precios">
          <select
            value={listaPrecioId ?? ""}
            onChange={(e) => setListaPrecioId(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
          >
            <option value="" disabled>
              Elegí una lista…
            </option>
            {listas?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre} ({l.moneda})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Clínica (opcional)">
          <select
            value={clinicaId ?? ""}
            onChange={(e) => setClinicaId(e.target.value ? Number(e.target.value) : null)}
            className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
          >
            <option value="">Profesional independiente</option>
            {clinicas?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-carbon/40">
            Si pertenece a una clínica, sus trabajos futuros se facturan y cobran a nombre de la clínica.
          </p>
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
