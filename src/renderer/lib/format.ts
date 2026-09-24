import type { Moneda } from "@shared/types/entities";

const formatoARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// currencyDisplay "code" (=> "USD 100.00") en vez del símbolo "$" default:
// en una lista que puede mezclar ARS y USD, "$" ambiguo para ambas monedas
// sería exactamente el error que esta reforma busca evitar.
const formatoUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const formatoFechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

// Con segundos — solo para el detalle de un evento puntual (Auditoría);
// la tabla se mantiene compacta sin segundos.
const formatoFechaHoraCompleta = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** Formatea centavos a un string de moneda. Nunca convierte entre monedas:
 * solo formatea el número tal como está guardado (ej: 22000000 ARS ->
 * "$220.000,00"; 10000 USD -> "US$100.00"). */
export function formatearMoneda(centavos: number, moneda: Moneda = "ARS"): string {
  return moneda === "USD" ? formatoUSD.format(centavos / 100) : formatoARS.format(centavos / 100);
}

/** Convierte fecha ISO/SQL (UTC) a un Date válido para formatear en la UI. */
function aFechaLocal(fechaIso: string): Date {
  // SQLite guarda "YYYY-MM-DD HH:MM:SS" (UTC); Date necesita el separador "T" + "Z".
  const normalizado = fechaIso.includes("T") ? fechaIso : `${fechaIso.replace(" ", "T")}Z`;
  return new Date(normalizado);
}

export function formatearFecha(fechaIso: string): string {
  return formatoFecha.format(aFechaLocal(fechaIso));
}

export function formatearFechaHora(fechaIso: string): string {
  return formatoFechaHora.format(aFechaLocal(fechaIso));
}

export function formatearFechaHoraCompleta(fechaIso: string): string {
  return formatoFechaHoraCompleta.format(aFechaLocal(fechaIso));
}
