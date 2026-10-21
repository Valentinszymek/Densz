import { DenszLogo } from "../../components/brand/DenszLogo";
import { SeccionSuscripcion } from "../Configuracion/SeccionSuscripcion";
import { useLogout } from "../../features/auth/hooks";

/**
 * Pantalla de bloqueo duro (docs/PLAN_COMERCIAL_DENSZ.md §7) — reemplaza
 * TODA la app (sin sidebar, ver RutaSuscripcionActiva.tsx) cuando el
 * trial venció o la suscripción no está activa. Reutiliza
 * SeccionSuscripcion (misma lógica de elegir/cambiar plan que
 * Configuración) para no duplicar el flujo de checkout — acá solo cambia
 * el contenedor, de una tarjeta más dentro de Configuración a la pantalla
 * completa.
 */
export default function SuscripcionVencida() {
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 py-12">
      <DenszLogo height={90} className="mb-6" />
      <h1 className="text-carbon text-xl font-medium mb-2 text-center">Tu acceso a Densz está pausado</h1>
      <p className="text-carbon/50 text-sm mb-8 text-center max-w-sm">
        Tu período de prueba terminó o tu suscripción no está activa. Elegí un plan para seguir usando Densz — tus datos siguen
        guardados.
      </p>

      <div className="w-full max-w-lg">
        <SeccionSuscripcion />
      </div>

      <button
        type="button"
        onClick={() => logout.mutate()}
        className="text-carbon/40 text-xs mt-8 hover:text-carbon/70 transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
