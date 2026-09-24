import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStore } from "../store/uiStore";

/** Atajos globales de Densz. Esc para cerrar modales lo maneja Radix por su cuenta. */
export function useGlobalShortcuts(): void {
  const setBusquedaAbierta = useUiStore((s) => s.setBusquedaAbierta);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrlOCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOCmd) return;

      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusquedaAbierta(true);
      } else if (e.key.toLowerCase() === "n") {
        // No pisa el "abrir ventana nueva" del navegador si el foco está en un input de texto libre.
        const activo = document.activeElement;
        const enCampoLibre = activo?.tagName === "TEXTAREA";
        if (enCampoLibre) return;
        e.preventDefault();
        navigate("/trabajos/nuevo");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setBusquedaAbierta, navigate]);
}
