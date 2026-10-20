import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { supabase } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";

/**
 * Google redirige acá (PKCE) después de que la persona aceptó el login.
 * El `?code=...` que manda Supabase NUNCA lo leemos nosotros a mano: el
 * cliente de supabase-js, al crearse (ver supabaseClient.ts), ya lo
 * detecta y canjea solo apenas carga el módulo (`detectSessionInUrl`,
 * default `true`) — y limpia la URL después. Por eso acá no se parsea
 * nada de `window.location`: se escucha el evento `SIGNED_IN` (o, si ya
 * pasó antes de que este componente montara, se lee la sesión ya
 * establecida con `getSession()`).
 *
 * Una vez que supabase-js tiene sesión:
 * 1. Se manda el access token al backend de Densz
 *    (window.densz.authLoginGoogle, o authRegistrarseConGoogle si venía
 *    de "Crear mi laboratorio" — ver `labName` abajo) — lo revalida y
 *    arma la sesión REAL de Densz (la cookie propia), la única que
 *    importa de acá en más.
 * 2. Se cierra la sesión de Supabase del lado del cliente (ya cumplió su
 *    propósito).
 *
 * `labName`: si la persona vino de RegistroLaboratorio.tsx, el nombre
 * tipeado viaja en la query string (`?labName=...#/auth/callback`, ver
 * supabaseClient.ts) — nunca se pisa con el `?code=...` que agrega
 * Supabase, así que sigue disponible acá sin guardar nada entre medio.
 */
export default function CallbackGoogle() {
  const navigate = useNavigate();
  const setSesion = useAuthStore((s) => s.setSesion);
  const [error, setError] = useState<string | null>(null);
  // Evita procesar la sesión dos veces (ej. StrictMode, o que el evento
  // dispare más de una vez) — el access token de Densz no debe pedirse
  // dos veces para la misma sesión de Google.
  const yaProceso = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setError("Login con Google no está configurado en este entorno.");
      return;
    }

    async function completarLoginDensz(accessToken: string) {
      if (yaProceso.current) return;
      yaProceso.current = true;
      try {
        const labName = new URLSearchParams(window.location.search).get("labName");
        const sesion = labName
          ? await window.densz.authRegistrarseConGoogle(labName, accessToken)
          : await window.densz.authLoginGoogle(accessToken);
        setSesion(sesion);
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar el login con Google.");
      } finally {
        await supabase!.auth.signOut();
      }
    }

    // Si supabase-js ya terminó de procesar la URL antes de este montaje.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void completarLoginDensz(data.session.access_token);
    });

    // Caso normal: todavía está procesando, se entera por este evento.
    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "SIGNED_IN" && sesion) void completarLoginDensz(sesion.access_token);
    });

    // Si en 10s no pasó nada (ni ya había sesión, ni llegó el evento), es
    // que algo salió mal con el intercambio — nunca dejar a la persona
    // esperando para siempre en "Completando…".
    const timeoutId = window.setTimeout(() => {
      if (!yaProceso.current) setError("No se pudo completar el login con Google (tiempo de espera agotado).");
    }, 10000);

    return () => {
      suscripcion.subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [navigate, setSesion]);

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12 text-center">
      <DenszLogo height={100} className="mb-8" />
      {error ? (
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
      ) : (
        <p className="text-cream/60 text-sm">Completando el login con Google…</p>
      )}
    </div>
  );
}
