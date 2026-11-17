import { useLocation, useNavigate } from "react-router-dom";

/**
 * "Volver" que respeta el historial real de navegación en vez de un destino
 * fijo — a una página de detalle se puede llegar desde varios lugares (su
 * propio listado, Cuentas, el Dashboard, la búsqueda global), así que un
 * `<Link to="/listado">` siempre te devolvía ahí aunque hubieras entrado
 * desde otro lado. `location.key === "default"` es la forma que da
 * react-router de detectar que esta es la primera entrada del historial
 * (ej. se abrió un link directo) — ahí sí no hay a dónde volver y se usa el
 * destino por defecto.
 */
export function useVolver(destinoPorDefecto: string) {
  const navigate = useNavigate();
  const location = useLocation();

  return () => {
    if (location.key === "default") {
      navigate(destinoPorDefecto);
    } else {
      navigate(-1);
    }
  };
}
