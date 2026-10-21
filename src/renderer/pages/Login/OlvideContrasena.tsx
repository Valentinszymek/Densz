import { useState, type FormEvent } from "react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { solicitarRecuperacionContrasena } from "../../lib/supabaseClient";

/** Recuperación de contraseña para cuentas con email+contraseña (o
 * Google, usando el mismo email) — solo tiene sentido en la web, el
 * escritorio nunca tiene este camino porque el login principal ahí es
 * username/bcrypt (ver IngresoPassword.tsx) o Google directo. Siempre
 * muestra el mismo mensaje de éxito, exista o no la cuenta — nunca
 * revela si un email está registrado. */
export function OlvideContrasena({ onVolver }: { onVolver: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await solicitarRecuperacionContrasena(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={100} className="mb-8" />
      <h1 className="text-cream/80 text-lg font-medium mb-1 text-center">Recuperar contraseña</h1>
      <p className="text-cream/40 text-sm mb-8 text-center max-w-xs">
        Ingresá el email con el que te registraste — si existe una cuenta, te llegará un link para elegir una contraseña nueva.
      </p>

      <div className="w-full max-w-xs flex flex-col gap-3">
        {enviado ? (
          <p className="text-cream/70 text-sm text-center bg-cream/[0.04] rounded-lg px-4 py-3">
            Si ese email tiene una cuenta en Densz, te enviamos un link para restablecer la contraseña. Revisá tu bandeja (y spam).
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoFocus
              required
              className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream placeholder:text-cream/30 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-gold text-carbon font-medium px-5 py-3 text-sm hover:bg-gold/90 transition-colors disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar link de recuperación"}
            </button>
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          </form>
        )}

        <button type="button" onClick={onVolver} className="text-cream/40 text-xs mt-2 hover:text-cream/70 transition-colors">
          ← Volver
        </button>
      </div>
    </div>
  );
}
