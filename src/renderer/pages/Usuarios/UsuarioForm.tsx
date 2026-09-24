import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { FormField, Input } from "../../components/ui/Input";
import { useRoles, useCrearUsuario } from "../../features/usuarios/hooks";

const REGEX_USUARIO = /^[a-z0-9._-]+$/i;

/** Modal de alta de usuario. Edición y administración de un usuario
 * existente viven en UsuarioDetalle — este componente es solo para crear
 * cuentas nuevas. */
export function UsuarioForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [rolId, setRolId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useRoles();
  const crear = useCrearUsuario();

  useEffect(() => {
    if (open) {
      setNombreUsuario("");
      setRolId(roles?.[0]?.id ?? null);
      setPassword("");
      setConfirmarPassword("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function validar(): string | null {
    const usuario = nombreUsuario.trim();
    if (!usuario) return "El nombre de usuario es obligatorio.";
    if (usuario.length < 3) return "El usuario debe tener al menos 3 caracteres.";
    if (!REGEX_USUARIO.test(usuario)) return "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos.";
    if (!rolId) return "Seleccioná un rol.";
    if (!password) return "La contraseña es obligatoria.";
    if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
    if (password !== confirmarPassword) return "Las contraseñas no coinciden.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const mensaje = validar();
    if (mensaje) return setError(mensaje);
    setError(null);
    try {
      await crear.mutateAsync({
        data: { nombreUsuario: nombreUsuario.trim(), rolId: rolId! },
        password
      });
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Nuevo usuario" description="Creá una cuenta con acceso a Densz." size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Usuario">
          <Input autoFocus value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} placeholder="jperez" />
        </FormField>
        <FormField label="Rol">
          <select
            value={rolId ?? ""}
            onChange={(e) => setRolId(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
          >
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Contraseña inicial">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </FormField>
        <FormField label="Confirmar contraseña">
          <Input
            type="password"
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            placeholder="Repetí la contraseña"
          />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={crear.isPending}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}
