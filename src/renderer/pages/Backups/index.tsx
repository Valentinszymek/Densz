import { CloudCog } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";

export default function Backups() {
  return (
    <div>
      <PageHeader title="Backups" description="Los datos de Densz ahora viven en Supabase, no en un archivo local." />
      <EmptyState
        icon={<CloudCog size={28} />}
        title="El backup local ya no aplica"
        description="Densz guarda todos los datos en un proyecto de Supabase. La continuidad y las copias de seguridad dependen del respaldo del proyecto de Supabase, no de un archivo local en esta computadora."
      />
    </div>
  );
}
