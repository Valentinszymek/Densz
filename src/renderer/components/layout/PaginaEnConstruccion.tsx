import type { ReactNode } from "react";
import { Hammer } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { EmptyState } from "../ui/EmptyState";

interface PaginaEnConstruccionProps {
  titulo: string;
  descripcion: string;
  fase: string;
  icon?: ReactNode;
}

/**
 * Placeholder honesto para módulos todavía no implementados: no simula
 * datos ni botones funcionales, solo indica en qué fase se construye.
 */
export function PaginaEnConstruccion({ titulo, descripcion, fase, icon }: PaginaEnConstruccionProps) {
  return (
    <div>
      <PageHeader title={titulo} description={descripcion} />
      <EmptyState
        icon={icon ?? <Hammer size={28} />}
        title="Este módulo todavía no está implementado"
        description={`Se construye en la ${fase}, siguiendo el plan de desarrollo del proyecto.`}
      />
    </div>
  );
}
