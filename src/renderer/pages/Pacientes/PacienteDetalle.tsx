import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePaciente, useCantidadTrabajosPaciente, useEliminarPaciente } from "../../features/pacientes/hooks";
import { formatearFecha } from "../../lib/format";
import { PacienteForm } from "./PacienteForm";

export default function PacienteDetalle() {
  const { id } = useParams();
  const idNum = Number(id);
  const navigate = useNavigate();
  const { data: paciente, isLoading } = usePaciente(idNum);
  const { data: cantidadTrabajos } = useCantidadTrabajosPaciente(idNum);
  const eliminarPaciente = useEliminarPaciente();
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

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
        <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
          <Pencil size={14} /> Editar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <ClipboardList size={13} /> Trabajos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display">{cantidadTrabajos ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Zona de peligro — separada y discreta, no es la acción principal
          de la ficha (mismo criterio que en Clínicas). */}
      <div className="mt-10 pt-5 border-t border-carbon/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-carbon/35 mb-2">Zona de peligro</p>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-600/15 px-4 py-3">
          <p className="text-sm text-carbon/50">
            Eliminar este paciente de la lista de pacientes. Sus trabajos, comprobantes y pagos históricos, si tiene, no se ven afectados.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEliminando(true)}
            className="shrink-0 text-red-600/70 hover:text-red-600 hover:bg-red-600/5"
          >
            <Trash2 size={14} /> Eliminar paciente
          </Button>
        </div>
      </div>

      <PacienteForm open={editando} onOpenChange={setEditando} paciente={paciente} />
      <ConfirmDialog
        open={eliminando}
        onOpenChange={setEliminando}
        title="¿Eliminar paciente?"
        description="Esta acción eliminará este paciente de la lista de pacientes. Los trabajos, OT, comprobantes, pagos e historial ya registrados no se eliminan ni se modifican."
        confirmLabel="Eliminar paciente"
        destructive
        onConfirm={() => {
          eliminarPaciente.mutate(paciente.id, { onSuccess: () => navigate("/pacientes") });
        }}
      />
    </div>
  );
}
