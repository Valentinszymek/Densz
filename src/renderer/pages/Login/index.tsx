import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { SeleccionUsuario } from "./SeleccionUsuario";
import { IngresoPassword } from "./IngresoPassword";
import type { UsuarioParaSeleccion } from "@shared/types/entities";

const CLAVE_ULTIMO_USUARIO = "densz.login.ultimoUsuario";

export default function Login() {
  const sesion = useAuthStore((s) => s.sesion);
  const { data: usuarios } = useUsuariosDisponibles();
  const [seleccionado, setSeleccionado] = useState<UsuarioParaSeleccion | null>(null);
  const [yaIntentoRestaurar, setYaIntentoRestaurar] = useState(false);

  // Preselecciona el último usuario elegido (comodidad, nunca la
  // contraseña) — si no existe más o ya no está activo, simplemente no
  // preselecciona nada y se ve el selector normal.
  useEffect(() => {
    if (yaIntentoRestaurar || !usuarios) return;
    setYaIntentoRestaurar(true);
    try {
      const ultimo = localStorage.getItem(CLAVE_ULTIMO_USUARIO);
      const encontrado = ultimo ? usuarios.find((u) => u.nombreUsuario === ultimo) : undefined;
      if (encontrado) setSeleccionado(encontrado);
    } catch {
      // localStorage puede no estar disponible (ventana privada, storage
      // bloqueado) — no es crítico, el selector simplemente no preselecciona.
    }
  }, [usuarios, yaIntentoRestaurar]);

  // Si ya hay sesión activa (login recién exitoso, o sesión restaurada al
  // arrancar), no tiene sentido seguir mostrando el selector/login.
  if (sesion) return <Navigate to="/" replace />;

  function seleccionar(u: UsuarioParaSeleccion) {
    setSeleccionado(u);
    try {
      localStorage.setItem(CLAVE_ULTIMO_USUARIO, u.nombreUsuario);
    } catch {
      // Ver comentario arriba.
    }
  }

  if (seleccionado) {
    return <IngresoPassword usuario={seleccionado} onCambiarUsuario={() => setSeleccionado(null)} />;
  }
  return <SeleccionUsuario onSeleccionar={seleccionar} />;
}
