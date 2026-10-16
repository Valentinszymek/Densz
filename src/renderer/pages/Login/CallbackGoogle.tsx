import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { supabase } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";

/**
 * Google redirige acá (PKCE: `?code=...` como query param real, ver
 * supabaseClient.ts sobre por qué no el fragmento `#...`) después de que
 * la persona aceptó el login en la pantalla de Google. Esta pantalla:
 * 1. Intercambia ese código por una sesión de Supabase (supabase-js).
 * 2. Manda el access token resultante al backend de Densz
 *    (window.densz.authLoginGoogle) — que lo revalida y arma la sesión
 *    REAL de Densz (la cookie propia), la única que importa de acá en
 *    más.
 * 3. Cierra la sesión de Supabase del lado del cliente (ya cumplió su
 *    propósito — Densz no la vuelve a necesitar).
 */
export default function CallbackGoogle() {
  const navigate = useNavigate();
  const setSesion = useAuthStore((s) => s.setSesion);
  const [error, setError] = useState<string | null>(null);
  // Evita procesar el código dos veces (ej. StrictMode monta/desmonta el
  // efecto dos veces en desarrollo) — un código de autorización de
  // Google/Supabase solo se puede canjear una vez.
  const yaProceso = useRef(false);

  useEffect(() => {
    if (yaProceso.current) return;
    yaProceso.current = true;

    async function procesar() {
      if (!supabase) {
        setError("Login con Google no está configurado en este entorno.");
        return;
      }
      const code = new URLSearchParams(window.location.search).get("code");
      if (!code) {
        setError("No se encontró el código de Google en la respuesta.");
        return;
      }
      try {
        const { data, error: errorIntercambio } = await supabase.auth.exchangeCodeForSession(code);
        if (errorIntercambio || !data.session) {
          throw errorIntercambio ?? new Error("No se pudo completar el login con Google.");
        }
        const sesion = await window.densz.authLoginGoogle(data.session.access_token);
        setSesion(sesion);
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar el login con Google.");
      } finally {
        await supabase.auth.signOut();
      }
    }
    void procesar();
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
