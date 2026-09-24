import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useCrearClinica, useActualizarClinica } from "../../features/clinicas/hooks";
import type { Clinica } from "@shared/types/entities";

interface ClinicaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinica?: Clinica | null;
  onCreated?: (id: number) => void;
}

export function ClinicaForm({ open, onOpenChange, clinica, onCreated }: ClinicaFormProps) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearClinica();
  const actualizar = useActualizarClinica();
  const enviando = crear.isPending || actualizar.isPending;

  useEffect(() => {
    if (open) {
      setNombre(clinica?.nombre ?? "");
      setTelefono(clinica?.telefono ?? "");
      setDireccion(clinica?.direccion ?? "");
      setError(null);
    }
  }, [open, clinica]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    const data = { nombre, telefono: telefono || null, direccion: direccion || null };
    try {
      if (clinica) {
        await actualizar.mutateAsync({ id: clinica.id, data });
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
    <Modal open={open} onOpenChange={onOpenChange} title={clinica ? "Editar clínica" : "Nueva clínica"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nombre">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Dental M3" />
        </FormField>
        <FormField label="Teléfono">
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="341-555-1234" />
        </FormField>
        <FormField label="Dirección">
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Av. Siempre Viva 123" />
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
