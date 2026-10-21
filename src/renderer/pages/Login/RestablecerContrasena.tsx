import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { supabase } from "../../lib/supabaseClient";

/**
 * Supabase redirige acá (mismo mecanismo PKCE que CallbackGoogle.tsx)
 * después de que la persona toca el link de recuperación del email — el
 * cliente de supabase-js canjea el `?code=...` solo y queda con una
 * sesión temporal de recuperación. Desde acá solo se permite UNA cosa:
 * elegir la contraseña nueva (`updateUser`) — nunca se manda nada al
 * backend de Densz con esta sesión (es de Supabase, no de Densz).
 */
export default function RestablecerContrasena() {
  const navigate = useNavigate();
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);
  const yaProceso = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setError("La recuperación de contraseña no está configurada en este entorno.");
      return;
    }

    function marcarListo() {
      if (yaProceso.current) return;
      yaProceso.current = true;
      setListo(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) marcarListo();
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) marcarListo();
    });

    const timeoutId = window.setTimeout(() => {
      if (!yaProceso.current) setError("El link de recuperación venció o no es válido — pedí uno nuevo.");
    }, 10000);

    return () => {
      suscripcion.subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña tiene que tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    try {
      const { error: errUpdate } = await supabase!.auth.updateUser({ password });
      if (errUpdate) throw errUpdate;
      setExito(true);
      await supabase!.auth.signOut();
      window.setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12 text-center">
      <DenszLogo height={100} className="mb-8" />

      {error && (
        <>
          <p className="text-red-400 text-sm max-w-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="text-cream/60 text-sm underline underline-offset-2 hover:text-cream"
          >
            Volver al login
          </button>
        </>
      )}

      {!error && !listo && <p className="text-cream/60 text-sm">Verificando el link…</p>}

      {!error && listo && exito && <p className="text-cream/70 text-sm max-w-xs">Contraseña actualizada. Ya podés iniciar sesión…</p>}

      {!error && listo && !exito && (
        <div className="w-full max-w-xs flex flex-col gap-3 text-left">
          <h1 className="text-cream/80 text-lg font-medium text-center mb-2">Elegí tu contraseña nueva</h1>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña nueva"
              autoFocus
              autoComplete="new-password"
              className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repetí la contraseña"
              autoComplete="new-password"
              className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-gold text-carbon font-medium px-5 py-3 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
