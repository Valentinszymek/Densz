/* Logger mínimo. En fases posteriores puede redirigirse a archivo en
 * getUserDataDir()/logs, pero para la Fase 1 alcanza con consola. */
export const logger = {
  info: (msg: string, ...rest: unknown[]) => console.log(`[densz] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`[densz] ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`[densz] ${msg}`, ...rest)
};
