import { ZodError } from "zod";

/**
 * Traduce errores técnicos de Postgres (y de validación) a mensajes claros
 * para el usuario. Nunca debe llegar a la UI un código SQLSTATE crudo.
 */
export class DenszError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DenszError";
  }
}

// Códigos SQLSTATE de Postgres relevantes (https://www.postgresql.org/docs/current/errcodes-appendix.html).
const SQLSTATE_FOREIGN_KEY = "23503";
const SQLSTATE_UNIQUE = "23505";
const SQLSTATE_CHECK = "23514";
const SQLSTATE_NOT_NULL = "23502";

export function traducirErrorPostgres(error: unknown): DenszError {
  if (error instanceof ZodError) {
    const primero = error.issues[0];
    return new DenszError(primero?.message ?? "Los datos ingresados no son válidos.", error);
  }

  if (error instanceof DenszError) {
    return error;
  }

  if (error instanceof Error) {
    const codigo = (error as { code?: string }).code;

    if (codigo === SQLSTATE_FOREIGN_KEY) {
      return new DenszError(
        "No se puede completar la acción porque el registro tiene datos relacionados (por ejemplo, trabajos o pagos existentes).",
        error
      );
    }

    if (codigo === SQLSTATE_UNIQUE) {
      return new DenszError("Ya existe un registro con ese valor único.", error);
    }

    if (codigo === SQLSTATE_CHECK || codigo === SQLSTATE_NOT_NULL) {
      return new DenszError("Los datos ingresados no cumplen una regla obligatoria del sistema.", error);
    }
  }

  return new DenszError("Ocurrió un error inesperado. La operación no se completó.", error);
}
