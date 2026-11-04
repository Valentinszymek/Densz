import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useUsuariosDisponibles } from "../../features/auth/hooks";
import { leerUsuariosLaboratorioCache, guardarUsuariosLaboratorioCache, borrarUsuariosLaboratorioCache } from "../../lib/usuariosLaboratorioCache";
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
  // auth.route.ts#usuarios-del-laboratorio) — recién verificada en ESTA
  // vuelta. Sin ella, se cae al cache local de esta misma compu (ver
  // usuariosLaboratorioCache.ts — pedido explícito del dueño del
  // producto, 2026-11-04: una compu que YA verificó una vez no debe
  // volver a pedir Google cada vez, una compu nueva sí). En ningún caso
  // se usa el endpoint viejo sin laboratorio (useUsuariosDisponibles, que
  // no filtra nada y no es confiable en un sistema multi-laboratorio).
  const usuariosRecienVerificados = (location.state as { usuariosDelLaboratorio?: UsuarioParaSeleccion[] } | null)
    ?.usuariosDelLaboratorio;
  // En escritorio el selector sigue siendo el mecanismo principal de
  // login (sin pasar por Google) — ahí sí tiene sentido pedir la lista
  // vieja sin filtrar apenas se entra, y el cache de abajo no aplica.
  const esEscritorio = window.densz.plataforma === "escritorio";
  const usuariosCacheados = !esEscritorio ? leerUsuariosLaboratorioCache() : null;
  const usuariosVerificados = usuariosRecienVerificados ?? usuariosCacheados ?? undefined;
  const { data: usuariosSinFiltrar } = useUsuariosDisponibles({ enabled: esEscritorio && usuariosVerificados === undefined });
  const usuarios = usuariosVerificados ?? (esEscritorio ? usuariosSinFiltrar : undefined);
  const [vista, setVista] = useState<Vista>(usuariosVerificados ? "seleccion" : "bienvenida");
  const [seleccionado, setSeleccionado] = useState<UsuarioParaSeleccion | null>(null);
  const [yaIntentoRestaurar, setYaIntentoRestaurar] = useState(false);

  // Guarda en el cache de esta compu apenas se resuelve una lista nueva
  // (recién verificada por Google, o por email+contraseña dentro de
  // SeleccionUsuario — que también escribe acá) — así la PRÓXIMA vez que
  // se abra Densz en esta misma compu ya está disponible sin Google.
  useEffect(() => {
    if (usuariosRecienVerificados && usuariosRecienVerificados.length > 0) {
      guardarUsuariosLaboratorioCache(usuariosRecienVerificados);
    }
  }, [usuariosRecienVerificados]);

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

  // "Esta no es mi cuenta" / cambiar de laboratorio en esta compu — borra
  // el cache local y vuelve a pedir Google desde cero (ver SeleccionUsuario.tsx).
  function olvidarEstaCompu() {
    borrarUsuariosLaboratorioCache();
    setVista("bienvenida");
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

  return (
    <SeleccionUsuario
      usuarios={usuarios}
      // Ya se verificó (recién con Google, o esta compu ya lo había
      // hecho antes) y SÍ hay tarjetas para elegir: mostrar de nuevo el
      // botón de Google (o el email+contraseña) ahí abajo es redundante.
      ocultarOtrosMetodos={!!usuariosVerificados?.length}
      // Solo tiene sentido ofrecerlo cuando las tarjetas salen del cache
      // de esta compu (no recién verificadas) — es la única situación
      // donde "cambiar de cuenta" significa algo distinto de simplemente
      // tocar "Continuar con Google" de nuevo.
      onCambiarLaboratorio={usuariosCacheados && !usuariosRecienVerificados ? olvidarEstaCompu : undefined}
      onSeleccionar={seleccionar}
      onOlvideContrasena={() => setVista("olvide")}
    />
  );
}
