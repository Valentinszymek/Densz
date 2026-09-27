import { z } from "zod";

/** Convierte "true"/"false" de un query string HTTP a boolean real (o undefined si no vino). */
export const zBooleanQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));
