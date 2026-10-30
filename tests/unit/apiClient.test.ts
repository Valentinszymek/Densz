import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * apiClient.ts es el cliente HTTP del escritorio hacia Railway (plan de
 * seguridad del escritorio, Etapa 2) — corre en el proceso principal de
 * Electron, pero no depende de ninguna API de Electron (BrowserWindow,
 * dialog, etc.), así que se puede testear por completo con un `fetch`
 * simulado, sin levantar nada real. `apiSessionStorage.ts` (el archivo
 * local donde se guarda el token) también se mockea — lo que importa acá
 * es que apiClient lo use correctamente, no volver a probar fs.
 */

const storageMock = vi.hoisted(() => ({
  leerTokenGuardado: vi.fn<[], string | null>(() => null),
  guardarToken: vi.fn<[string], void>(),
  borrarTokenGuardado: vi.fn<[], void>()
}));

vi.mock("../../src/main/services/apiSessionStorage", () => storageMock);

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
    headers: { get: (nombre: string) => headers[nombre] ?? null }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.resetModules();
    storageMock.leerTokenGuardado.mockReturnValue(null);
    storageMock.guardarToken.mockClear();
    storageMock.borrarTokenGuardado.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET simple: arma la URL con DENSZ_API_URL y, sin sesión, no manda Authorization", async () => {
    const fetchMock = mockFetchOnce(200, [{ id: 1, nombre: "Dr. Test" }]);
    const { apiClient } = await import("../../src/main/services/apiClient");

    const resultado = await apiClient.odontologosListar();
    expect(resultado).toEqual([{ id: 1, nombre: "Dr. Test" }]);

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/odontologos");
    expect((opciones.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("después de un login exitoso, manda Authorization: Bearer <sesionId> en el siguiente pedido", async () => {
    mockFetchOnce(200, { usuarioId: 1, nombreUsuario: "admin", nombreCompleto: "Admin", rolNombre: "ADMINISTRADOR", permisos: ["*"], laboratorioId: 1, sesionId: "sesion-abc-123" });
    const { apiClient } = await import("../../src/main/services/apiClient");

    const sesion = await apiClient.authLogin("admin", "clave");
    // El sesionId nunca se filtra al llamador — lo consume este archivo solo.
    expect(sesion).not.toHaveProperty("sesionId");
    expect(sesion.usuarioId).toBe(1);
    expect(storageMock.guardarToken).toHaveBeenCalledWith("sesion-abc-123");

    const fetchMock = mockFetchOnce(200, []);
    await apiClient.odontologosListar();
    const [, opciones] = fetchMock.mock.calls[0];
    expect((opciones.headers as Record<string, string>).Authorization).toBe("Bearer sesion-abc-123");
  });

  it("restaura el token guardado al reiniciar (módulo recién importado) sin necesidad de loguearse de nuevo", async () => {
    storageMock.leerTokenGuardado.mockReturnValue("token-persistido-de-antes");
    const fetchMock = mockFetchOnce(200, []);
    const { apiClient } = await import("../../src/main/services/apiClient");

    await apiClient.odontologosListar();
    const [, opciones] = fetchMock.mock.calls[0];
    expect((opciones.headers as Record<string, string>).Authorization).toBe("Bearer token-persistido-de-antes");
  });

  it("un 401 borra el token guardado y avisa vía alExpirarSesion", async () => {
    storageMock.leerTokenGuardado.mockReturnValue("token-vencido");
    mockFetchOnce(401, { error: "No hay una sesión activa." });
    const { apiClient, alExpirarSesion } = await import("../../src/main/services/apiClient");

    const aviso = vi.fn();
    alExpirarSesion(aviso);

    await expect(apiClient.odontologosListar()).rejects.toThrow("No hay una sesión activa.");
    expect(storageMock.borrarTokenGuardado).toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledOnce();

    // Y el pedido siguiente ya no manda el token borrado.
    const fetchMock = mockFetchOnce(200, []);
    await apiClient.odontologosListar();
    const [, opciones] = fetchMock.mock.calls[0];
    expect((opciones.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("logout: llama a POST /auth/logout y limpia el token guardado aunque el pedido falle", async () => {
    storageMock.leerTokenGuardado.mockReturnValue("token-activo");
    mockFetchOnce(500, { error: "falla inesperada" });
    const { apiClient } = await import("../../src/main/services/apiClient");

    await expect(apiClient.authLogout()).rejects.toThrow();
    expect(storageMock.borrarTokenGuardado).toHaveBeenCalled();
  });

  it("pagosRegistrar: un 409 se traduce a { creado: false, posibleDuplicado: true }, nunca se propaga como error", async () => {
    mockFetchOnce(409, { error: "Posible pago duplicado." });
    const { apiClient } = await import("../../src/main/services/apiClient");

    const resultado = await apiClient.pagosRegistrar({
      odontologoId: 1,
      fecha: "2026-01-01",
      importeCentavos: 100000,
      moneda: "ARS",
      medioPagoId: 1
    });
    expect(resultado).toEqual({ creado: false, posibleDuplicado: true });
  });

  it("un error de red (fetch rechaza) se traduce a un ApiError claro, nunca una excepción cruda", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    const { apiClient } = await import("../../src/main/services/apiClient");

    await expect(apiClient.odontologosListar()).rejects.toThrow(/no se pudo conectar/i);
  });

  it("getBuffer devuelve un Buffer de Node con el contenido binario, con el token en el header", async () => {
    storageMock.leerTokenGuardado.mockReturnValue("token-pdf");
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("%PDF-contenido-falso").buffer,
      headers: { get: () => null }
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiClient } = await import("../../src/main/services/apiClient");

    const buffer = await apiClient.getBuffer("/comprobantes/1/pdf");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe("%PDF-contenido-falso");
    const [, opciones] = fetchMock.mock.calls[0];
    expect((opciones.headers as Record<string, string>).Authorization).toBe("Bearer token-pdf");
  });

  it("respeta DENSZ_API_URL cuando está configurada", async () => {
    const original = process.env.DENSZ_API_URL;
    process.env.DENSZ_API_URL = "https://densz-backend-real.up.railway.app";
    try {
      const fetchMock = mockFetchOnce(200, []);
      const { apiClient } = await import("../../src/main/services/apiClient");
      await apiClient.odontologosListar();
      expect(fetchMock.mock.calls[0][0]).toBe("https://densz-backend-real.up.railway.app/odontologos");
    } finally {
      if (original === undefined) delete process.env.DENSZ_API_URL;
      else process.env.DENSZ_API_URL = original;
    }
  });
});
