import { useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { SelectBuscable } from "../../components/ui/SelectBuscable";
import { useOdontologos } from "../../features/odontologos/hooks";
import { useCrearPaciente, useActualizarPaciente } from "../../features/pacientes/hooks";
import { OdontologoForm } from "../Odontologos/OdontologoForm";
import type { Paciente } from "@shared/types/entities";

interface PacienteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paciente?: Paciente | null;
  odontologoIdPorDefecto?: number;
  onCreated?: (id: number) => void;
}

export function PacienteForm({
  open,
  onOpenChange,
  paciente,
  odontologoIdPorDefecto,
  onCreated
}: PacienteFormProps) {
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [odontologoId, setOdontologoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevoOdontologoAbierto, setNuevoOdontologoAbierto] = useState(false);

  const { data: odontologos } = useOdontologos({ soloActivos: true });
  const crear = useCrearPaciente();
  const actualizar = useActualizarPaciente();
  const enviando = crear.isPending || actualizar.isPending;

  useEffect(() => {
    if (open) {
      setNombreCompleto(paciente?.nombreCompleto ?? "");
      setOdontologoId(paciente?.odontologoId ?? odontologoIdPorDefecto ?? null);
      setError(null);
    }
  }, [open, paciente, odontologoIdPorDefecto]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (nombreCompleto.trim().length < 2) {
      setError("Ingresá el nombre y apellido del paciente.");
      return;
    }
    if (!odontologoId) {
      setError("Seleccioná un odontólogo.");
      return;
    }
    const data = { nombreCompleto, odontologoId };
    try {
      if (paciente) {
        await actualizar.mutateAsync({ id: paciente.id, data });
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
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={paciente ? "Editar paciente" : "Nuevo paciente"}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Nombre y apellido">
            <Input
              autoFocus
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              placeholder="Juan Pérez"
            />
          </FormField>
          <FormField label="Odontólogo">
            <SelectBuscable
              opciones={(odontologos ?? []).map((o) => ({ id: o.id, label: o.nombre }))}
              value={odontologoId}
              onChange={setOdontologoId}
              placeholder="Buscar odontólogo…"
            />
            <button
              type="button"
              onClick={() => setNuevoOdontologoAbierto(true)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-gold-dim hover:underline"
            >
              <UserPlus size={12} /> Crear odontólogo nuevo
            </button>
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

      <OdontologoForm
        open={nuevoOdontologoAbierto}
        onOpenChange={setNuevoOdontologoAbierto}
        onCreated={(id) => setOdontologoId(id)}
      />
    </>
  );
}
