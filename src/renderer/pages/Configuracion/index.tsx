import { useEffect, useState } from "react";
import { Printer, CheckCircle2, XCircle, Building2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Input, FormField } from "../../components/ui/Input";
import {
  useImpresoraSeleccionada,
  useImpresorasDisponibles,
  useImprimirPaginaDePrueba
} from "../../features/impresora/hooks";
import { useLaboratorioNombre, useGuardarLaboratorioNombre } from "../../features/configuracion/hooks";
import { ImpresoraSelectorModal } from "./ImpresoraSelectorModal";
import { SeccionProteccion } from "./SeccionProteccion";
import { esAdministrador } from "../../store/authStore";

export default function Configuracion() {
  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Datos del laboratorio, numeración, comprobantes, backups y preferencias."
      />

      <div className="max-w-xl space-y-6">
        <SeccionIdentidadLaboratorio />
        <SeccionImpresora />
        {/* Solo el Administrador puede activar/desactivar/cambiar esta
            protección (§16) — al resto ni se le muestra la sección. */}
        {esAdministrador() && <SeccionProteccion />}
      </div>
    </div>
  );
}

function SeccionIdentidadLaboratorio() {
  const { data: nombreGuardado, isLoading } = useLaboratorioNombre();
  const guardar = useGuardarLaboratorioNombre();
  const [nombre, setNombre] = useState("");

  // Sincroniza el campo con el valor guardado cuando llega (o cambia
  // desde otra sesión) — sin pisar lo que el usuario esté escribiendo.
  useEffect(() => {
    setNombre(nombreGuardado ?? "");
  }, [nombreGuardado]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identidad del laboratorio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-carbon/50">
          El nombre de tu laboratorio aparece como <span className="font-medium text-carbon/70">"By {nombre || "…"}"</span> debajo
          del logo Densz en los comprobantes nuevos. Los comprobantes ya generados no se modifican.
        </p>

        <FormField label="Nombre del laboratorio">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Dental Szymek"
            disabled={isLoading}
          />
        </FormField>

        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-carbon/40" />
          <span className="text-sm text-carbon/60">
            Densz
            {nombreGuardado && <span className="block text-xs text-carbon/40">By {nombreGuardado}</span>}
          </span>
        </div>

        <Button
          size="sm"
          onClick={() => guardar.mutate(nombre)}
          disabled={guardar.isPending || !nombre.trim() || nombre.trim() === nombreGuardado}
        >
          {guardar.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SeccionImpresora() {
  const { data: seleccionada, isLoading: cargandoSeleccion } = useImpresoraSeleccionada();
  const { data: disponibles } = useImpresorasDisponibles();
  const imprimirPrueba = useImprimirPaginaDePrueba();
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const disponibleAhora = seleccionada ? disponibles?.find((p) => p.nombreDispositivo === seleccionada.nombreDispositivo) : undefined;
  const estaDisponible = seleccionada ? (disponibleAhora ? disponibleAhora.disponible : false) : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Impresora</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-carbon/50">
          La impresora que elijas acá es la que Densz usa para "Imprimir" en los comprobantes — sin preguntar cada
          vez. Queda guardada para la próxima vez que abras Densz.
        </p>

        {cargandoSeleccion && <p className="text-sm text-carbon/40">Cargando…</p>}

        {!cargandoSeleccion && !seleccionada && (
          <div className="rounded-lg border border-dashed border-carbon/20 px-4 py-4 text-center">
            <p className="text-sm text-carbon/50 mb-3">Todavía no configuraste una impresora predeterminada.</p>
            <Button size="sm" onClick={() => setSelectorAbierto(true)}>
              <Printer size={14} /> Elegir impresora
            </Button>
          </div>
        )}

        {!cargandoSeleccion && seleccionada && (
          <>
            <div className="flex items-center justify-between rounded-lg border border-carbon/10 bg-cream px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Printer size={20} className="text-gold-dim shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{seleccionada.nombreVisible}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {estaDisponible ? (
                      <Badge tono="exito" className="inline-flex items-center gap-1">
                        <CheckCircle2 size={11} /> Disponible
                      </Badge>
                    ) : (
                      <Badge tono="error" className="inline-flex items-center gap-1">
                        <XCircle size={11} /> No disponible
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setSelectorAbierto(true)}>
                Cambiar impresora
              </Button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => imprimirPrueba.mutate(seleccionada.nombreDispositivo)}
              disabled={imprimirPrueba.isPending}
            >
              <Printer size={14} /> {imprimirPrueba.isPending ? "Imprimiendo…" : "Imprimir página de prueba"}
            </Button>
          </>
        )}
      </CardContent>

      <ImpresoraSelectorModal
        open={selectorAbierto}
        onOpenChange={setSelectorAbierto}
        seleccionActual={seleccionada?.nombreDispositivo}
      />
    </Card>
  );
}
