import type { Queryable } from "../db/types";
import { buscarUsuarioParaLoginGoogle, listarRoles } from "../db/repositories/usuariosRepo";
import { crearLista } from "../db/repositories/listasPrecioRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { cargarSesionDesdeUsuario, getSesionActual, type SesionActual } from "./sessionService";
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
 * Nota: `identidad` puede venir de Google o de email+contraseña (Supabase
 * Auth) por igual — `verificarTokenGoogle` (googleAuth.ts) solo valida el
 * access token de Supabase, sin importar qué proveedor lo generó.
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
    new DenszError("No hay ninguna cuenta de Densz asociada a este email todavía. Si tu laboratorio es nuevo, registrate desde \"Crear mi laboratorio\"; si ya trabajás en un laboratorio existente, pedile a un administrador que te cargue como usuario.");

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

    // cargarSesionDesdeUsuario ya armó la sesión completa (incluido
    // superAdmin) — se devuelve esa, nunca una reconstruida a mano, para
    // que no se puedan desincronizar.
    return getSesionActual()!;
  });
}

/**
 * Alta de laboratorio nuevo ("Crear mi laboratorio" / registro con email):
 * si la identidad ya está vinculada a un laboratorio existente, es
 * exactamente `loginConGoogle` (no es un error elegir "crear" con una
 * cuenta ya conocida — entra directo a lo suyo). Si no, crea todo en una
 * sola transacción: el laboratorio (trial de 30 días — decisión comercial,
 * ver docs/PLAN_COMERCIAL_DENSZ.md §0 —, placeholder de estado hasta que
 * entre el proveedor de pago real), un usuario ADMINISTRADOR vinculado a
 * esa identidad, y el seed mínimo para operar — mismo patrón ya probado en
 * tests/helpers/testDb.ts's `crearLaboratorioDePrueba`.
 */
export async function registrarseConGoogle(
  db: Queryable,
  identidad: IdentidadGoogle,
  nombreLaboratorio: string
): Promise<SesionActual> {
  const usuario = await buscarUsuarioParaLoginGoogle(db, identidad.supabaseUserId, identidad.email);
  if (usuario) {
    return loginConGoogle(db, identidad);
  }

  const nombre = nombreLaboratorio.trim();
  if (!nombre) {
    throw new DenszError("Ingresá el nombre de tu laboratorio.");
  }

  return withTransaction(db, async (client) => {
    const { rows: labRows } = await client.query<{ id: number }>(
      `INSERT INTO laboratorios (nombre, email_contacto, plan, estado_suscripcion, trial_termina_en, activo)
       VALUES ($1, $2, 'trial', 'trialing', to_char((now() AT TIME ZONE 'UTC') + interval '30 days', 'YYYY-MM-DD HH24:MI:SS'), 1)
       RETURNING id`,
      [nombre, identidad.email]
    );
    const laboratorioId = labRows[0].id;

    // A partir de acá, toda inserción en esta misma conexión cae en este
    // laboratorio por el DEFAULT de `laboratorio_id` (NULLIF-safe, ver
    // tenantContext.ts) — nunca hace falta pasarlo a mano.
    await fijarLaboratorioEnConexion(client, laboratorioId);

    const roles = await listarRoles(client);
    const rolAdmin = roles.find((r) => r.nombre === "ADMINISTRADOR");
    if (!rolAdmin) throw new DenszError("No se encontró el rol de administrador.");

    const { rows: usuarioRows } = await client.query<{ id: number }>(
      `INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol_id, email, supabase_user_id, activo)
       VALUES ('admin', $1, 'google-oauth-sin-password', $2, $3, $4, 1)
       RETURNING id`,
      [identidad.nombreCompleto, rolAdmin.id, identidad.email, identidad.supabaseUserId]
    );
    const usuarioId = usuarioRows[0].id;

    await crearLista(client, { nombre: "General", moneda: "ARS" });

    await client.query(
      `INSERT INTO numeradores (tipo, prefijo, digitos, ultimo_numero, laboratorio_id) VALUES
       ('orden', 'OT-', 8, 0, $1), ('comprobante', 'CB-', 8, 0, $1)`,
      [laboratorioId]
    );

    await cargarSesionDesdeUsuario(client, usuarioId);
    await registrarAuditoria(client, {
      usuarioId,
      accion: "alta_laboratorio",
      entidad: "laboratorios",
      entidadId: laboratorioId
    });

    // Igual que loginConGoogle: se devuelve la sesión ya armada por
    // cargarSesionDesdeUsuario (incluido superAdmin), nunca una
    // reconstruida a mano.
    return getSesionActual()!;
  });
}
