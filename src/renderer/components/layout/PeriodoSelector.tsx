import { PERIODOS, type PeriodoId } from "../../lib/periodos";
import { Input } from "../ui/Input";
import { cn } from "../../lib/cn";

interface PeriodoSelectorProps {
  periodo: PeriodoId;
  onChangePeriodo: (id: PeriodoId) => void;
  personalizado: { desde: string; hasta: string };
  onChangePersonalizado: (r: { desde: string; hasta: string }) => void;
}

export function PeriodoSelector({ periodo, onChangePeriodo, personalizado, onChangePersonalizado }: PeriodoSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-carbon/15 bg-cream-card p-1">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChangePeriodo(p.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              periodo === p.id ? "bg-carbon text-gold" : "text-carbon/60 hover:bg-carbon/5"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {periodo === "personalizado" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={personalizado.desde}
            onChange={(e) => onChangePersonalizado({ ...personalizado, desde: e.target.value })}
            className="w-36"
          />
          <span className="text-carbon/40 text-xs">a</span>
          <Input
            type="date"
            value={personalizado.hasta}
            onChange={(e) => onChangePersonalizado({ ...personalizado, hasta: e.target.value })}
            className="w-36"
          />
        </div>
      )}
    </div>
  );
}
