import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useCrearCategoria, useActualizarCategoria } from "../../features/precios/hooks";
import type { CategoriaPrecio } from "@shared/types/entities";

export function CategoriaForm({
  open,
  onOpenChange,
  categoria
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categoria?: CategoriaPrecio | null;
}) {
  const [nombre, setNombre] = useState("");
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();

  useEffect(() => {
    if (open) setNombre(categoria?.nombre ?? "");
  }, [open, categoria]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (categoria) {
      await actualizar.mutateAsync({ id: categoria.id, nombre });
    } else {
      await crear.mutateAsync(nombre);
    }
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={categoria ? "Editar categoría" : "Nueva categoría"} size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nombre">
          <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} placeholder="CORONAS" />
        </FormField>
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
