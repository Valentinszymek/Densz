import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FormField, Input } from "../ui/Input";
import { useVerificarCodigoRecuperacion, useRestablecerConCodigo } from "../../features/proteccion/hooks";
import { CodigoRecuperacionModal } from "./CodigoRecuperacionModal";

type Paso = "codigo" | "nueva-password";

/**
 * "¿Olvidaste tu contraseña?" (§9): primero valida el código de
 * recuperación, y solo si es válido deja definir una contraseña nueva —
 * nunca revela si la sección tiene o no datos, ni ninguna otra pista.
 * Al terminar, el código usado queda invalidado y se entrega uno nuevo.
 */
export function RecuperarAccesoModal({
  open,
  onOpenChange,
  onRestablecido
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Se llama recién cuando el usuario cierra el modal del código nuevo —
   * es el mismo momento en que `ProteccionGuard` debe considerar esta
   * visita desbloqueada (con la contraseña recién definida). */
  onRestablecido: () => void;
}) {
  const [paso, setPaso] = useState<Paso>("codigo");
  const [codigo, setCodigo] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarNueva, setConfirmarNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codigoNuevo, setCodigoNuevo] = useState<string | null>(null);

  const verificarCodigo = useVerificarCodigoRecuperacion();
  const restablecer = useRestablecerConCodigo();

  function reiniciar() {
    setPaso("codigo");
    setCodigo("");
    setPasswordNueva("");
    setConfirmarNueva("");
    setError(null);
  }

  async function onVerificarCodigo(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ok = await verificarCodigo.mutateAsync(codigo);
      if (!ok) {
        setError("No pudimos verificar el código de recuperación.");
        return;
      }
      setPaso("nueva-password");
    } catch (err) {
      setError(String(err));
    }
  }

  async function onRestablecer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva.trim().length === 0) return setError("La contraseña no puede estar vacía.");
    if (passwordNueva !== confirmarNueva) return setError("Las contraseñas no coinciden.");
    try {
      const { codigoRecuperacion } = await restablecer.mutateAsync({ codigo, passwordNueva, confirmarNueva });
      setCodigoNuevo(codigoRecuperacion);
    } catch (err) {
      setError(String(err));
    }
  }

  if (codigoNuevo) {
    return (
      <CodigoRecuperacionModal
        open
        codigo={codigoNuevo}
        onCerrar={() => {
          setCodigoNuevo(null);
          reiniciar();
          onOpenChange(false);
          // Recién acá, después de que el usuario vio y guardó el código
          // nuevo, se considera esta visita desbloqueada.
          onRestablecido();
        }}
      />
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reiniciar();
      }}
      title="Recuperar acceso"
      size="sm"
    >
      {paso === "codigo" && (
        <form onSubmit={onVerificarCodigo} className="space-y-4">
          <FormField label="Ingresá tu código de recuperación">
            <Input
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="DENSZ-XXXX-XXXX-XXXX"
              className="font-mono tracking-wide"
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!codigo.trim() || verificarCodigo.isPending}>
              {verificarCodigo.isPending ? "Verificando…" : "Verificar"}
            </Button>
          </div>
        </form>
      )}

      {paso === "nueva-password" && (
        <form onSubmit={onRestablecer} className="space-y-4">
          <p className="text-sm text-carbon/60">Código verificado. Definí una contraseña nueva.</p>
          <FormField label="Nueva contraseña">
            <Input autoFocus type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} />
          </FormField>
          <FormField label="Confirmar">
            <Input type="password" value={confirmarNueva} onChange={(e) => setConfirmarNueva(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={restablecer.isPending}>
              {restablecer.isPending ? "Guardando…" : "Restablecer contraseña"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
