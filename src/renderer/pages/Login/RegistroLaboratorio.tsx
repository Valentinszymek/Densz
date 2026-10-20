import { useState } from "react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { supabaseAuthDisponible, iniciarLoginGoogle } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";

/** Alta de laboratorio nuevo: un campo de texto + "Continuar con
 * Google" — el nombre tipeado viaja con el round-trip de Google (ver
 * supabaseClient.ts) en la web, o se manda directo en escritorio (que
 * hace todo el trámite de Google él solo, sin redirect de pestaña). Si
 * la cuenta de Google ya pertenece a un laboratorio existente, no es un
 * error: el backend loguea directo a ese laboratorio (googleAuthService.ts). */
export function RegistroLaboratorio({ onVolver }: { onVolver: () => void }) {
  const setSesion = useAuthStore((s) => s.setSesion);
  const [nombreLaboratorio, setNombreLaboratorio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const esEscritorio = window.densz.plataforma === "escritorio";

  async function onClickGoogle() {
    const nombre = nombreLaboratorio.trim();
    if (!nombre) {
      setError("Ingresá el nombre de tu laboratorio.");
      return;
    }
    setError(null);
    setCargando(true);
    try {
      if (esEscritorio) {
        const sesion = await window.densz.authRegistrarseConGoogle(nombre);
        setSesion(sesion);
        setCargando(false);
      } else {
        await iniciarLoginGoogle(nombre); // redirige la pestaña
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el registro con Google.");
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={100} className="mb-8" />
      <h1 className="text-cream/80 text-lg font-medium mb-1 text-center">Crear mi laboratorio</h1>
      <p className="text-cream/40 text-sm mb-8 text-center max-w-xs">¿Cómo se llama tu laboratorio?</p>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="text"
          value={nombreLaboratorio}
          onChange={(e) => setNombreLaboratorio(e.target.value)}
          placeholder="Nombre de tu laboratorio"
          autoFocus
          className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        />

        {(supabaseAuthDisponible || esEscritorio) ? (
          <button
            type="button"
            onClick={onClickGoogle}
            disabled={cargando}
            className="rounded-lg bg-gold text-carbon font-medium px-5 py-3 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
          >
            {cargando ? (esEscritorio ? "Esperando el navegador…" : "Redirigiendo…") : "Continuar con Google"}
          </button>
        ) : (
          <p className="text-cream/40 text-xs text-center">Login con Google no está configurado en este entorno.</p>
        )}

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <button type="button" onClick={onVolver} className="text-cream/40 text-xs mt-2 hover:text-cream/70 transition-colors">
          ← Volver
        </button>
      </div>
    </div>
  );
}
