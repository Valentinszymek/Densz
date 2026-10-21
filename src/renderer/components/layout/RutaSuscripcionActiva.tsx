import { Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { suscripcionActiva } from "../../../shared/utils/suscripcion";
import SuscripcionVencida from "../../pages/Billing/SuscripcionVencida";

/**
 * Bloqueo duro por suscripción inactiva (docs/PLAN_COMERCIAL_DENSZ.md
 * §7) — va DESPUÉS de RutaProtegida (necesita sesión) y ANTES de
 * AppShell (así la pantalla de bloqueo nunca muestra sidebar/navegación,
 * que llevaría a páginas que el servidor igual va a rechazar con 402).
 *
 * Esto es solo UX: la verificación real vive en el servidor
 * (requireActiveSubscription.ts) — un cliente modificado que se saltee
 * este guard igual recibe 402 en cada pedido de negocio.
 *
 * Un superAdmin (dueño del producto) siempre pasa, igual que en el
 * servidor — nunca queda bloqueado por el estado de su propio laboratorio.
 */
export function RutaSuscripcionActiva() {
  const sesion = useAuthStore((s) => s.sesion);
  if (sesion?.superAdmin) return <Outlet />;
  if (sesion && !suscripcionActiva(sesion.facturacion ?? null)) return <SuscripcionVencida />;
  return <Outlet />;
}
