import { useEffect, useState } from "react";
import { Input } from "./Input";

interface CurrencyInputProps {
  valueCentavos: number;
  onChangeCentavos: (centavos: number) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Símbolo mostrado a la izquierda — "$" (ARS) por defecto, "US$" para listas en dólares. */
  simbolo?: string;
}

function centavosATexto(centavos: number): string {
  if (!centavos) return "";
  return (centavos / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function textoACentavos(texto: string): number {
  const limpio = texto.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const numero = Number.parseFloat(limpio);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/** Input de moneda: el usuario escribe pesos ("22.000,00"), el valor real son centavos enteros. */
export function CurrencyInput({ valueCentavos, onChangeCentavos, autoFocus, placeholder, simbolo = "$" }: CurrencyInputProps) {
  const [texto, setTexto] = useState(centavosATexto(valueCentavos));

  useEffect(() => {
    setTexto(centavosATexto(valueCentavos));
    // Solo al montar / cuando cambia externamente de forma relevante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCentavos]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/40 text-sm">{simbolo}</span>
      <Input
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder ?? "0,00"}
        className={simbolo.length > 1 ? "pl-9 text-right tabular-nums" : "pl-6 text-right tabular-nums"}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const centavos = textoACentavos(texto);
          setTexto(centavosATexto(centavos));
          onChangeCentavos(centavos);
        }}
      />
    </div>
  );
}
