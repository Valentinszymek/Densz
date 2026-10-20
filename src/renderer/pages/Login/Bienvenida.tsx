import { Tags, ClipboardList, Receipt, Landmark } from "lucide-react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import capturaDashboard from "../../assets/landing/dashboard.jpg";
import capturaTrabajos from "../../assets/landing/trabajos.jpg";
import capturaPrecios from "../../assets/landing/precios.jpg";
import demoGif from "../../assets/landing/densz-demo.gif";

const PASOS = [
  {
    icon: Tags,
    titulo: "Cargá tus precios",
    descripcion: "Categorías, prestaciones y listas — en la moneda que uses, una sola vez."
  },
  {
    icon: ClipboardList,
    titulo: "Registrá un trabajo",
    descripcion: "Elegí odontólogo, paciente y prestación. El precio se congela solo."
  },
  {
    icon: Receipt,
    titulo: "Facturá y cobrá",
    descripcion: "Comprobante numerado al instante, imprimible desde donde estés."
  },
  {
    icon: Landmark,
    titulo: "Controlá las cuentas",
    descripcion: "Saldo de cada odontólogo y clínica, siempre al día, sin planillas aparte."
  }
];

const CAPTURAS = [
  { src: capturaDashboard, alt: "Panel principal de Densz con el resumen operativo del mes" },
  { src: capturaTrabajos, alt: "Listado de trabajos con número de OT, paciente y total" },
  { src: capturaPrecios, alt: "Listas de precios por categoría y prestación" }
];

/** Ventana de navegador en miniatura, para que las capturas reales de la
 * app se vean como "producto" y no como un recorte suelto. */
function MarcoCaptura({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-cream/10 bg-carbon shadow-xl">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-cream/[0.04] border-b border-cream/10">
        <span className="h-2 w-2 rounded-full bg-cream/20" />
        <span className="h-2 w-2 rounded-full bg-cream/20" />
        <span className="h-2 w-2 rounded-full bg-cream/20" />
      </div>
      <img src={src} alt={alt} className="w-full block" />
    </div>
  );
}

function BotonesCta({ onIniciarSesion, onCrearLaboratorio }: { onIniciarSesion: () => void; onCrearLaboratorio: () => void }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none justify-center">
      <button
        type="button"
        onClick={onCrearLaboratorio}
        className="rounded-lg bg-gold text-carbon font-medium px-6 py-3 text-sm hover:bg-gold/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-carbon"
      >
        Crear mi laboratorio
      </button>
      <button
        type="button"
        onClick={onIniciarSesion}
        className="rounded-lg border border-cream/15 bg-cream/[0.03] text-cream/80 font-medium px-6 py-3 text-sm hover:bg-cream/[0.06] hover:border-gold/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Iniciar sesión
      </button>
    </div>
  );
}

/** Primer paso del login: dos caminos bien separados, nunca un mismo
 * botón de Google haciendo las dos cosas en silencio (pedido explícito
 * del dueño del producto). Hoy también cumple el rol de landing pública
 * — es lo primero que ve cualquiera que entre a Densz sin sesión, así
 * que además del hero con los dos CTAs, explica qué es y cómo se usa
 * antes de pedir nada. "Iniciar sesión" lleva al flujo de siempre
 * (SeleccionUsuario); "Crear mi laboratorio" es el alta nueva (trial
 * gratis — el precio final todavía no está definido, se agrega cuando
 * exista Stripe). */
export function Bienvenida({
  onIniciarSesion,
  onCrearLaboratorio
}: {
  onIniciarSesion: () => void;
  onCrearLaboratorio: () => void;
}) {
  return (
    <div className="min-h-screen bg-carbon">
      {/* Hero — compacto, para que quien ya conoce Densz entre rápido sin tener que bajar. */}
      <div className="flex flex-col items-center justify-center px-6 pt-16 pb-14 text-center">
        <DenszLogo height={110} className="mb-6" />
        <h1 className="text-cream text-2xl sm:text-3xl font-medium mb-3 max-w-lg text-balance">
          La gestión de tu laboratorio dental, en un solo lugar.
        </h1>
        <p className="text-cream/50 text-sm mb-8 max-w-sm">
          Precios, trabajos, facturación y cuentas corrientes — todo conectado, sin planillas sueltas.
        </p>
        <BotonesCta onIniciarSesion={onIniciarSesion} onCrearLaboratorio={onCrearLaboratorio} />
        <p className="text-cream/30 text-xs mt-6">¿Laboratorio nuevo? Empezá gratis — sin tarjeta, en minutos.</p>
      </div>

      {/* Cómo funciona */}
      <div className="border-t border-cream/10 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-cream text-lg font-medium text-center mb-10">Cómo funciona</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PASOS.map((paso, i) => {
              const Icon = paso.icon;
              return (
                <div key={paso.titulo} className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
                      <Icon size={16} />
                    </span>
                    <span className="text-gold-dim text-xs font-medium">Paso {i + 1}</span>
                  </div>
                  <p className="text-cream text-sm font-medium mb-1">{paso.titulo}</p>
                  <p className="text-cream/45 text-xs leading-relaxed">{paso.descripcion}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Demo animado + capturas reales */}
      <div className="border-t border-cream/10 px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-cream text-lg font-medium text-center mb-2">Así se ve por dentro</h2>
          <p className="text-cream/40 text-sm text-center mb-10">Pantallas reales de Densz, con datos de ejemplo.</p>

          <div className="max-w-3xl mx-auto mb-8">
            <MarcoCaptura src={demoGif} alt="Recorrido animado por el panel, trabajos, precios y cuentas de Densz" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CAPTURAS.map((c) => (
              <MarcoCaptura key={c.alt} src={c.src} alt={c.alt} />
            ))}
          </div>
        </div>
      </div>

      {/* Cierre */}
      <div className="border-t border-cream/10 px-6 py-16 flex flex-col items-center text-center">
        <h2 className="text-cream text-xl font-medium mb-3">Empezá cuando quieras</h2>
        <p className="text-cream/45 text-sm mb-8 max-w-sm">
          Creá tu laboratorio gratis y probalo con tus propios datos — sin compromiso.
        </p>
        <BotonesCta onIniciarSesion={onIniciarSesion} onCrearLaboratorio={onCrearLaboratorio} />
      </div>
    </div>
  );
}
