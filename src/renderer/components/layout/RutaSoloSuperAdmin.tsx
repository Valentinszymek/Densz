import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

/** Redirige a Inicio si la sesión activa no es el dueño del producto
 * Densz (ver SesionActual#superAdmin) — nunca confundir con
 * RutaSoloAdmin, que es por-laboratorio. Misma lógica que esa: comodidad
 * de navegación, la validación real vive en el proceso main/servidor
 * (requireSuperAdmin). */
export function RutaSoloSuperAdmin() {
  const esSuperAdmin = useAuthStore((s) => s.sesion?.superAdmin === true);
  if (!esSuperAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
