import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useParams, Link } from "react-router-dom";
import { ArrowLeft, UserPlus, Pencil, Plus, Trash2, Check, X, Building2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { FormField, Input, Label } from "../../components/ui/Input";
import { SelectBuscable } from "../../components/ui/SelectBuscable";
import { CurrencyInput } from "../../components/ui/CurrencyInput";
import { Odontograma } from "../../components/odontograma/Odontograma";
import { useOdontologos, useOdontologo } from "../../features/odontologos/hooks";
import { usePrestaciones } from "../../features/precios/hooks";
import { useItemsListaPrecio } from "../../features/listasPrecio/hooks";
import { usePacientes } from "../../features/pacientes/hooks";
import { useOrden, useCrearOrden, useEditarOrden } from "../../features/ordenes/hooks";
import { useGenerarComprobante } from "../../features/comprobantes/hooks";
import { useTienePagos } from "../../features/cuentas/hooks";
import { formatearMoneda } from "../../lib/format";
import { cn } from "../../lib/cn";
import { OdontologoForm } from "../Odontologos/OdontologoForm";
import { ConfirmarEdicionOrdenModal } from "./ConfirmarEdicionOrdenModal";
import type { Moneda } from "@shared/types/entities";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

let contadorRegistro = 0;
function nuevoRegistro() {
  contadorRegistro += 1;
  return {
    key: `registro-${contadorRegistro}`,
    prestacionId: null as number | null,
    piezas: [] as number[],
    // "" representa el campo vacío mientras se está editando a mano (el
    // usuario borró el 1 para escribir otra cantidad) — nunca se lo
    // reemplaza automáticamente por 1, solo se valida al guardar (§3).
    cantidad: 1 as number | "",
    cantidadManual: false,
    precioManual: null as number | null,
    editandoPrecio: false,
    // true SOLO para líneas cargadas desde una OT ya existente (Editar OT)
    // que todavía no tocó el usuario: mientras esté en true, el precio
    // queda congelado tal cual estaba, nunca se recalcula contra el
    // catálogo actual. Se apaga en cuanto el usuario cambia la prestación
    // de esa línea (§6 — recién ahí corresponde ir a buscar un precio
    // nuevo). Una línea nueva (Nuevo Trabajo, o "+ Otro registro" en una
    // edición) nace en false: siempre usa el precio vigente de la lista.
    precioCongelado: false
  };
}

type RegistroPrestacion = ReturnType<typeof nuevoRegistro>;

/** Reconstruye un registro editable a partir de una línea YA GUARDADA de
 * una OT existente (modo "Editar OT") — con su precio congelado tal cual
 * estaba, para no recalcularlo por accidente contra el catálogo de hoy. */
function registroDesdeLinea(p: {
  prestacionId: number;
  cantidad: number;
  piezasFdi: number[];
  precioUnitarioCentavos: number;
}): RegistroPrestacion {
  contadorRegistro += 1;
  return {
    key: `registro-${contadorRegistro}`,
    prestacionId: p.prestacionId,
    piezas: p.piezasFdi,
    cantidad: p.cantidad,
    // Manual a propósito: si el usuario solo toca las piezas, la cantidad
    // cargada originalmente (que puede no tener nada que ver con la
    // cantidad de piezas — ej. "Modelo 3D" cantidad 2 sin piezas) no debe
    // recalcularse sola.
    cantidadManual: true,
    precioManual: p.precioUnitarioCentavos,
    editandoPrecio: true,
    precioCongelado: true
  };
}

/**
 * Campo "Paciente" de Nuevo Trabajo: un único input de texto que además
 * sugiere pacientes ya existentes del odontólogo elegido a medida que se
 * escribe. Si el usuario hace click en una sugerencia, ese paciente
 * existente queda elegido (`pacienteId`). Si en cambio deja escrito un
 * nombre que no coincide con ninguna sugerencia, ese texto ES el paciente
 * nuevo — no hace falta ningún botón ni opción de "crear": la creación
 * ocurre sola al Guardar la OT (ver `onGuardar`). A propósito NO existe
 * ningún "+ Nuevo paciente" en este campo (§ comportamiento definitivo).
 */
function CampoPaciente({
  pacientes,
  texto,
  pacienteId,
  onCambiarTexto,
  onSeleccionar,
  disabled,
  placeholder
}: {
  pacientes: Array<{ id: number; label: string }>;
  texto: string;
  pacienteId: number | null;
  onCambiarTexto: (texto: string) => void;
  onSeleccionar: (id: number, label: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sugeridas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    // Con el campo vacío no hay sugerencias — el buscador solo debe
    // activarse cuando el usuario empieza a escribir, nunca al hacer
    // foco/clic solo.
    if (!q) return [];
    return pacientes.filter((p) => p.label.toLowerCase().includes(q));
  }, [pacientes, texto]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        disabled={disabled}
        value={texto}
        onChange={(e) => {
          onCambiarTexto(e.target.value);
          // Solo se abre si queda al menos un carácter escrito — un clic
          // en el campo vacío (o borrar todo el texto) nunca debe mostrar
          // el listado de pacientes.
          setAbierto(e.target.value.trim().length > 0);
        }}
        placeholder={placeholder}
        className={cn(
          "flex h-10 w-full items-center rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
          "placeholder:text-carbon/35",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
      {abierto && !disabled && sugeridas.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-carbon/10 bg-cream-card py-1 shadow-lg">
          {sugeridas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSeleccionar(p.id, p.label);
                setAbierto(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gold/10",
                p.id === pacienteId && "bg-gold/10"
              )}
            >
              <Check size={14} className={cn("shrink-0", p.id === pacienteId ? "opacity-100 text-gold-dim" : "opacity-0")} />
              <span className="flex-1 truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** La cantidad numérica real de un registro — 0 mientras el campo está
 * vacío en edición, nunca `NaN` ni "" en una cuenta. */
function cantidadNum(r: RegistroPrestacion): number {
  return typeof r.cantidad === "number" ? r.cantidad : 0;
}

export default function NuevoTrabajo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const odontologoInicial = params.get("odontologo");

  // Misma ficha para crear y para editar (§ no crear una pantalla
  // distinta): "/trabajos/nuevo" no trae `:id` (modo crear);
  // "/trabajos/:id/editar" sí (modo editar, precarga esa OT existente).
  const { id: idParam } = useParams<{ id: string }>();
  const esEdicion = idParam !== undefined;
  const idEditar = esEdicion ? Number(idParam) : undefined;
  const { data: ordenOriginal, isLoading: cargandoOrden } = useOrden(idEditar);

  const [odontologoId, setOdontologoId] = useState<number | null>(odontologoInicial ? Number(odontologoInicial) : null);
  // El campo Paciente es un único texto libre con sugerencias (ver
  // `CampoPaciente`). `pacienteId` solo queda seteado mientras el texto
  // coincide con una sugerencia que el usuario clickeó explícitamente —
  // apenas se sigue escribiendo, se limpia (`onCambiarTexto`) y ese texto
  // pasa a ser, tal cual, el nombre del paciente nuevo a crear al Guardar.
  const [pacienteId, setPacienteId] = useState<number | null>(null);
  const [pacienteTexto, setPacienteTexto] = useState("");
  const [fechaTrabajo, setFechaTrabajo] = useState(hoyISO());
  // "Registros" ya confirmados (guardados dentro de la OT) + el registro
  // actual que se está completando — un solo registro editable a la vez,
  // tal como lo pediste: se completa, se guarda, y recién ahí aparece
  // "+ OTRO REGISTRO" para cargar el siguiente.
  const [registros, setRegistros] = useState<RegistroPrestacion[]>([]);
  const [actual, setActual] = useState<RegistroPrestacion | null>(esEdicion ? null : nuevoRegistro());
  const [error, setError] = useState<string | null>(null);
  const [nuevoOdontologoAbierto, setNuevoOdontologoAbierto] = useState(false);
  // OT ya facturada + editando: antes de guardar de verdad se muestra un
  // resumen del impacto en la cuenta y se pide confirmar (§14).
  const [confirmando, setConfirmando] = useState(false);

  const { data: odontologos } = useOdontologos({ soloActivos: true });
  const { data: odontologo } = useOdontologo(odontologoId ?? undefined);
  const { data: pacientes } = usePacientes(odontologoId ? { odontologoId } : {});
  const { data: prestaciones } = usePrestaciones({ soloActivas: true });
  const { data: itemsLista } = useItemsListaPrecio(odontologo?.listaPrecioId, true);
  const crearOrden = useCrearOrden();
  const editarOrden = useEditarOrden();
  const generarComprobante = useGenerarComprobante();

  // Para la advertencia de "esta cuenta tiene pagos registrados" (§5) —
  // los pagos en Densz no están atados a una OT puntual, sino al titular
  // (odontólogo o clínica). Usa un canal que devuelve solo sí/no, nunca un
  // importe, para que esta advertencia funcione igual con la protección
  // de Cuentas activada o no (no es "entrar a Cuentas").
  const { data: tienePagosRegistrados } = useTienePagos(
    esEdicion
      ? { odontologoId: ordenOriginal?.clinicaId ? null : odontologoId, clinicaId: ordenOriginal?.clinicaId ?? null }
      : undefined
  );

  const moneda: Moneda = odontologo?.listaPrecioMoneda ?? "ARS";
  const simboloMoneda = moneda === "USD" ? "US$" : "$";

  const precioPorPrestacion = useMemo(() => {
    const mapa = new Map<number, number>();
    (itemsLista ?? []).forEach((it) => {
      if (it.precioCentavos !== null) mapa.set(it.id, it.precioCentavos);
    });
    return mapa;
  }, [itemsLista]);

  function precioDeRegistro(r: RegistroPrestacion): number {
    if (r.editandoPrecio && r.precioManual !== null) return r.precioManual;
    if (r.prestacionId) return precioPorPrestacion.get(r.prestacionId) ?? 0;
    return 0;
  }

  // En modo edición, precarga la ficha con los datos de la OT existente
  // — una sola vez, para no pisar lo que el usuario ya esté escribiendo
  // si la consulta se refresca en segundo plano.
  const yaPrecargado = useRef(false);
  // El cambio de odontólogo que dispara la precarga de arriba NO debe
  // disparar el "reseteo de paciente al cambiar odontólogo" de abajo —
  // ver el comentario en ese efecto.
  const saltarResetPaciente = useRef(false);
  useEffect(() => {
    if (!esEdicion || !ordenOriginal || yaPrecargado.current) return;
    yaPrecargado.current = true;
    saltarResetPaciente.current = true;
    setOdontologoId(ordenOriginal.odontologoId);
    setPacienteId(ordenOriginal.pacienteId);
    setPacienteTexto(ordenOriginal.pacienteNombreCompleto ?? "");
    setFechaTrabajo(ordenOriginal.fechaTrabajo);
    setRegistros(ordenOriginal.prestaciones.map(registroDesdeLinea));
    setActual(null);
  }, [esEdicion, ordenOriginal]);

  // El paciente elegido (o el nombre que se estaba escribiendo) pertenece
  // a un odontólogo puntual: si se cambia de odontólogo, deja de tener
  // sentido y se limpia. (Salvo la primera vez que se fija el odontólogo
  // al precargar una edición — ahí el paciente que se acaba de cargar es
  // justamente el correcto, no hay que limpiarlo.)
  useEffect(() => {
    if (saltarResetPaciente.current) {
      saltarResetPaciente.current = false;
      return;
    }
    setPacienteId(null);
    setPacienteTexto("");
  }, [odontologoId]);

  function actualizarActual(cambios: Partial<RegistroPrestacion>) {
    setActual((prev) => (prev ? { ...prev, ...cambios } : prev));
  }

  /** Cambiar la prestación de una línea "descongela" su precio (§6/§7):
   * a partir de ahí vuelve a resolverse contra la lista vigente, como
   * cualquier línea nueva — nunca se sigue arrastrando el precio viejo. */
  function cambiarPrestacionActual(id: number | null) {
    actualizarActual(
      actual?.precioCongelado
        ? { prestacionId: id, precioCongelado: false, editandoPrecio: false, precioManual: null }
        : { prestacionId: id }
    );
  }

  function onCambiarPiezasActual(piezas: number[]) {
    setActual((prev) => {
      if (!prev) return prev;
      // La cantidad sigue automáticamente a las piezas seleccionadas,
      // salvo que el usuario ya la haya tocado a mano en este registro.
      const cantidad = prev.cantidadManual ? prev.cantidad : Math.max(1, piezas.length || 1);
      return { ...prev, piezas, cantidad };
    });
  }

  const actualEsValido = !!actual?.prestacionId && precioDeRegistro(actual) > 0 && cantidadNum(actual) > 0;

  function guardarRegistroActual() {
    if (!actual || !actualEsValido) return;
    setRegistros((prev) => [...prev, actual]);
    setActual(null);
  }

  function otroRegistro() {
    setActual(nuevoRegistro());
  }

  function cancelarActual() {
    setActual(null);
  }

  function quitarRegistroGuardado(key: string) {
    setRegistros((prev) => prev.filter((r) => r.key !== key));
  }

  function editarRegistroGuardado(key: string) {
    const registro = registros.find((r) => r.key === key);
    if (!registro) return;
    setRegistros((prev) => prev.filter((r) => r.key !== key));
    setActual(registro);
  }

  const totalRegistros = registros.reduce((acc, r) => acc + precioDeRegistro(r) * cantidadNum(r), 0);
  const totalActual = actual?.prestacionId ? precioDeRegistro(actual) * cantidadNum(actual) : 0;
  const total = totalRegistros + totalActual;

  async function onGuardar(generarComprobanteTambien: boolean) {
    setError(null);
    // El registro que se está completando en pantalla cuenta como parte
    // de la OT si ya tiene una prestación elegida — no hace falta que el
    // usuario pulse "Guardar registro" para el último antes de guardar la OT.
    const todos = actual?.prestacionId ? [...registros, actual] : registros;

    if (!odontologoId) return setError("Seleccioná un odontólogo.");
    const pacienteTextoTrim = pacienteTexto.trim();
    if (!pacienteId && pacienteTextoTrim.length < 2) {
      return setError("Ingresá el nombre del paciente.");
    }
    if (todos.length === 0) return setError("Agregá al menos un registro (prestación).");
    if (todos.some((r) => precioDeRegistro(r) <= 0)) {
      return setError("Hay una prestación sin precio. Definilo en Precios o ingresá uno manual.");
    }
    if (todos.some((r) => cantidadNum(r) <= 0)) {
      return setError("Hay un registro con una cantidad inválida: tiene que ser mayor a 0.");
    }

    const payload = {
      odontologoId,
      pacienteId: pacienteId ?? undefined,
      pacienteNombreCompleto: pacienteId ? undefined : pacienteTextoTrim,
      fechaTrabajo,
      prestaciones: todos.map((r) => ({
        prestacionId: r.prestacionId!,
        cantidad: cantidadNum(r),
        piezasFdi: r.piezas,
        precioManualCentavos: r.editandoPrecio ? r.precioManual : null
      }))
    };

    if (esEdicion && idEditar) {
      // OT ya facturada: primero se confirma el impacto en la cuenta
      // (§14) — este primer click solo abre el modal, todavía no guarda
      // nada. El botón "Guardar cambios" DENTRO del modal vuelve a llamar
      // a esta misma función con `confirmando` ya en true.
      if (ordenOriginal?.estado === "facturado" && !confirmando) {
        setConfirmando(true);
        return;
      }
      try {
        await editarOrden.mutateAsync({ id: idEditar, data: payload });
        navigate(`/trabajos/${idEditar}`);
      } catch (err) {
        setError(String(err));
        setConfirmando(false);
      }
      return;
    }

    try {
      const ordenCreada = await crearOrden.mutateAsync(payload);
      if (generarComprobanteTambien) {
        await generarComprobante.mutateAsync(ordenCreada.id);
      }
      navigate(`/trabajos/${ordenCreada.id}`);
    } catch (err) {
      setError(String(err));
    }
  }

  const guardando = crearOrden.isPending || generarComprobante.isPending || editarOrden.isPending;

  if (esEdicion && cargandoOrden) {
    return <p className="text-carbon/40 text-sm">Cargando…</p>;
  }
  if (esEdicion && !ordenOriginal) {
    return <p className="text-carbon/40 text-sm">Orden no encontrada.</p>;
  }
  if (esEdicion && ordenOriginal!.estado === "anulado") {
    return (
      <div className="max-w-3xl">
        <Link
          to={`/trabajos/${idEditar}`}
          className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4"
        >
          <ArrowLeft size={15} /> Volver a la OT
        </Link>
        <p className="text-sm text-red-600">
          Esta orden está anulada y no se puede editar — su historial permanece intacto tal como está.
        </p>
      </div>
    );
  }

  return (
    <div className="relative max-w-6xl">
      {/* Detalle de fondo — una muela en trazo muy fino, a opacidad casi
          nula: solo para que la pantalla no se sienta tan vacía, sin
          competir nunca con el contenido (queda detrás, en z-0, mientras
          todo lo demás vive en la capa de arriba). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 300"
        className="pointer-events-none absolute -top-4 right-0 z-0 h-[380px] w-auto text-carbon/[0.04]"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <path d="M100,10 C60,10 40,40 40,70 C40,95 50,110 55,125 C40,140 30,170 30,210 C30,250 45,290 55,295 C65,290 70,250 72,210 C74,180 78,150 85,140 C90,150 110,150 115,140 C122,150 126,180 128,210 C130,250 135,290 145,295 C155,290 170,250 170,210 C170,170 160,140 145,125 C150,110 160,95 160,70 C160,40 140,10 100,10 Z" />
      </svg>

      <div className="relative z-10">
        <Link
          to={esEdicion ? `/trabajos/${idEditar}` : "/trabajos"}
          className="inline-flex items-center gap-1.5 text-sm text-carbon/50 hover:text-carbon mb-4"
        >
          <ArrowLeft size={15} /> {esEdicion ? ordenOriginal!.numero : "Trabajos"}
        </Link>
        <PageHeader
          title={esEdicion ? `Editar ${ordenOriginal!.numero}` : "Nuevo trabajo"}
          description={
            esEdicion
              ? "Corregí lo que se cargó mal — el número de OT, su historial, el comprobante y los pagos existentes se conservan tal cual."
              : "Una OT puede tener varios registros (prestaciones), cada uno con sus propias piezas. El precio queda congelado al guardar."
          }
        />

        <Card>
          <CardContent className="space-y-6 pt-5">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Odontólogo">
              <SelectBuscable
                opciones={(odontologos ?? []).map((o) => ({ id: o.id, label: o.nombre, sublabel: o.listaPrecioNombre }))}
                value={odontologoId}
                onChange={setOdontologoId}
                placeholder="Buscar odontólogo…"
              />
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setNuevoOdontologoAbierto(true)}
                  className="inline-flex items-center gap-1 text-xs text-gold-dim hover:underline"
                >
                  <UserPlus size={12} /> Nuevo odontólogo
                </button>
                {odontologo && (
                  <Badge tono={moneda === "USD" ? "gold" : "neutral"}>
                    {odontologo.listaPrecioNombre} · {moneda}
                  </Badge>
                )}
                {odontologo?.clinicaNombre && (
                  <Badge tono="gold" className="inline-flex items-center gap-1">
                    <Building2 size={11} /> {odontologo.clinicaNombre}
                  </Badge>
                )}
              </div>
              {odontologo?.clinicaNombre && (
                <p className="mt-1 text-xs text-carbon/35">
                  Este trabajo se factura y cobra a nombre de {odontologo.clinicaNombre}; {odontologo.nombre} queda
                  registrado como profesional.
                </p>
              )}
            </FormField>

            <FormField label="Paciente">
              {/* Un único campo de texto: escribís el nombre y, si ya
                  existe un paciente de este odontólogo que coincide,
                  aparece como sugerencia para elegirlo con un click. Si no
                  lo elegís, el texto tal cual escrito ES el paciente nuevo
                  — se crea solo, en el mismo momento de Guardar la OT, sin
                  ningún botón ni opción de "crear" en el medio (flujo
                  definitivo: la creación es invisible para el usuario). */}
              <CampoPaciente
                pacientes={(pacientes ?? []).map((p) => ({ id: p.id, label: p.nombreCompleto }))}
                texto={pacienteTexto}
                pacienteId={pacienteId}
                onCambiarTexto={(texto) => {
                  setPacienteTexto(texto);
                  setPacienteId(null);
                }}
                onSeleccionar={(id, label) => {
                  setPacienteId(id);
                  setPacienteTexto(label);
                }}
                disabled={!odontologoId}
                placeholder={odontologoId ? "Nombre del paciente…" : "Elegí primero un odontólogo…"}
              />
            </FormField>

            <FormField label="Fecha del trabajo">
              <Input type="date" value={fechaTrabajo} onChange={(e) => setFechaTrabajo(e.target.value)} />
            </FormField>
          </div>

          <div className="space-y-3">
            <Label>Registros</Label>

            {registros.map((r, idx) => {
              const prestacion = prestaciones?.find((p) => p.id === r.prestacionId);
              const subtotal = precioDeRegistro(r) * cantidadNum(r);
              return (
                <div
                  key={r.key}
                  className="flex items-center justify-between rounded-xl border border-carbon/10 bg-cream-card px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-dim text-xs font-semibold">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{prestacion?.nombre ?? r.prestacionId ?? "—"}</p>
                      <p className="text-xs text-carbon/45">
                        {r.piezas.length > 0 ? r.piezas.join(" · ") : "Sin piezas"} · {cantidadNum(r)}{" "}
                        {cantidadNum(r) === 1 ? "unidad" : "unidades"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-sm">{formatearMoneda(subtotal, moneda)}</span>
                    <button
                      type="button"
                      onClick={() => editarRegistroGuardado(r.key)}
                      className="text-carbon/30 hover:text-carbon"
                      title="Editar registro"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarRegistroGuardado(r.key)}
                      className="text-carbon/30 hover:text-red-600"
                      title="Quitar registro"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {actual && (
              <div className="rounded-xl border-2 border-gold/40 p-4 md:p-5 bg-gold/5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-xs font-semibold text-gold-dim uppercase tracking-wide">
                    Registro {registros.length + 1}
                  </span>
                  {registros.length > 0 && (
                    <button
                      type="button"
                      onClick={cancelarActual}
                      className="text-carbon/30 hover:text-red-600"
                      title="Cancelar este registro"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Distribución tipo Denture (solo la idea, no el diseño): el
                    registro a la izquierda ("qué trabajo estoy cargando"),
                    el odontograma a la derecha ("qué piezas corresponden") —
                    los dos visibles a la vez, sin que uno empuje al otro
                    fuera de pantalla. En ventanas angostas cae a una sola
                    columna en vez de romperse. */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)] gap-6 items-start">
                  <div className="space-y-4">
                    <FormField label="Prestación">
                      <SelectBuscable
                        opciones={(prestaciones ?? []).map((p) => ({ id: p.id, label: p.nombre, sublabel: p.categoriaNombre }))}
                        value={actual.prestacionId}
                        onChange={cambiarPrestacionActual}
                        placeholder="Buscar prestación…"
                      />
                    </FormField>

                    {actual.prestacionId && (
                      <>
                        <FormField label="Cantidad">
                          {/* type="text" a propósito, no type="number": los inputs numéricos
                              nativos de Chromium tienen un manejo de selección/backspace poco
                              confiable (seleccionar todo y borrar a veces no vacía el campo).
                              Con texto + inputMode="numeric" el teclado sigue siendo numérico
                              en mobile/touch, pero click → Ctrl+A → Backspace → escribir
                              funciona siempre como se espera (§3). Se valida "solo dígitos"
                              a mano, y el campo puede quedar vacío mientras se edita sin que
                              se lo pise con un 1 forzado — eso se valida recién al guardar. */}
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={actual.cantidad}
                            onChange={(e) => {
                              const bruto = e.target.value;
                              if (bruto !== "" && !/^\d+$/.test(bruto)) return;
                              if (bruto === "") {
                                actualizarActual({ cantidad: "", cantidadManual: true });
                                return;
                              }
                              const n = Number(bruto);
                              actualizarActual({ cantidad: Number.isNaN(n) ? "" : n, cantidadManual: true });
                            }}
                          />
                        </FormField>
                        <FormField label="Precio unitario">
                          {actual.editandoPrecio ? (
                            <CurrencyInput
                              valueCentavos={actual.precioManual ?? 0}
                              onChangeCentavos={(v) => actualizarActual({ precioManual: v })}
                              simbolo={simboloMoneda}
                              autoFocus={!actual.precioCongelado}
                            />
                          ) : (
                            <div className="flex items-center gap-2 h-10">
                              <span className="text-sm font-medium">{formatearMoneda(precioDeRegistro(actual), moneda)}</span>
                              <Badge tono={precioPorPrestacion.has(actual.prestacionId) ? "neutral" : "error"}>
                                {precioPorPrestacion.has(actual.prestacionId) ? "Lista" : "Sin precio"}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => actualizarActual({ editandoPrecio: true, precioManual: precioDeRegistro(actual) })}
                                className="text-carbon/30 hover:text-carbon"
                                title="Editar precio manualmente"
                              >
                                <Pencil size={13} />
                              </button>
                            </div>
                          )}
                        </FormField>
                        <div>
                          <p className="text-carbon/40 text-xs mb-1">Subtotal</p>
                          <p className="font-display text-2xl text-carbon">
                            {formatearMoneda(precioDeRegistro(actual) * cantidadNum(actual), moneda)}
                          </p>
                        </div>

                        <div className="flex justify-end pt-1">
                          <Button type="button" size="sm" variant="secondary" onClick={guardarRegistroActual} disabled={!actualEsValido}>
                            <Check size={14} /> Guardar registro
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-carbon/40 uppercase tracking-wide mb-2">Piezas dentales</p>
                    {actual.prestacionId ? (
                      <Odontograma piezasSeleccionadas={actual.piezas} onChange={onCambiarPiezasActual} />
                    ) : (
                      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-carbon/15 bg-carbon/[0.02] p-6 text-center">
                        <p className="text-sm text-carbon/35">Elegí una prestación para seleccionar las piezas.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!actual && (
              <Button type="button" variant="secondary" size="sm" onClick={otroRegistro}>
                <Plus size={14} /> Otro registro
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-carbon text-cream px-5 py-4">
            <span className="text-sm text-cream/60">Total{moneda === "USD" ? " (USD)" : ""}</span>
            <span className="text-2xl font-display text-gold">{formatearMoneda(total, moneda)}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate(esEdicion ? `/trabajos/${idEditar}` : "/trabajos")}>
              Cancelar
            </Button>
            {esEdicion ? (
              ordenOriginal!.estado === "pendiente_facturar" ? (
                <>
                  <Button variant="secondary" onClick={() => onGuardar(false)} disabled={guardando}>
                    Guardar cambios
                  </Button>
                  <Button onClick={() => onGuardar(true)} disabled={guardando}>
                    {guardando ? "Guardando…" : "Guardar y generar comprobante"}
                  </Button>
                </>
              ) : (
                <Button onClick={() => onGuardar(false)} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </Button>
              )
            ) : (
              <>
                <Button variant="secondary" onClick={() => onGuardar(false)} disabled={guardando}>
                  Guardar
                </Button>
                <Button onClick={() => onGuardar(true)} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar y generar comprobante"}
                </Button>
              </>
            )}
          </div>
          </CardContent>
        </Card>

        <OdontologoForm
          open={nuevoOdontologoAbierto}
          onOpenChange={setNuevoOdontologoAbierto}
          onCreated={(id) => setOdontologoId(id)}
        />

        {esEdicion && ordenOriginal && (
          <ConfirmarEdicionOrdenModal
            open={confirmando}
            onOpenChange={setConfirmando}
            ordenNumero={ordenOriginal.numero}
            importeAnteriorCentavos={ordenOriginal.totalCentavos}
            importeNuevoCentavos={total}
            moneda={moneda}
            tienePagosRegistrados={tienePagosRegistrados ?? false}
            guardando={editarOrden.isPending}
            onConfirmar={() => onGuardar(false)}
          />
        )}
      </div>
    </div>
  );
}
