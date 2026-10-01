import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { usePaciente, useCantidadTrabajosPaciente } from "../../features/pacientes/hooks";
import { formatearFecha } from "../../lib/format";

// Ficha de SOLO CONSULTA (Bloque 1-B) — ver comentario en Pacientes/index.tsx.
export default function PacienteDetalle() {
  const { id } = useParams();
  const idNum = Number(id);
  const { data: paciente, isLoading } = usePaciente(idNum);
  const { data: cantidadTrabajos } = useCantidadTrabajosPaciente(idNum);

  if (isLoading) return <p className="text-carbon/40 text-sm">Cargando…</p>;
  if (!paciente) return <p className="text-carbon/40 text-sm">Paciente no encontrado.</p>;

  return (
    <div>
      <Link to="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4">
        <ArrowLeft size={15} /> Pacientes
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-carbon">{paciente.nombreCompleto}</h1>
            <Badge tono={paciente.activo ? "exito" : "neutral"}>{paciente.activo ? "Activo" : "Inactivo"}</Badge>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-carbon/50">
            <Link to={`/odontologos/${paciente.odontologoId}`} className="hover:text-carbon hover:underline">
              {paciente.odontologoNombre}
            </Link>
            <span>Alta: {formatearFecha(paciente.fechaAlta)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <ClipboardList size={13} /> Trabajos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-display">{cantidadTrabajos ?? "—"}</p>
              {cantidadTrabajos !== undefined &&
                (cantidadTrabajos > 0 ? (
                  <Link to={`/trabajos?paciente=${paciente.id}`} className="text-sm text-gold-dim hover:underline shrink-0">
                    Ver trabajos →
                  </Link>
                ) : (
                  <span className="text-sm text-carbon/40 shrink-0">Sin trabajos</span>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
