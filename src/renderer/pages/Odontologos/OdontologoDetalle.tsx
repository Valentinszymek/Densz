import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Phone, MapPin, Pencil, Power, ClipboardList, Landmark, Receipt, Tags, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useEstadisticasOdontologo, useSetActivoOdontologo, useAsignarListaOdontologo } from "../../features/odontologos/hooks";
import { useListasPrecio } from "../../features/listasPrecio/hooks";
import { formatearMoneda, formatearFecha } from "../../lib/format";
import { OdontologoForm } from "./OdontologoForm";

export default function OdontologoDetalle() {
  const { id } = useParams();
  const idNum = Number(id);
  const navigate = useNavigate();
  const { data: est, isLoading } = useEstadisticasOdontologo(idNum);
  const { data: listas } = useListasPrecio(true);
  const setActivo = useSetActivoOdontologo();
  const asignarLista = useAsignarListaOdontologo();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  if (isLoading) return <p className="text-carbon/40 text-sm">Cargando…</p>;
  if (!est) return <p className="text-carbon/40 text-sm">Odontólogo no encontrado.</p>;

  return (
    <div>
      <Link to="/odontologos" className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4">
        <ArrowLeft size={15} /> Odontólogos
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-carbon">{est.nombre}</h1>
            <Badge tono={est.activo ? "exito" : "neutral"}>{est.activo ? "Activo" : "Inactivo"}</Badge>
            {est.clinicaId && (
              <Link to={`/clinicas/${est.clinicaId}`}>
                <Badge tono="gold" className="inline-flex items-center gap-1 hover:opacity-80">
                  <Building2 size={11} /> {est.clinicaNombre}
                </Badge>
              </Link>
            )}
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
            <CardTitle>Trabajos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display">{est.cantidadTrabajos}</p>
          </CardContent>
        </Card>
        {est.saldos.length === 0 && (
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Cuenta corriente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-carbon/40">Sin movimientos todavía.</p>
            </CardContent>
          </Card>
        )}
        {est.saldos.map((s) => (
          <Card key={s.moneda} className="col-span-3">
            <CardHeader>
              <CardTitle>Cuenta corriente ({s.moneda})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-carbon/40 mb-1">Total histórico</p>
                  <p className="text-xl font-display">{formatearMoneda(s.totalDebeCentavos, s.moneda)}</p>
                </div>
                <div>
                  <p className="text-xs text-carbon/40 mb-1">Pendiente de cobro</p>
                  <p className="text-xl font-display text-amber-700">{formatearMoneda(s.saldoCentavos, s.moneda)}</p>
                </div>
                <div>
                  <p className="text-xs text-carbon/40 mb-1">Pagado</p>
                  <p className="text-xl font-display text-emerald-700">{formatearMoneda(s.totalHaberCentavos, s.moneda)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs text-carbon/40">Lista de precios:</p>
        <select
          value={est.listaPrecioId}
          onChange={(e) => asignarLista.mutate({ id: est.id, listaPrecioId: Number(e.target.value) })}
          className="h-8 rounded-md border border-carbon/15 bg-cream-card px-2 text-xs font-medium"
        >
          {listas?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre} ({l.moneda})
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-carbon/40 mb-6">
        Último trabajo: {est.ultimoTrabajoFecha ? formatearFecha(est.ultimoTrabajoFecha) : "sin registros"}
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <Button size="sm" onClick={() => navigate(`/trabajos/nuevo?odontologo=${est.id}`)}>
          <ClipboardList size={14} /> Nuevo trabajo
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/cuentas/${est.id}`)}>
          <Landmark size={14} /> Ver cuenta
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/comprobantes?odontologo=${est.id}`)}>
          <Receipt size={14} /> Ver comprobantes
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/precios?odontologo=${est.id}`)}>
          <Tags size={14} /> Ver precios
        </Button>
      </div>

      <OdontologoForm open={editando} onOpenChange={setEditando} odontologo={est} />
      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={est.activo ? "¿Desactivar odontólogo?" : "¿Activar odontólogo?"}
        description={
          est.activo
            ? "El odontólogo no se elimina ni se pierde su historial: solo deja de aparecer en las listas activas."
            : "El odontólogo vuelve a aparecer en las listas activas."
        }
        confirmLabel={est.activo ? "Desactivar" : "Activar"}
        destructive={est.activo}
        onConfirm={() => setActivo.mutate({ id: est.id, activo: !est.activo })}
      />
    </div>
  );
}
