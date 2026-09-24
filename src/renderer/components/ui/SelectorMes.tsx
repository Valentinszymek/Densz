import { ChevronLeft, ChevronRight } from "lucide-react";

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

interface SelectorMesProps {
  anio: number;
  /** 1-12 */
  mes: number;
  onChange: (anio: number, mes: number) => void;
}

/** Selector de período mensual (mes/año) con flechas para ir al mes
 * anterior/siguiente — usado en Cuentas para el resumen de facturación
 * que se le manda al odontólogo/clínica a fin de mes. */
export function SelectorMes({ anio, mes, onChange }: SelectorMesProps) {
  function irAMes(deltaMeses: number) {
    const indiceAbsoluto = anio * 12 + (mes - 1) + deltaMeses;
    onChange(Math.floor(indiceAbsoluto / 12), (indiceAbsoluto % 12) + 1);
  }

  const anioActual = new Date().getFullYear();
  const anios = Array.from({ length: 6 }, (_, i) => anioActual - 4 + i);

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => irAMes(-1)}
        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-carbon/15 text-carbon/50 hover:text-carbon hover:border-carbon/30"
        title="Mes anterior"
      >
        <ChevronLeft size={15} />
      </button>
      <select
        value={mes}
        onChange={(e) => onChange(anio, Number(e.target.value))}
        className="h-9 rounded-lg border border-carbon/15 bg-cream-card px-2.5 text-sm"
      >
        {NOMBRES_MES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>
            {nombre}
          </option>
        ))}
      </select>
      <select
        value={anio}
        onChange={(e) => onChange(Number(e.target.value), mes)}
        className="h-9 rounded-lg border border-carbon/15 bg-cream-card px-2.5 text-sm"
      >
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => irAMes(1)}
        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-carbon/15 text-carbon/50 hover:text-carbon hover:border-carbon/30"
        title="Mes siguiente"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
