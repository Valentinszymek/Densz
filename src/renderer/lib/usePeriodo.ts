import { useMemo, useState } from "react";
import { rangoDePeriodo, type PeriodoId } from "./periodos";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function usePeriodo(inicial: PeriodoId = "mes") {
  const [periodo, setPeriodo] = useState<PeriodoId>(inicial);
  const [personalizado, setPersonalizado] = useState({ desde: hoyISO(), hasta: hoyISO() });

  const rango = useMemo(() => rangoDePeriodo(periodo, personalizado), [periodo, personalizado]);

  return { periodo, setPeriodo, personalizado, setPersonalizado, rango };
}
