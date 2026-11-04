import type { UsuarioParaSeleccion } from "@shared/types/entities";

/**
 * "Recordar esta computadora" para el paso de Google/email+contraseña del
 * login web (pedido explícito del dueño del producto, 2026-11-04): una vez
 * que ESTA compu ya verificó de qué laboratorio es (via Google o
 * email+contraseña — ver SeleccionUsuario.tsx), guarda esa lista de
 * usuarios localmente para que la próxima vez que se abra Densz en la
 * MISMA compu/navegador salte directo a elegir perfil, sin volver a pedir
 * Google. Una compu NUEVA (sin este localStorage) sigue viendo el flujo
 * completo desde cero.
 *
 * Esto no afloja la seguridad real: lo único que evita repetir es la
 * verificación de "a qué laboratorio pertenece esta compu", nunca la
 * contraseña de cada usuario — esa la sigue pidiendo el backend contra la
 * base real en cada login, así que una tarjeta vieja/desactivada en esta
 * lista cacheada simplemente fallaría al intentar entrar con ella.
 */

const CLAVE = "densz.login.usuariosLaboratorio";

export function leerUsuariosLaboratorioCache(): UsuarioParaSeleccion[] | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as UsuarioParaSeleccion[]) : null;
  } catch {
    return null;
  }
}

export function guardarUsuariosLaboratorioCache(usuarios: UsuarioParaSeleccion[]): void {
  try {
    if (usuarios.length > 0) localStorage.setItem(CLAVE, JSON.stringify(usuarios));
  } catch {
    // localStorage puede no estar disponible (ventana privada, storage
    // bloqueado) — sin cache, simplemente vuelve a pedir Google cada vez.
  }
}

export function borrarUsuariosLaboratorioCache(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Ver comentario arriba.
  }
}
