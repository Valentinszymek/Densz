import { useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { FormField } from "../../components/ui/Input";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useRoles, useActualizarUsuario, useSetActivoUsuario, useEliminarUsuario } from "../../features/usuarios/hooks";
import { useAuthStore } from "../../store/authStore";
import { formatearFechaHora, formatearRol } from "../../lib/format";
import { CambiarPasswordModal } from "./CambiarPasswordModal";
import type { Usuario } from "@shared/types/entities";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-carbon/10 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/40 mb-2">{titulo}</p>
      {children}
    </div>
  );
}

export function UsuarioDetalle({
  open,
  onOpenChange,
  usuario
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuario: Usuario;
}) {
  const [rolId, setRolId] = useState(usuario.rolId);
  const [error, setError] = useState<string | null>(null);
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const { data: roles } = useRoles();
  const actualizar = useActualizarUsuario();
  const setActivo = useSetActivoUsuario();
  const eliminar = useEliminarUsuario();
  const esUsuarioActual = useAuthStore((s) => s.sesion?.usuarioId === usuario.id);

  useEffect(() => {
    if (open) {
      setRolId(usuario.rolId);
      setError(null);
    }
  }, [open, usuario]);

  const huboCambios = rolId !== usuario.rolId;

  async function guardarCambios() {
    setError(null);
    try {
      // nombreCompleto ya no se edita acá (eliminado de "información del
      // usuario") — se reenvía el valor existente tal cual, sin tocarlo.
      await actualizar.mutateAsync({
        id: usuario.id,
        data: { nombreUsuario: usuario.nombreUsuario, nombreCompleto: usuario.nombreCompleto, rolId }
      });
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={`@${usuario.nombreUsuario}`} size="sm">
        <div className="space-y-4">
          <Badge tono={usuario.activo ? "exito" : "neutral"}>{usuario.activo ? "🟢 Activo" : "⚪ Inactivo"}</Badge>

          <FormField label="Rol">
            <select
              value={rolId}
              onChange={(e) => setRolId(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm"
            >
              {roles?.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatearRol(r.nombre)}
                </option>
              ))}
            </select>
          </FormField>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {huboCambios && (
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={guardarCambios} disabled={actualizar.isPending}>
                Guardar cambios
              </Button>
            </div>
          )}

          <Seccion titulo="Último acceso">
            <p className="text-sm text-carbon">{usuario.ultimoAcceso ? formatearFechaHora(usuario.ultimoAcceso) : "Nunca"}</p>
          </Seccion>

          <Seccion titulo="Seguridad">
            <div className="flex items-center justify-between">
              <p className="text-sm text-carbon/50 tracking-widest">••••••••</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCambiandoPassword(true)}>
                <KeyRound size={14} /> Cambiar contraseña
              </Button>
            </div>
          </Seccion>

          <Seccion titulo="Estado">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-carbon">{usuario.activo ? "Usuario activo" : "Usuario inactivo"}</p>
              {usuario.activo ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={esUsuarioActual || setActivo.isPending}
                  title={esUsuarioActual ? "No podés desactivar tu propio usuario." : undefined}
                  onClick={() => setConfirmandoDesactivar(true)}
                >
                  Desactivar usuario
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={setActivo.isPending}
                  onClick={() => setActivo.mutate({ id: usuario.id, activo: true })}
                >
                  Activar usuario
                </Button>
              )}
            </div>
          </Seccion>

          {/* Discreta a propósito: eliminar es destructivo, no una acción
              de primer nivel como el resto del panel. */}
          <div className="pt-1 border-t border-carbon/10 flex justify-center">
            <button
              type="button"
              disabled={esUsuarioActual}
              title={esUsuarioActual ? "No podés eliminar el usuario con el que estás conectado." : undefined}
              onClick={() => setConfirmandoEliminar(true)}
              className="flex items-center gap-1.5 text-xs text-carbon/35 hover:text-red-600 disabled:hover:text-carbon/35 disabled:opacity-50 disabled:cursor-not-allowed mt-3"
            >
              <Trash2 size={12} /> Eliminar usuario
            </button>
          </div>
        </div>
      </Modal>

      <CambiarPasswordModal open={cambiandoPassword} onOpenChange={setCambiandoPassword} usuarioId={usuario.id} />

      <ConfirmDialog
        open={confirmandoDesactivar}
        onOpenChange={setConfirmandoDesactivar}
        title="¿Desactivar usuario?"
        description="Este usuario ya no podrá iniciar sesión, pero su historial de actividad se conservará."
        confirmLabel="Desactivar"
        destructive
        onConfirm={() => setActivo.mutate({ id: usuario.id, activo: false })}
      />

      <ConfirmDialog
        open={confirmandoEliminar}
        onOpenChange={setConfirmandoEliminar}
        title="¿Eliminar usuario?"
        description="Esta acción eliminará permanentemente este usuario y su acceso a Densz."
        confirmLabel="Eliminar usuario"
        destructive
        onConfirm={() => eliminar.mutate(usuario.id, { onSuccess: () => onOpenChange(false) })}
      />
    </>
  );
}
