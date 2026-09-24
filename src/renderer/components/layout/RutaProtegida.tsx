import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

/** Redirige a /login si no hay sesión activa. */
export function RutaProtegida() {
  const sesion = useAuthStore((s) => s.sesion);
  if (!sesion) return <Navigate to="/login" replace />;
  return <Outlet />;
}
