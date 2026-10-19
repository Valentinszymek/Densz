import type { Queryable } from "../db/types";
import { buscarUsuarioParaLoginGoogle } from "../db/repositories/usuariosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { cargarSesionDesdeUsuario, type SesionActual } from "./sessionService";
import { fijarLaboratorioEnConexion } from "../db/tenantContext";
import { withTransaction } from "../db/withTransaction";
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
 * La búsqueda por supabase_user_id/email corre a través de TODOS los
 * laboratorios a la vez — a propósito, la única consulta de todo el
 * sistema que necesita mirar más allá del laboratorio actual (todavía no
 * se sabe cuál es). Con RLS activa eso es imposible de resolver con una
 * consulta normal, así que `buscarUsuarioParaLoginGoogle` la sortea con
 * una función de Postgres `SECURITY DEFINER` acotada solo a este paso
 * (ver usuariosRepo.ts) — nunca para leer datos de negocio.
 */
export async function loginConGoogle(db: Queryable, identidad: IdentidadGoogle): Promise<SesionActual> {
  const credencialesInvalidas = () =>
    new DenszError("No hay ninguna cuenta de Densz asociada a este email todavía. Pedile a un administrador que te cargue como usuario primero.");

  const usuario = await buscarUsuarioParaLoginGoogle(db, identidad.supabaseUserId, identidad.email);
  if (!usuario) throw credencialesInvalidas();

  if (!usuario.activo) throw credencialesInvalidas();

  // Ya se sabe a qué laboratorio pertenece. Todo lo que sigue corre
  // DENTRO de una única transacción (una sola conexión física) — si no,
  // `fijarLaboratorioEnConexion` y las consultas de después (auditoría,
  // re-fetch de cargarSesionDesdeUsuario) podrían terminar en conexiones
  // DISTINTAS del pool, y las de después nunca verían el laboratorio
  // recién fijado (ver tenantContext.ts).
  return withTransaction(db, async (client) => {
    await fijarLaboratorioEnConexion(client, usuario.laboratorioId);

    await cargarSesionDesdeUsuario(client, usuario.id);
    await registrarAuditoria(client, { usuarioId: usuario.id, accion: "login_google", entidad: "usuarios", entidadId: usuario.id });

    return {
      usuarioId: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      nombreCompleto: usuario.nombreCompleto,
      rolNombre: usuario.rolNombre,
      permisos: usuario.permisos,
      laboratorioId: usuario.laboratorioId
    };
  });
}
