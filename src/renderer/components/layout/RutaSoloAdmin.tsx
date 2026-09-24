import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

/** Redirige a Inicio si la sesión activa no es ADMINISTRADOR — evita que
 * RECEPCION llegue a una sección restringida escribiendo la ruta a mano,
 * aunque el link esté oculto en el sidebar (§ "no confiar solo en el
 * renderer": esto es una comodidad de navegación, la validación real pasa
 * siempre por requerirPermiso en el proceso main). */
export function RutaSoloAdmin() {
  const esAdmin = useAuthStore((s) => s.sesion?.rolNombre === "ADMINISTRADOR");
  if (!esAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
