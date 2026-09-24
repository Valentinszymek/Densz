import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useCrearListaPrecio, useActualizarListaPrecio } from "../../features/listasPrecio/hooks";
import type { ListaPrecio, Moneda } from "@shared/types/entities";

export function ListaPrecioForm({
  open,
  onOpenChange,
  lista,
  onCreated
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lista?: ListaPrecio | null;
  onCreated?: (id: number) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [error, setError] = useState<string | null>(null);

  const crear = useCrearListaPrecio();
  const actualizar = useActualizarListaPrecio();

  useEffect(() => {
    if (open) {
      setNombre(lista?.nombre ?? "");
      setMoneda(lista?.moneda ?? "ARS");
      setError(null);
    }
  }, [open, lista]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    try {
      if (lista) {
        await actualizar.mutateAsync({ id: lista.id, nombre });
      } else {
        const id = await crear.mutateAsync({ nombre, moneda });
        onCreated?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={lista ? "Editar lista de precios" : "Nueva lista de precios"} size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nombre">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Aumentados" />
        </FormField>
        <FormField label="Moneda">
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            disabled={!!lista}
            className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm disabled:opacity-50"
          >
            <option value="ARS">Pesos (ARS)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
          {lista && <p className="mt-1.5 text-xs text-carbon/40">La moneda de una lista no se puede cambiar una vez creada.</p>}
        </FormField>
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
