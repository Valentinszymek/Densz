import { cn } from "../../lib/cn";

/** Interruptor ON/OFF simple, en la misma paleta carbón/dorado del resto
 * de Densz — no hay ningún otro toggle en la app todavía, este es el
 * primero (protección de Estadísticas/Cuentas). */
export function Toggle({
  activo,
  onChange,
  disabled,
  label
}: {
  activo: boolean;
  onChange: (activo: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
        activo ? "bg-gold" : "bg-carbon/15",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          activo ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
