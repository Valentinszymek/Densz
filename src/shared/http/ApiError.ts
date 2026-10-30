/** Error HTTP tipado, compartido entre todas las implementaciones de
 * `DenszApi` basadas en HTTP (web vía `fetch` del navegador, escritorio vía
 * `fetch` del proceso principal de Electron) — nunca esconde el `status`
 * real ni el mensaje que mandó el backend. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
