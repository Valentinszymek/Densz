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

// Variantes en UTC de los formatos de arriba, para columnas `date` de
// Postgres (sin hora, ej. ordenes.fecha_trabajo): esas llegan como
// "YYYY-MM-DD" puro, una fecha de calendario sin instante asociado. Si se
// formatean con el huso horario del navegador, un usuario en UTC-3 ve el
// día anterior (medianoche UTC = 21hs del día previo en Argentina). Estas
// variantes fuerzan UTC tanto al construir el Date como al formatearlo,
// para que el día de calendario nunca se mueva.
const formatoFechaUTC = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC"
});

const formatoFechaHoraUTC = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

const formatoFechaHoraCompletaUTC = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC"
});

/** Formatea centavos a un string de moneda. Nunca convierte entre monedas:
 * solo formatea el número tal como está guardado (ej: 22000000 ARS ->
 * "$220.000,00"; 10000 USD -> "US$100.00"). */
export function formatearMoneda(centavos: number, moneda: Moneda = "ARS"): string {
  return moneda === "USD" ? formatoUSD.format(centavos / 100) : formatoARS.format(centavos / 100);
}

/** True si el string trae un componente de hora real (timestamp). Falso
 * para una fecha de calendario pura tipo "YYYY-MM-DD" (columna `date`). */
function tieneHora(fechaIso: string): boolean {
  return fechaIso.includes("T") || fechaIso.includes(":");
}

/** Convierte fecha ISO/SQL a un Date válido para formatear en la UI.
 * Con hora (timestamp): se interpreta como UTC, igual que antes.
 * Sin hora (columna `date`, "YYYY-MM-DD" puro): se ancla a medianoche UTC;
 * SIEMPRE hay que formatearla con un formato en modo UTC (ver
 * `formatearSegunHora`), para que el día de calendario no se corra según
 * el huso horario del navegador. */
function aFechaLocal(fechaIso: string): Date {
  if (!tieneHora(fechaIso)) return new Date(`${fechaIso}T00:00:00Z`);
  // SQLite guarda "YYYY-MM-DD HH:MM:SS" (UTC); Date necesita el separador "T" + "Z".
  const normalizado = fechaIso.includes("T") ? fechaIso : `${fechaIso.replace(" ", "T")}Z`;
  return new Date(normalizado);
}

function formatearSegunHora(
  fechaIso: string,
  formatoLocal: Intl.DateTimeFormat,
  formatoUTC: Intl.DateTimeFormat
): string {
  const formato = tieneHora(fechaIso) ? formatoLocal : formatoUTC;
  return formato.format(aFechaLocal(fechaIso));
}

export function formatearFecha(fechaIso: string): string {
  return formatearSegunHora(fechaIso, formatoFecha, formatoFechaUTC);
}

export function formatearFechaHora(fechaIso: string): string {
  return formatearSegunHora(fechaIso, formatoFechaHora, formatoFechaHoraUTC);
}

export function formatearFechaHoraCompleta(fechaIso: string): string {
  return formatearSegunHora(fechaIso, formatoFechaHoraCompleta, formatoFechaHoraCompletaUTC);
}
