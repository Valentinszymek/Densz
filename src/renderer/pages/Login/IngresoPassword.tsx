import { useState, type FormEvent } from "react";
import { ArrowLeft, LogIn } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { useLogin } from "../../features/auth/hooks";
import type { UsuarioParaSeleccion } from "@shared/types/entities";

/** Paso 2 del login: la selección visual del paso 1 NO autentica a nadie
 * — recién acá se manda usuario+contraseña al flujo real existente
 * (useLogin → authLogin → authService.login → bcrypt → sesión → rol →
 * permisos), sin atajos ni casos especiales por usuario. */
export function IngresoPassword({
  usuario,
  onCambiarUsuario
}: {
  usuario: UsuarioParaSeleccion;
  onCambiarUsuario: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const inicial = usuario.nombreCompleto.trim().charAt(0).toUpperCase() || "?";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ nombreUsuario: usuario.nombreUsuario, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    }
  }

  return (
    <div className="min-h-screen bg-carbon flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-8">
          <DenszLogo height={110} />
        </div>

        <div className="rounded-xl bg-cream-card border border-cream/10 shadow-lg p-6">
          <div className="flex flex-col items-center mb-6">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold text-xl font-semibold mb-3">
              {inicial}
            </span>
            <p className="text-base font-medium text-carbon text-center">Hola, {usuario.nombreCompleto}</p>
            <p className="text-xs text-carbon/40 font-mono">@{usuario.nombreUsuario}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Contraseña</Label>
              <Input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              <LogIn size={15} /> {login.isPending ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <button
            type="button"
            onClick={onCambiarUsuario}
            className="mt-5 flex items-center gap-1.5 text-xs text-carbon/45 hover:text-gold-dim mx-auto"
          >
            <ArrowLeft size={12} /> Cambiar usuario
          </button>
        </div>
      </div>
    </div>
  );
}
