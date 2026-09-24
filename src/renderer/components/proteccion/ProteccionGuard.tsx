import { useEffect, useRef, useState, type FormEvent } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "../ui/Button";
import { FormField, Input } from "../ui/Input";
import { useEstadoProteccion, useDesbloquear, useBloquearProteccion } from "../../features/proteccion/hooks";
import { RecuperarAccesoModal } from "./RecuperarAccesoModal";

/** A qué sección protegida pertenece una ruta, o `null` si no es
 * ninguna — usa prefijo para cubrir también las sub-rutas de cada una
 * (ej. `/cuentas/5`, `/cuentas/clinica/3`) sin considerarlas una salida. */
function seccionProtegidaDe(pathname: string): "cuentas" | "estadisticas" | null {
  if (pathname.startsWith("/cuentas")) return "cuentas";
  if (pathname.startsWith("/estadisticas")) return "estadisticas";
  return null;
}

/**
 * Envuelve las rutas de Estadísticas y Cuentas (§3, §4). Regla
 * fundamental (corrección posterior a la versión original): la
 * autorización NUNCA persiste más allá de la visita actual — nada de
 * sesión, nada de timeout, nada cacheado. El desbloqueo vive como estado
 * local de ESTE componente (`useState`, nunca en una consulta que
 * sobreviva a un remount) y se resetea a "bloqueado":
 *
 * - Cada vez que este componente se monta de cero (primera entrada,
 *   volver desde otra parte de la app, o recargar la página completa).
 * - Cada vez que se cambia de sección protegida sin desmontar (Cuentas
 *   ↔ Estadísticas comparten esta misma ruta padre, así que React Router
 *   no las desmonta entre sí — se detecta el cambio por `pathname`).
 * - Al desmontarse del todo (se sale hacia cualquier otra parte de Densz,
 *   incluido el botón "Atrás").
 *
 * En los tres casos también se llama al backend (`bloquearProteccion`)
 * para que la protección sea real y no solo visual (§10): ningún canal
 * de Estadísticas/Cuentas sigue aceptando llamadas después de esto,
 * aunque alguien intentara invocarlas directamente desde DevTools.
 */
export function ProteccionGuard() {
  const location = useLocation();
  const { data: estado, isLoading: cargandoEstado } = useEstadoProteccion();
  const [desbloqueada, setDesbloqueada] = useState(false);
  const bloquear = useBloquearProteccion();
  const seccionAnteriorRef = useRef<string | null>(null);

  useEffect(() => {
    const seccion = seccionProtegidaDe(location.pathname);
    const primeraVez = seccionAnteriorRef.current === null;
    const cambioDeSeccion = !primeraVez && seccionAnteriorRef.current !== seccion;
    if (primeraVez || cambioDeSeccion) {
      setDesbloqueada(false);
      bloquear.mutate();
    }
    seccionAnteriorRef.current = seccion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      // Se desmonta el guard entero: se salió hacia afuera de Cuentas y
      // Estadísticas (a cualquier otra sección de Densz).
      bloquear.mutate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras no se sabe si la protección está activada, no se muestra
  // nada — así nunca hay un parpadeo mostrando de más ni de menos.
  if (cargandoEstado) return null;

  if (estado?.activada && !desbloqueada) {
    return <AccesoProtegidoScreen onDesbloqueado={() => setDesbloqueada(true)} />;
  }

  return <Outlet />;
}

function AccesoProtegidoScreen({ onDesbloqueado }: { onDesbloqueado: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const desbloquear = useDesbloquear();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ok = await desbloquear.mutateAsync(password);
      if (ok) {
        onDesbloqueado();
      } else {
        setError("Contraseña incorrecta.");
        setPassword("");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[65vh]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gold/10 text-gold-dim mb-3">
            <Lock size={18} />
          </div>
          <h2 className="font-display text-xl text-carbon">Acceso protegido</h2>
          <p className="text-sm text-carbon/50 mt-1">Esta sección requiere contraseña.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Contraseña">
            <Input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={!password || desbloquear.isPending}>
            {desbloquear.isPending ? "Verificando…" : "Ingresar"}
          </Button>
        </form>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setRecuperando(true)}
            className="text-xs text-carbon/45 hover:text-gold-dim hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>

      <RecuperarAccesoModal open={recuperando} onOpenChange={setRecuperando} onRestablecido={onDesbloqueado} />
    </div>
  );
}
