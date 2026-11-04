import { useEffect, useState } from "react";
import { Printer, CheckCircle2, XCircle, Building2, Download } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Input, FormField } from "../../components/ui/Input";
import { Toggle } from "../../components/ui/Toggle";
import {
  useImpresoraSeleccionada,
  useImpresorasDisponibles,
  useImprimirPaginaDePrueba
} from "../../features/impresora/hooks";
import {
  useLaboratorioNombre,
  useGuardarLaboratorioNombre,
  useTamanoImpresionComprobante,
  useGuardarTamanoImpresionComprobante
} from "../../features/configuracion/hooks";
import { leerTamanoImpresionLocal, guardarTamanoImpresionLocal } from "../../lib/tamanoImpresionLocal";

// No se importa de webApi.ts a propósito: ese archivo es exclusivo del
// entry point web (ver su comentario) y esta página también se bundlea
// para escritorio — esta sección solo se renderiza con !esEscritorio,
// pero el import estático la arrastraría igual al bundle de Electron.
const API_BASE_DESCARGAS = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";
import { ImpresoraSelectorModal } from "./ImpresoraSelectorModal";
import { SeccionProteccion } from "./SeccionProteccion";
import { SeccionSuscripcion } from "./SeccionSuscripcion";
import { esAdministrador } from "../../store/authStore";

export default function Configuracion() {
  // La selección de impresora física es exclusiva de escritorio (no hay
  // ninguna API de navegador que la exponga) — mostrarla en la web es
  // peor que no mostrar nada: se ve terminada pero no hace nada si se
  // toca. Al revés, el link de descarga del escritorio solo tiene
  // sentido en la web (quien ya está en el escritorio no necesita
  // bajarlo).
  const esEscritorio = window.densz.plataforma === "escritorio";

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Datos del laboratorio, numeración, comprobantes y preferencias."
      />

      <div className="max-w-xl space-y-6">
        <SeccionIdentidadLaboratorio />
        <SeccionTamanoImpresion />
        {esEscritorio ? <SeccionImpresora /> : <SeccionDescargaEscritorio />}
        {/* Suscripción y protección: ambas exclusivas de ADMINISTRADOR. */}
        {esAdministrador() && <SeccionSuscripcion />}
        {esAdministrador() && <SeccionProteccion />}
      </div>
    </div>
  );
}

function SeccionDescargaEscritorio() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download size={16} /> Densz para escritorio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-carbon/60 mb-4">
          Usá Densz también desde una app de Windows — misma cuenta, mismos datos en tiempo real, ideal si imprimís
          mucho (la app de escritorio imprime directo, sin pasos extra). Se actualiza sola cuando sale una versión
          nueva.
        </p>
        <Button variant="secondary" size="sm" asChild>
          <a href={`${API_BASE_DESCARGAS}/descargas/windows`}>
            <Download size={14} /> Descargar para Windows
          </a>
        </Button>
      </CardContent>
    </Card>
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

function SeccionTamanoImpresion() {
  const { data: tamano, isLoading } = useTamanoImpresionComprobante();
  const guardar = useGuardarTamanoImpresionComprobante();
  const esA4 = tamano === "a4";
  // El tamaño del ticket solo es 100% confiable desde la app de escritorio
  // (Densz le pide el tamaño directo a la impresora, sin diálogo de por
  // medio). Desde el navegador, el tamaño físico de papel lo decide el
  // diálogo de impresión de Windows/Chrome — ningún sitio web puede
  // forzarlo — así que si la impresora no tiene cargado papel realmente
  // precortado (o su tamaño personalizado no está bien registrado), el
  // comprobante puede salir en una hoja grande con el ticket en una
  // esquina. "A4 completa" evita ese riesgo por completo: A4 es un
  // tamaño que cualquier impresora soporta sin configuración extra.
  const esEscritorio = window.densz.plataforma === "escritorio";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tamaño de impresión del comprobante</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-carbon/50">
          Por defecto, Densz genera el comprobante directo al tamaño del ticket (10,5 × 14,8 cm) — ideal si imprimís
          en papel ya precortado a ese tamaño. Activá esto si en cambio imprimís en hoja A4 entera y recortás el
          ticket vos mismo después, siguiendo la guía punteada.
        </p>

        {!esEscritorio && !esA4 && (
          <p className="text-xs text-amber-800/80 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
            Estás usando Densz desde el navegador: el tamaño de papel que imprime lo decide la ventana de impresión
            de Windows/Chrome, no Densz. Si tu impresora no tiene cargado un papel realmente precortado a 10,5 ×
            14,8 cm, elegí <strong>"Imprimir en hoja A4 completa"</strong> acá abajo para un resultado confiable.
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg border border-carbon/10 bg-cream px-4 py-3">
          <div>
            <p className="font-medium text-sm">Imprimir en hoja A4 completa</p>
            <p className="text-xs text-carbon/50 mt-0.5">
              {esA4 ? "Hoja A4 con el ticket en la esquina y guía de corte." : "Directo al tamaño del ticket, sin hoja A4 de por medio."}
            </p>
            <p className="text-xs text-carbon/40 mt-0.5">Esto aplica para todo el laboratorio, en todas las computadoras.</p>
          </div>
          <Toggle
            activo={esA4}
            disabled={isLoading || guardar.isPending}
            onChange={(activo) => guardar.mutate(activo ? "a4" : "ticket")}
            label="Imprimir en hoja A4 completa"
          />
        </div>

        {!esEscritorio && <SeccionTamanoImpresionLocal />}
      </CardContent>
    </Card>
  );
}

/** Preferencia LOCAL de esta computadora (localStorage, nunca la base) —
 * pisa puntualmente lo de arriba solo para los PDFs que se piden desde
 * ESTE navegador, sin afectar a nadie más. Pensado para cuando una
 * impresora puntual ya está bien configurada en Windows para el tamaño
 * del ticket (ver la guía de configuración más abajo) y esa compu puede
 * aprovechar el tamaño chico aunque el resto del laboratorio imprima en
 * A4 por seguridad. Solo tiene sentido en la Web — el escritorio ya es
 * 100% confiable con cualquiera de los dos tamaños, sin esto. */
function SeccionTamanoImpresionLocal() {
  const [local, setLocal] = useState(() => leerTamanoImpresionLocal());

  function elegir(valor: "ticket" | "a4" | null) {
    guardarTamanoImpresionLocal(valor);
    setLocal(valor);
  }

  const opciones: Array<{ valor: "ticket" | "a4" | null; etiqueta: string }> = [
    { valor: null, etiqueta: "Usar la del laboratorio" },
    { valor: "ticket", etiqueta: "Ticket (chico)" },
    { valor: "a4", etiqueta: "A4 completa" }
  ];

  return (
    <div className="rounded-lg border border-carbon/10 bg-cream px-4 py-3 space-y-2">
      <p className="font-medium text-sm">Tamaño de impresión en esta computadora</p>
      <p className="text-xs text-carbon/50">
        Si esta impresora ya está configurada en Windows para el tamaño del ticket, podés elegirlo acá sin cambiar
        lo que ven las demás computadoras del laboratorio.
      </p>
      <div className="flex gap-2 flex-wrap">
        {opciones.map((o) => (
          <button
            key={o.etiqueta}
            type="button"
            onClick={() => elegir(o.valor)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              local === o.valor
                ? "bg-carbon text-cream border-carbon"
                : "border-carbon/15 text-carbon/60 hover:bg-carbon/5"
            }`}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
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
