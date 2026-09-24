import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { SelectBuscable } from "../../components/ui/SelectBuscable";
import { useCategorias, useCrearPrestacion, useActualizarPrestacion } from "../../features/precios/hooks";
import type { Prestacion } from "@shared/types/entities";

export function PrestacionForm({
  open,
  onOpenChange,
  prestacion,
  categoriaIdPorDefecto
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prestacion?: Prestacion | null;
  categoriaIdPorDefecto?: number;
}) {
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: categorias } = useCategorias(true);
  const crear = useCrearPrestacion();
  const actualizar = useActualizarPrestacion();

  useEffect(() => {
    if (open) {
      setNombre(prestacion?.nombre ?? "");
      setCategoriaId(prestacion?.categoriaId ?? categoriaIdPorDefecto ?? null);
      setError(null);
    }
  }, [open, prestacion, categoriaIdPorDefecto]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    if (!categoriaId) return setError("Seleccioná una categoría.");
    try {
      if (prestacion) {
        await actualizar.mutateAsync({ id: prestacion.id, data: { nombre, categoriaId } });
      } else {
        await crear.mutateAsync({ nombre, categoriaId });
      }
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={prestacion ? "Editar prestación" : "Nueva prestación"}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nombre del trabajo">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Corona de circonio" />
        </FormField>
        <FormField label="Categoría">
          <SelectBuscable
            opciones={(categorias ?? []).map((c) => ({ id: c.id, label: c.nombre }))}
            value={categoriaId}
            onChange={setCategoriaId}
            placeholder="Seleccionar categoría…"
          />
        </FormField>
        {!prestacion && (
          <p className="text-xs text-carbon/40">
            Se crea sin precio. Definí su precio dentro de cada lista de precios que la necesite.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit">Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
