import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type TonoBadge = "neutral" | "exito" | "advertencia" | "error" | "gold";

const TONOS: Record<TonoBadge, string> = {
  neutral: "bg-carbon/6 text-carbon/70",
  exito: "bg-emerald-600/10 text-emerald-700",
  advertencia: "bg-amber-500/10 text-amber-700",
  error: "bg-red-600/10 text-red-700",
  gold: "bg-gold/15 text-gold-dim"
};

export function Badge({
  tono = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tono?: TonoBadge }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONOS[tono],
        className
      )}
      {...props}
    />
  );
}
