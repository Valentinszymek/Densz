/**
 * Límite de intentos de login — corrección post-auditoría (§23.5/§30-D de
 * docs/AUDITORIA_MAESTRA_DENSZ.md): `POST /auth/login` no tenía ningún
 * freno ante intentos repetidos.
 *
 * Diseño (deliberadamente simple, sin dependencia nueva — no hacía falta
 * ninguna para esto): un `Map` en memoria del propio proceso, igual patrón
 * que ya usa `src/server/session.ts` para las sesiones HTTP. Se limita por
 * **nombre de usuario intentado**, no por IP: Railway corre detrás de un
 * proxy y confiar en la IP sin configurar `trust proxy` correctamente
 * podría, si se hace mal, terminar bloqueando a TODOS los usuarios reales
 * por igual (todos entrarían con la misma IP del proxy) — exactamente lo
 * que la consigna pide evitar ("no romper el login normal", "no bloquear
 * accidentalmente a un usuario legítimo"). Limitar por usuario es más
 * simple, no depende de la topología de red del hosting, y ataca el
 * escenario real más probable para un sistema chico como Densz: adivinar
 * la contraseña de un usuario puntual ya conocido.
 *
 * Una ventana de tiempo (no un bloqueo permanente): pasado el período, se
 * resetea sola. Un login CORRECTO también limpia el contador de ese
 * usuario al instante — un usuario legítimo que se equivocó dos veces y
 * después entró bien no queda penalizado.
 */

const MAX_INTENTOS_FALLIDOS = 5;
const VENTANA_MS = 15 * 60 * 1000; // 15 minutos

interface EstadoIntentos {
  intentos: number;
  primerIntentoEn: number;
}

const intentosPorUsuario = new Map<string, EstadoIntentos>();

function normalizar(nombreUsuario: string): string {
  return nombreUsuario.trim().toLowerCase();
}

function ventanaVencida(estado: EstadoIntentos): boolean {
  return Date.now() - estado.primerIntentoEn > VENTANA_MS;
}

/** true si este usuario ya superó el máximo de intentos fallidos dentro de la ventana actual. */
export function estaBloqueadoPorIntentos(nombreUsuario: string): boolean {
  const clave = normalizar(nombreUsuario);
  const estado = intentosPorUsuario.get(clave);
  if (!estado) return false;
  if (ventanaVencida(estado)) {
    intentosPorUsuario.delete(clave);
    return false;
  }
  return estado.intentos >= MAX_INTENTOS_FALLIDOS;
}

/** Suma un intento fallido para este usuario (abre una ventana nueva si no había una vigente). */
export function registrarIntentoFallido(nombreUsuario: string): void {
  const clave = normalizar(nombreUsuario);
  const estado = intentosPorUsuario.get(clave);
  if (!estado || ventanaVencida(estado)) {
    intentosPorUsuario.set(clave, { intentos: 1, primerIntentoEn: Date.now() });
    return;
  }
  estado.intentos += 1;
}

/** Limpia el contador de este usuario — se llama tras un login correcto. */
export function limpiarIntentos(nombreUsuario: string): void {
  intentosPorUsuario.delete(normalizar(nombreUsuario));
}

/** Mismo mensaje genérico sea cual sea el usuario — nunca revela si existe o no. */
export const MENSAJE_BLOQUEADO_POR_INTENTOS = "Demasiados intentos. Esperá unos minutos e intentá de nuevo.";

/** Solo para tests: vacía todo el estado entre corridas. */
export function reiniciarLimiteDeIntentos(): void {
  intentosPorUsuario.clear();
}
