import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Pencil,
  Power,
  ClipboardList,
  Landmark,
  Receipt,
  UserPlus,
  Stethoscope,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { EliminarConUso } from "../Precios/EliminarConUso";
import { useEstadisticasClinica, useSetActivaClinica, useUsoClinica, useEliminarClinica } from "../../features/clinicas/hooks";
import { useOdontologos } from "../../features/odontologos/hooks";
import { formatearMoneda } from "../../lib/format";
import { ClinicaForm } from "./ClinicaForm";
import { OdontologoForm } from "../Odontologos/OdontologoForm";

export default function ClinicaDetalle() {
  const { id } = useParams();
  const idNum = Number(id);
  const navigate = useNavigate();
  const { data: est, isLoading } = useEstadisticasClinica(idNum);
  const { data: profesionales } = useOdontologos({ clinicaId: idNum });
  const setActiva = useSetActivaClinica();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nuevoProfesionalAbierto, setNuevoProfesionalAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const { data: uso, isLoading: cargandoUso } = useUsoClinica(eliminando ? idNum : undefined);
  const eliminarClinica = useEliminarClinica();
  const bloqueadoPor =
    uso && (uso.cantidadProfesionales > 0 || uso.cantidadTrabajos > 0 || uso.cantidadPagos > 0 || uso.cantidadMovimientos > 0)
      ? "Esta clínica tiene registros históricos y no puede eliminarse de forma permanente. " +
        `(${uso.cantidadProfesionales} profesional(es), ${uso.cantidadTrabajos} trabajo(s), ${uso.cantidadComprobantes} comprobante(s), ${uso.cantidadPagos} pago(s), ${uso.cantidadMovimientos} movimiento(s) de cuenta.) ` +
        "Podés marcarla como inactiva para que deje de aparecer entre las clínicas activas."
      : null;
  const mensajeSeguro =
    uso && !bloqueadoPor ? "Esta clínica no tiene registros históricos asociados y puede eliminarse de forma permanente." : null;

  if (isLoading) return <p className="text-carbon/40 text-sm">Cargando…</p>;
  if (!est) return <p className="text-carbon/40 text-sm">Clínica no encontrada.</p>;

  return (
    <div>
      <Link to="/clinicas" className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4">
        <ArrowLeft size={15} /> Clínicas
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-carbon">{est.nombre}</h1>
            <Badge tono={est.activo ? "exito" : "neutral"}>{est.activo ? "Activa" : "Inactiva"}</Badge>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-carbon/50">
            {est.telefono && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={13} /> {est.telefono}
              </span>
            )}
            {est.direccion && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} /> {est.direccion}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={14} /> Editar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmando(true)}>
            <Power size={14} /> {est.activo ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Profesionales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display">{est.cantidadProfesionales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trabajos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display">{est.cantidadTrabajos}</p>
          </CardContent>
        </Card>
        {est.saldos.length === 0 && (
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Cuenta corriente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-carbon/40">Sin movimientos todavía.</p>
            </CardContent>
          </Card>
        )}
        {est.saldos.map((s) => (
          <Card key={s.moneda} className="col-span-2">
            <CardHeader>
              <CardTitle>Saldo pendiente ({s.moneda})</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-display text-amber-700">{formatearMoneda(s.saldoCentavos, s.moneda)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <Button size="sm" onClick={() => navigate(`/trabajos?clinica=${est.id}`)}>
          <ClipboardList size={14} /> Ver trabajos
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/cuentas/clinica/${est.id}`)}>
          <Landmark size={14} /> Ver cuenta
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/comprobantes?clinica=${est.id}`)}>
          <Receipt size={14} /> Ver comprobantes
        </Button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-carbon/40 flex items-center gap-1.5">
          <Stethoscope size={13} /> Profesionales
        </p>
        <Button variant="secondary" size="sm" onClick={() => setNuevoProfesionalAbierto(true)}>
          <UserPlus size={14} /> Agregar profesional
        </Button>
      </div>

      {profesionales?.length === 0 ? (
        <p className="text-sm text-carbon/40">Todavía no hay profesionales asignados a esta clínica.</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Teléfono</Th>
              <Th>Lista de precios</Th>
              <Th>Estado</Th>
            </Tr>
          </Thead>
          <Tbody>
            {profesionales?.map((p) => (
              <Tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/odontologos/${p.id}`)}>
                <Td className="font-medium">{p.nombre}</Td>
                <Td className="text-carbon/60">{p.telefono ?? "—"}</Td>
                <Td className="text-carbon/60">{p.listaPrecioNombre}</Td>
                <Td>
                  <Badge tono={p.activo ? "exito" : "neutral"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Zona de peligro — separada del resto, deliberadamente discreta:
          "Eliminar clínica" no debe ser lo primero que destaque en la ficha. */}
      <div className="mt-10 pt-5 border-t border-carbon/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-carbon/35 mb-2">Zona de peligro</p>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-600/15 px-4 py-3">
          <p className="text-sm text-carbon/50">
            Eliminar esta clínica de forma permanente. Solo es posible si no tiene registros históricos asociados.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEliminando(true)}
            className="shrink-0 text-red-600/70 hover:text-red-600 hover:bg-red-600/5"
          >
            <Trash2 size={14} /> Eliminar clínica
          </Button>
        </div>
      </div>

      <ClinicaForm open={editando} onOpenChange={setEditando} clinica={est} />
      <OdontologoForm open={nuevoProfesionalAbierto} onOpenChange={setNuevoProfesionalAbierto} clinicaIdPorDefecto={est.id} />
      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={est.activo ? "¿Desactivar clínica?" : "¿Activar clínica?"}
        description={
          est.activo
            ? "La clínica no se elimina ni se pierde su historial: solo deja de aparecer en las listas activas. Sus profesionales y OTs quedan intactos."
            : "La clínica vuelve a aparecer en las listas activas."
        }
        confirmLabel={est.activo ? "Desactivar" : "Activar"}
        destructive={est.activo}
        onConfirm={() => setActiva.mutate({ id: est.id, activo: !est.activo })}
      />
      <EliminarConUso
        open={eliminando}
        onOpenChange={setEliminando}
        titulo={`¿Eliminar "${est.nombre}"?`}
        cargando={cargandoUso}
        bloqueadoPor={bloqueadoPor}
        mensajeSeguro={mensajeSeguro}
        eliminando={eliminarClinica.isPending}
        onConfirmar={() => {
          eliminarClinica.mutate(est.id, {
            onSuccess: () => {
              setEliminando(false);
              navigate("/clinicas");
            }
          });
        }}
        accionBloqueada={{
          label: "Marcar como inactiva",
          pendiente: setActiva.isPending,
          onClick: () => {
            setActiva.mutate(
              { id: est.id, activo: false },
              { onSuccess: () => setEliminando(false) }
            );
          }
        }}
      />
    </div>
  );
}
