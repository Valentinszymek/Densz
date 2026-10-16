import type { Queryable } from "../db/types";
import {
  obtenerUsuarioPorSupabaseId,
  obtenerUsuarioPorEmail,
  vincularSupabaseId,
  type UsuarioParaSesionGoogle
} from "../db/repositories/usuariosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { cargarSesionDesdeUsuario, type SesionActual } from "./sessionService";
import { DenszError } from "../utils/errors";

export interface IdentidadGoogle {
  supabaseUserId: string;
  email: string;
  nombreCompleto: string;
}

/**
 * Login con Google (plan multi-laboratorio): a diferencia de
 * authService.login (bcrypt), acá la verificación de identidad YA pasó
 * — quien llama (la ruta /auth/google-callback) ya validó el token
 * contra Supabase Auth antes de llegar hasta acá. Esta función solo
 * resuelve QUÉ usuario de Densz es ese, en dos pasos:
 *
 * 1. Ya vinculado (supabase_user_id coincide) → entra directo.
 * 2. Primer login con Google de un usuario ya existente, cargado con su
 *    email por un administrador → se vincula ahora (una sola vez) y
 *    entra.
 *
 * Si no coincide con ningún usuario existente, todavía NO da de alta un
 * laboratorio nuevo (eso es una etapa aparte, con Stripe de por medio) —
 * tira un error claro en vez de crear algo a medias.
 *
 * NOTA (Etapa 3 del plan, pendiente): esta función busca por
 * supabase_user_id/email a través de TODOS los laboratorios a la vez —
 * es, a propósito, la única consulta de todo el sistema que necesita
 * mirar más allá del laboratorio actual (todavía no se sabe cuál es).
 * Cuando RLS esté activada, este camino va a necesitar correr con una
 * conexión que la sortee para esta búsqueda puntual (ver plan, "Detalle
 * técnico" en Login con Google) — todavía no aplica porque RLS no está
 * prendida.
 */
export async function loginConGoogle(db: Queryable, identidad: IdentidadGoogle): Promise<SesionActual> {
  const credencialesInvalidas = () =>
    new DenszError("No hay ninguna cuenta de Densz asociada a este email todavía. Pedile a un administrador que te cargue como usuario primero.");

  let usuario: UsuarioParaSesionGoogle | null = await obtenerUsuarioPorSupabaseId(db, identidad.supabaseUserId);

  if (!usuario) {
    const porEmail = await obtenerUsuarioPorEmail(db, identidad.email);
    if (!porEmail) throw credencialesInvalidas();
    // Un email ⇒ un laboratorio en esta etapa (ver plan): si ese usuario
    // ya está vinculado a OTRA cuenta de Google, no se re-vincula acá.
    if (porEmail.supabaseUserId && porEmail.supabaseUserId !== identidad.supabaseUserId) {
      throw credencialesInvalidas();
    }
    if (!porEmail.supabaseUserId) {
      await vincularSupabaseId(db, porEmail.id, identidad.supabaseUserId);
    }
    usuario = porEmail;
  }

  if (!usuario.activo) throw credencialesInvalidas();

  await cargarSesionDesdeUsuario(db, usuario.id);
  await registrarAuditoria(db, { usuarioId: usuario.id, accion: "login_google", entidad: "usuarios", entidadId: usuario.id });

  return {
    usuarioId: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    rolNombre: usuario.rolNombre,
    permisos: usuario.permisos,
    laboratorioId: usuario.laboratorioId
  };
}
