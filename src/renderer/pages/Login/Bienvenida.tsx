import { useState } from "react";
import { Tags, ClipboardList, Receipt, Landmark, Check } from "lucide-react";
import { DenszLogo } from "../../components/brand/DenszLogo";
import { PLANES_COMERCIALES, type PlanId } from "../../../shared/constants/planes";
import { monedaPorDefecto } from "../../lib/moneda";
import type { Moneda } from "@shared/types/entities";
import capturaDashboard from "../../assets/landing/dashboard.jpg";
import capturaTrabajos from "../../assets/landing/trabajos.jpg";
import capturaPrecios from "../../assets/landing/precios.jpg";
import demoGif from "../../assets/landing/densz-demo.gif";

// Precio y nombre salen de la misma fuente que usa el backend para el
// checkout (shared/constants/planes.ts) — acá solo se agrega qué incluye
// cada uno, que es puramente informativo para la landing.
const INCLUYE_POR_PLAN: Record<PlanId, string[]> = {
  essential: [
    "Pacientes, odontólogos y clínicas",
    "Órdenes de trabajo con odontograma FDI",
    "Precios y listas por categoría",
    "Comprobantes de entrega imprimibles",
    "Cuentas corrientes y pagos",
    "Usuarios con roles (Administración / Recepción)"
  ],
  professional: [
    "Todo lo de Essential",
    "Auditoría completa de la actividad",
    "Estadísticas y dashboard",
    "App de escritorio (Windows) con impresión directa",
    "Actualización automática del escritorio",
    "Exportación de datos"
  ]
};

const PLANES = PLANES_COMERCIALES.map((p) => ({
  nombre: p.nombre,
  precioArs: p.precioArs,
  precioUsd: p.precioUsd,
  incluye: INCLUYE_POR_PLAN[p.id]
}));

const PREGUNTAS_FRECUENTES = [
  {
    pregunta: "¿Densz funciona en Argentina y en el exterior?",
    respuesta: "Sí. En Argentina los precios y los cobros son en pesos (ARS); fuera de Argentina, en dólares (USD)."
  },
  {
    pregunta: "¿Necesito tarjeta para probarlo?",
    respuesta: "No. Tenés 30 días gratis para probar Densz con tus propios datos, sin tarjeta."
  },
  {
    pregunta: "¿Qué pasa cuando termina la prueba?",
    respuesta: "Elegís un plan y activás tu suscripción para seguir usando Densz sin interrupciones. Mientras no lo hagas, tus datos quedan guardados."
  },
  {
    pregunta: "¿Mis datos están separados de los de otros laboratorios?",
    respuesta: "Sí — cada laboratorio tiene sus propios datos, aislados a nivel de base de datos del resto."
  },
  {
    pregunta: "¿Puedo usar Densz desde Windows además del navegador?",
    respuesta: "Sí: Professional incluye la app de escritorio, con impresión directa y actualización automática. Essential funciona desde el navegador."
  },
  {
    pregunta: "¿Puedo cambiar de plan o cancelar más adelante?",
    respuesta: "Sí, cuando quieras, desde tu cuenta."
  }
];

function formatearPrecio(valor: number, moneda: Moneda): string {
  return moneda === "ARS" ? `$${valor.toLocaleString("es-AR")}` : `US$${valor.toLocaleString("en-US")}`;
}

function SeccionPlanes({ onCrearLaboratorio }: { onCrearLaboratorio: () => void }) {
  const [moneda, setMoneda] = useState<Moneda>(monedaPorDefecto);

  return (
    <div className="border-t border-cream/10 px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-cream text-lg font-medium text-center mb-2">Planes</h2>
        <p className="text-cream/40 text-sm text-center mb-6">30 días de prueba gratis, sin tarjeta — cancelás cuando quieras.</p>

        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-lg border border-cream/15 p-1 text-xs">
            {(["ARS", "USD"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  moneda === m ? "bg-gold text-carbon font-medium" : "text-cream/50 hover:text-cream/80"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {PLANES.map((plan) => (
            <div key={plan.nombre} className="rounded-xl border border-cream/10 bg-cream/[0.03] p-6 flex flex-col">
              <h3 className="text-cream font-medium mb-1">{plan.nombre}</h3>
              <p className="text-cream text-2xl font-semibold mb-1">
                {formatearPrecio(moneda === "ARS" ? plan.precioArs : plan.precioUsd, moneda)}
                <span className="text-cream/40 text-sm font-normal"> /mes</span>
              </p>
              <ul className="flex-1 space-y-2 my-5">
                {plan.incluye.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-cream/60">
                    <Check size={14} className="text-gold shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onCrearLaboratorio}
                className="rounded-lg bg-gold text-carbon font-medium px-4 py-2.5 text-sm hover:bg-gold/90 transition-colors"
              >
                Empezá gratis
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SeccionPreguntasFrecuentes() {
  return (
    <div className="border-t border-cream/10 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-cream text-lg font-medium text-center mb-10">Preguntas frecuentes</h2>
        <div className="space-y-6">
          {PREGUNTAS_FRECUENTES.map((f) => (
            <div key={f.pregunta}>
              <p className="text-cream text-sm font-medium mb-1">{f.pregunta}</p>
              <p className="text-cream/45 text-sm leading-relaxed">{f.respuesta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

      <SeccionPlanes onCrearLaboratorio={onCrearLaboratorio} />

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

      <SeccionPreguntasFrecuentes />

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
