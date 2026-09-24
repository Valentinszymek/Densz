export type PeriodoId = "hoy" | "semana" | "mes" | "mes_anterior" | "anio" | "personalizado";

export interface Periodo {
  id: PeriodoId;
  label: string;
}

export const PERIODOS: Periodo[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "mes_anterior", label: "Mes anterior" },
  { id: "anio", label: "Este año" },
  { id: "personalizado", label: "Personalizado" }
];

export function aISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calcula el rango [desde, hasta] (inclusive) para un período predefinido. */
export function rangoDePeriodo(id: PeriodoId, personalizado?: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const hoy = new Date();

  switch (id) {
    case "hoy":
      return { desde: aISO(hoy), hasta: aISO(hoy) };
    case "semana": {
      const inicio = new Date(hoy);
      const diaSemana = (inicio.getDay() + 6) % 7; // lunes = 0
      inicio.setDate(inicio.getDate() - diaSemana);
      return { desde: aISO(inicio), hasta: aISO(hoy) };
    }
    case "mes": {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { desde: aISO(inicio), hasta: aISO(hoy) };
    }
    case "mes_anterior": {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: aISO(inicio), hasta: aISO(fin) };
    }
    case "anio": {
      const inicio = new Date(hoy.getFullYear(), 0, 1);
      return { desde: aISO(inicio), hasta: aISO(hoy) };
    }
    case "personalizado":
      return personalizado ?? { desde: aISO(hoy), hasta: aISO(hoy) };
  }
}

/** El "período anterior" es la ventana de igual duración inmediatamente
 * anterior al rango dado — sirve para la comparación del §13, sea cual sea
 * el período elegido (incluido "personalizado"). */
export function rangoAnterior(rango: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const desde = new Date(rango.desde + "T00:00:00");
  const hasta = new Date(rango.hasta + "T00:00:00");
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;

  const nuevaHasta = new Date(desde);
  nuevaHasta.setDate(nuevaHasta.getDate() - 1);
  const nuevaDesde = new Date(nuevaHasta);
  nuevaDesde.setDate(nuevaDesde.getDate() - (dias - 1));

  return { desde: aISO(nuevaDesde), hasta: aISO(nuevaHasta) };
}
