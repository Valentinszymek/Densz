import { useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useCambiarPasswordUsuario } from "../../features/usuarios/hooks";

export function CambiarPasswordModal({
  open,
  onOpenChange,
  usuarioId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuarioId: number;
}) {
  const [password, setPassword] = useState("");
  const cambiar = useCambiarPasswordUsuario();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) return;
    await cambiar.mutateAsync({ id: usuarioId, nuevaPassword: password });
    onOpenChange(false);
    setPassword("");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Cambiar contraseña" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Nueva contraseña">
          <Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={password.length < 6}>
            Cambiar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
