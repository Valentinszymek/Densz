import { useState, type FormEvent } from "react";
import { Shield, KeyRound, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Toggle } from "../../components/ui/Toggle";
import { Modal } from "../../components/ui/Modal";
import { FormField, Input } from "../../components/ui/Input";
import { CodigoRecuperacionModal } from "../../components/proteccion/CodigoRecuperacionModal";
import {
  useEstadoProteccion,
  useActivarProteccion,
  useDesactivarProteccion,
  useCambiarPasswordProteccion,
  useGenerarCodigoProteccion
} from "../../features/proteccion/hooks";

/**
 * "Protección de información" en Configuración (§5, §13) — solo para el
 * Administrador (esta página se filtra en `Configuracion/index.tsx`, y el
 * backend además rechaza estas acciones si el usuario no tiene el
 * permiso, aunque alguien llegara igual a verla).
 */
export function SeccionProteccion() {
  const { data: estado, isLoading } = useEstadoProteccion();
  const [activando, setActivando] = useState(false);
  const [desactivando, setDesactivando] = useState(false);
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [generandoCodigo, setGenerandoCodigo] = useState(false);
  const [codigoAMostrar, setCodigoAMostrar] = useState<string | null>(null);

  const activada = estado?.activada ?? false;

  function onCambiarToggle(nuevoValor: boolean) {
    if (nuevoValor) setActivando(true);
    else setDesactivando(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield size={16} className="text-gold-dim" /> Protección de información
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-carbon">Proteger Estadísticas y Cuentas</p>
            <p className="text-sm text-carbon/50 mt-0.5">
              Protege el acceso a información financiera y empresarial sensible con una contraseña compartida.
            </p>
          </div>
          {!isLoading && <Toggle activo={activada} onChange={onCambiarToggle} label="Proteger Estadísticas y Cuentas" />}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-carbon/10">
          <span className="text-xs text-carbon/40 mt-3">Estado:</span>
          <span className="mt-3">
            <Badge tono={activada ? "exito" : "neutral"}>{activada ? "Protección activada" : "Protección desactivada"}</Badge>
          </span>
        </div>

        {activada && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setCambiandoPassword(true)}>
              <KeyRound size={14} /> Cambiar contraseña
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setGenerandoCodigo(true)}>
              <RefreshCw size={14} /> Generar nuevo código de recuperación
            </Button>
          </div>
        )}
      </CardContent>

      <ActivarProteccionModal
        open={activando}
        onOpenChange={setActivando}
        onActivada={(codigo) => setCodigoAMostrar(codigo)}
      />
      <DesactivarProteccionModal open={desactivando} onOpenChange={setDesactivando} />
      <CambiarPasswordProteccionModal open={cambiandoPassword} onOpenChange={setCambiandoPassword} />
      <GenerarCodigoModal open={generandoCodigo} onOpenChange={setGenerandoCodigo} onGenerado={(codigo) => setCodigoAMostrar(codigo)} />
      <CodigoRecuperacionModal open={!!codigoAMostrar} codigo={codigoAMostrar} onCerrar={() => setCodigoAMostrar(null)} />
    </Card>
  );
}

function ActivarProteccionModal({
  open,
  onOpenChange,
  onActivada
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onActivada: (codigo: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activar = useActivarProteccion();

  function cerrar() {
    onOpenChange(false);
    setPassword("");
    setConfirmarPassword("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.trim().length === 0) return setError("La contraseña no puede estar vacía.");
    if (password !== confirmarPassword) return setError("Las contraseñas no coinciden.");
    try {
      const { codigoRecuperacion } = await activar.mutateAsync({ password, confirmarPassword });
      cerrar();
      onActivada(codigoRecuperacion);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && cerrar()} title="Crear contraseña" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-carbon/60">
          Esta contraseña va a proteger el acceso a Estadísticas y Cuentas para cualquiera que use Densz.
        </p>
        <FormField label="Contraseña">
          <Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label="Confirmar contraseña">
          <Input type="password" value={confirmarPassword} onChange={(e) => setConfirmarPassword(e.target.value)} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={activar.isPending}>
            {activar.isPending ? "Activando…" : "Activar protección"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DesactivarProteccionModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const desactivar = useDesactivarProteccion();

  function cerrar() {
    onOpenChange(false);
    setPassword("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await desactivar.mutateAsync(password);
      cerrar();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && cerrar()} title="Desactivar protección" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-carbon/60">
          Al desactivar esta protección, cualquier usuario con acceso a Densz podrá entrar a Estadísticas y Cuentas sin
          contraseña.
        </p>
        <FormField label="Contraseña actual">
          <Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="destructive" disabled={!password || desactivar.isPending}>
            {desactivar.isPending ? "Desactivando…" : "Desactivar protección"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CambiarPasswordProteccionModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarNueva, setConfirmarNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cambiar = useCambiarPasswordProteccion();

  function cerrar() {
    onOpenChange(false);
    setPasswordActual("");
    setPasswordNueva("");
    setConfirmarNueva("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva.trim().length === 0) return setError("La contraseña no puede estar vacía.");
    if (passwordNueva !== confirmarNueva) return setError("Las contraseñas no coinciden.");
    try {
      await cambiar.mutateAsync({ passwordActual, passwordNueva, confirmarNueva });
      cerrar();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && cerrar()} title="Cambiar contraseña" size="sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Contraseña actual">
          <Input autoFocus type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} />
        </FormField>
        <FormField label="Nueva contraseña">
          <Input type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} />
        </FormField>
        <FormField label="Confirmar nueva contraseña">
          <Input type="password" value={confirmarNueva} onChange={(e) => setConfirmarNueva(e.target.value)} />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cambiar.isPending}>
            {cambiar.isPending ? "Guardando…" : "Guardar nueva contraseña"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GenerarCodigoModal({
  open,
  onOpenChange,
  onGenerado
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerado: (codigo: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const generar = useGenerarCodigoProteccion();

  async function onConfirmar() {
    setError(null);
    try {
      const { codigoRecuperacion } = await generar.mutateAsync();
      onOpenChange(false);
      onGenerado(codigoRecuperacion);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Generar nuevo código de recuperación" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-carbon/60">
          Esto invalida el código de recuperación actual — si todavía lo tenés guardado, dejará de servir. Vas a recibir
          uno nuevo para reemplazarlo.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirmar} disabled={generar.isPending}>
            {generar.isPending ? "Generando…" : "Generar nuevo código"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
