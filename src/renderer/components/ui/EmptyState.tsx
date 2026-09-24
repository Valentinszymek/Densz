import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 rounded-xl border border-dashed border-carbon/15 bg-carbon/[0.015] px-8 py-16",
        className
      )}
    >
      {icon && <div className="text-gold-dim opacity-70">{icon}</div>}
      <p className="text-base font-medium text-carbon">{title}</p>
      {description && <p className="text-sm text-carbon/50 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
