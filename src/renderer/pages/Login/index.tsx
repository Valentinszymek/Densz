import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { Bienvenida } from "./Bienvenida";
import { SeleccionUsuario } from "./SeleccionUsuario";
import { IngresoPassword } from "./IngresoPassword";
import { RegistroLaboratorio } from "./RegistroLaboratorio";
import { OlvideContrasena } from "./OlvideContrasena";
import type { UsuarioParaSeleccion } from "@shared/types/entities";

const CLAVE_ULTIMO_USUARIO = "densz.login.ultimoUsuario";

type Vista = "bienvenida" | "seleccion" | "password" | "registro" | "olvide";

export default function Login() {
  const sesion = useAuthStore((s) => s.sesion);
  const location = useLocation();
  // CallbackGoogle.tsx manda acá la lista YA resuelta y aislada al
  // laboratorio de la cuenta de Google verificada (ver
  // auth.route.ts#usuarios-del-laboratorio) — cuando viene, es la única
  // fuente de la verdad para el selector, nunca el endpoint viejo sin
  // laboratorio (useUsuariosDisponibles, que no filtra nada y no es
  // confiable en un sistema multi-laboratorio). Sin ella (primera vez
  // que se entra, sin pasar todavía por Google), no hay ningún usuario
  // que mostrar — el selector solo ofrece Google/email+contraseña.
  const usuariosDelLaboratorio = (location.state as { usuariosDelLaboratorio?: UsuarioParaSeleccion[] } | null)
    ?.usuariosDelLaboratorio;
  // En escritorio el selector sigue siendo el mecanismo principal de
  // login (sin pasar por Google) — ahí sí tiene sentido pedir la lista
  // vieja sin filtrar apenas se entra. En la web, en cambio, NUNCA se
  // pide sin antes pasar por Google (ver comentario arriba): mostrar
  // usuarios de un laboratorio sin haber verificado nada es, en un
  // sistema multi-laboratorio, el problema que esto vino a resolver.
  const esEscritorio = window.densz.plataforma === "escritorio";
  const { data: usuariosSinFiltrar } = useUsuariosDisponibles({ enabled: esEscritorio && usuariosDelLaboratorio === undefined });
  const usuarios = usuariosDelLaboratorio ?? (esEscritorio ? usuariosSinFiltrar : undefined);
  const [vista, setVista] = useState<Vista>(usuariosDelLaboratorio ? "seleccion" : "bienvenida");
  const [seleccionado, setSeleccionado] = useState<UsuarioParaSeleccion | null>(null);
  const [yaIntentoRestaurar, setYaIntentoRestaurar] = useState(false);

  // Preselecciona el último usuario elegido (comodidad, nunca la
  // contraseña) — si no existe más o ya no está activo, simplemente no
  // preselecciona nada y se ve la bienvenida normal. Si se encuentra, se
  // salta directo a la pantalla de contraseña (sin pasar por la
  // bienvenida) — es quien ya usaba Densz, no alguien nuevo.
  useEffect(() => {
    if (yaIntentoRestaurar || !usuarios) return;
    setYaIntentoRestaurar(true);
    try {
      const ultimo = localStorage.getItem(CLAVE_ULTIMO_USUARIO);
      const encontrado = ultimo ? usuarios.find((u) => u.nombreUsuario === ultimo) : undefined;
      if (encontrado) {
        setSeleccionado(encontrado);
        setVista("password");
      }
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
    setVista("password");
    try {
      localStorage.setItem(CLAVE_ULTIMO_USUARIO, u.nombreUsuario);
    } catch {
      // Ver comentario arriba.
    }
  }

  if (vista === "bienvenida") {
    return <Bienvenida onIniciarSesion={() => setVista("seleccion")} onCrearLaboratorio={() => setVista("registro")} />;
  }

  if (vista === "registro") {
    return <RegistroLaboratorio onVolver={() => setVista("bienvenida")} />;
  }

  if (vista === "olvide") {
    return <OlvideContrasena onVolver={() => setVista("seleccion")} />;
  }

  if (vista === "password" && seleccionado) {
    return (
      <IngresoPassword
        usuario={seleccionado}
        onCambiarUsuario={() => {
          setSeleccionado(null);
          setVista("seleccion");
        }}
      />
    );
  }

  return <SeleccionUsuario usuarios={usuarios} onSeleccionar={seleccionar} onOlvideContrasena={() => setVista("olvide")} />;
}
