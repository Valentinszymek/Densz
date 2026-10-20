import { DenszLogo } from "../../components/brand/DenszLogo";

/** Primer paso del login: dos caminos bien separados, nunca un mismo
 * botón de Google haciendo las dos cosas en silencio (pedido explícito
 * del dueño del producto). "Iniciar sesión" lleva al flujo de siempre
 * (SeleccionUsuario); "Crear mi laboratorio" es el alta nueva. */
export function Bienvenida({
  onIniciarSesion,
  onCrearLaboratorio
}: {
  onIniciarSesion: () => void;
  onCrearLaboratorio: () => void;
}) {
  return (
    <div className="min-h-screen bg-carbon flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={120} className="mb-6" />
      <p className="text-cream/50 text-sm mb-10 text-center max-w-xs">
        La gestión de tu laboratorio dental, en un solo lugar.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={onIniciarSesion}
          className="rounded-lg bg-gold text-carbon font-medium px-5 py-3 text-sm hover:bg-gold/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={onCrearLaboratorio}
          className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream/80 font-medium px-5 py-3 text-sm hover:bg-cream/[0.06] hover:border-gold/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Crear mi laboratorio
        </button>
      </div>

      <p className="text-cream/30 text-xs mt-10 text-center max-w-xs">
        ¿Laboratorio nuevo? Creá tu cuenta gratis y empezá a usar Densz en minutos.
      </p>
    </div>
  );
}
