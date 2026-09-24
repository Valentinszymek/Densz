// Formato de moneda/fecha usado en documentos generados por el proceso
// main (PDFs). Duplica lo esencial de src/renderer/lib/format.ts a
// propósito: main y renderer son módulos separados, y este archivo es
// mínimo.
import type { Moneda } from "../../shared/types/entities";

const formatoARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// currencyDisplay "code" (=> "USD 100.00") en vez del símbolo "$" default:
// un comprobante o estado de cuenta nunca debe poder confundirse entre
// ARS y USD con el mismo signo "$".
const formatoUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatoFecha = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoFechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** Nunca hace conversión de moneda: solo formatea el número tal como está guardado. */
export function formatearMoneda(centavos: number, moneda: Moneda = "ARS"): string {
  return moneda === "USD" ? formatoUSD.format(centavos / 100) : formatoARS.format(centavos / 100);
}

export function formatearFecha(fechaIso: string): string {
  const normalizado = fechaIso.includes("T") ? fechaIso : `${fechaIso.replace(" ", "T")}Z`;
  return formatoFecha.format(new Date(normalizado));
}

export function formatearFechaHora(fechaIso: string): string {
  const normalizado = fechaIso.includes("T") ? fechaIso : `${fechaIso.replace(" ", "T")}Z`;
  return formatoFechaHora.format(new Date(normalizado));
}
