import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Odontogram as OdontogramaLib, getViewBox, type ToothDetail } from "react-odontogram";
import "react-odontogram/style.css";
import { X, CheckSquare, Square } from "lucide-react";
import { FILA_SUPERIOR, FILA_INFERIOR, CUADRANTES, TODAS_LAS_PIEZAS, alternarPieza, alternarCuadrante } from "./piezaUtils";
import { cn } from "../../lib/cn";

interface OdontogramaProps {
  piezasSeleccionadas: number[];
  onChange: (piezas: number[]) => void;
  /** Modo compacto: usado cuando hay varias prestaciones y cada una tiene su propio odontograma. */
  compacto?: boolean;
}

// La representación visual de cada pieza (silueta anatómica real, no una
// forma geométrica genérica) viene de react-odontogram — una librería MIT,
// sin dependencias de red, con paths dibujados a mano para cada una de las
// 32 piezas. Acá solo se conecta esa librería con el modelo de datos de
// Densz (números FDI) y se agrega lo que la librería no trae:
// - Numeración FDI SIEMPRE visible sobre cada pieza (la librería solo la
//   muestra al pasar el mouse, en un tooltip).
// - Acciones rápidas por cuadrante, seleccionar todas / limpiar.
// - Resumen de piezas seleccionadas, con chips removibles.
const COLORES_DENSZ = {
  darkBlue: "#8A6F35", // borde de pieza seleccionada (gold-dim)
  baseBlue: "rgba(14,14,16,0.4)", // borde de pieza sin seleccionar (carbon)
  lightBlue: "#C9A24B" // relleno de pieza seleccionada / hover (gold)
};

const idLib = (pieza: number) => `teeth-${pieza}`;
const piezaDesdeDetalle = (t: ToothDetail): number => Number(t.notations.fdi);

interface EtiquetaFdi {
  fdi: string;
  x: number;
  y: number;
}

/** Centro real (en coordenadas del `<svg>` raíz) de un elemento que puede
 * estar dentro de ancestros con su propia transformación — la librería
 * dibuja las piezas del cuadrante 2 espejando el mismo path del cuadrante
 * 1 con un `transform` en un `<g>` padre, así que un `getBBox()` simple
 * (que ignora las transformaciones de los ancestros) da la MISMA posición
 * para 11 y 21, 12 y 22, etc. Para la posición final hay que componer la
 * matriz de pantalla del elemento con la inversa de la del `<svg>` raíz. */
function centroEnSvgRaiz(svgRaiz: SVGSVGElement, elemento: SVGGraphicsElement): { x: number; y: number } | null {
  const ctmElemento = elemento.getScreenCTM();
  const ctmRaiz = svgRaiz.getScreenCTM();
  if (!ctmElemento || !ctmRaiz) return null;
  const caja = elemento.getBBox();
  const puntoLocal = svgRaiz.createSVGPoint();
  puntoLocal.x = caja.x + caja.width / 2;
  puntoLocal.y = caja.y + caja.height / 2;
  const puntoPantalla = puntoLocal.matrixTransform(ctmElemento);
  const puntoEnRaiz = puntoPantalla.matrixTransform(ctmRaiz.inverse());
  return { x: puntoEnRaiz.x, y: puntoEnRaiz.y };
}

/** Lee, después de montado el SVG de la librería, el centro real de cada
 * pieza para poder superponerle el número FDI en un overlay propio — la
 * librería no expone esas coordenadas como prop. */
function useEtiquetasFdi(contenedorRef: React.RefObject<HTMLDivElement>, dependencia: unknown) {
  const [etiquetas, setEtiquetas] = useState<EtiquetaFdi[]>([]);

  useLayoutEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const svgRaiz = contenedor.querySelector<SVGSVGElement>("svg.Odontogram");
    if (!svgRaiz) return;
    const grupos = svgRaiz.querySelectorAll<SVGGElement>('g[aria-label^="Tooth "]');
    const resultado: EtiquetaFdi[] = [];
    grupos.forEach((g) => {
      const fdi = (g.getAttribute("aria-label") ?? "").replace("Tooth ", "");
      if (!fdi) return;
      const centro = centroEnSvgRaiz(svgRaiz, g);
      if (centro) resultado.push({ fdi, x: centro.x, y: centro.y });
    });
    setEtiquetas(resultado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencia]);

  return etiquetas;
}

function MediaArcada({
  mitad,
  piezas,
  seleccionSet,
  onCambiar,
  generacion
}: {
  mitad: "upper" | "lower";
  piezas: number[];
  seleccionSet: Set<number>;
  onCambiar: (detalle: ToothDetail[]) => void;
  generacion: number;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const seleccionInicial = useMemo(
    () => piezas.filter((p) => seleccionSet.has(p)).map(idLib),
    // Solo se recalcula cuando cambia la "generación" (un cambio externo:
    // cuadrante, seleccionar todas, limpiar) — un clic directo en una
    // pieza lo maneja la librería sola, sin necesidad de remontar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generacion]
  );
  const etiquetas = useEtiquetasFdi(contenedorRef, generacion);
  const viewBox = useMemo(() => getViewBox("circle", mitad), [mitad]);

  return (
    <div ref={contenedorRef} className="relative">
      <OdontogramaLib
        key={generacion}
        defaultSelected={seleccionInicial}
        onChange={onCambiar}
        notation="FDI"
        theme="light"
        colors={COLORES_DENSZ}
        showHalf={mitad}
        showTooltip={false}
      />
      <svg viewBox={viewBox} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {etiquetas.map((e) => (
          <text
            key={e.fdi}
            x={e.x}
            y={e.y}
            textAnchor="middle"
            dominantBaseline="middle"
            paintOrder="stroke"
            stroke="#FFFFFF"
            strokeWidth={3}
            className={cn(
              "text-[13px] font-bold select-none",
              seleccionSet.has(Number(e.fdi)) ? "fill-gold-dim" : "fill-carbon/75"
            )}
          >
            {e.fdi}
          </text>
        ))}
      </svg>
    </div>
  );
}

/**
 * Odontograma de Densz (nomenclatura FDI, 32 piezas adultas), construido
 * sobre `react-odontogram` (MIT, sin conexión a internet en tiempo de
 * ejecución) para la representación anatómica de cada pieza según su tipo
 * — incisivo, canino, premolar o molar — con arcada superior e inferior
 * separadas. Se le suma numeración FDI siempre visible, acciones rápidas
 * por cuadrante, selección múltiple, y resumen de piezas seleccionadas.
 */
export function Odontograma({ piezasSeleccionadas, onChange, compacto = false }: OdontogramaProps) {
  const seleccionSet = useMemo(() => new Set(piezasSeleccionadas), [piezasSeleccionadas]);
  // Se incrementa en cada cambio "externo" (cuadrante / todas / limpiar /
  // quitar un chip) para forzar que ambas mitades vuelvan a leer
  // `piezasSeleccionadas` como su selección inicial. Un clic directo sobre
  // una pieza NO lo toca: la librería ya actualiza su propio dibujo sola.
  const [generacion, setGeneracion] = useState(0);

  function cambioExterno(nuevasPiezas: number[]) {
    onChange(nuevasPiezas.sort((a, b) => a - b));
    setGeneracion((g) => g + 1);
  }

  function alternar(pieza: number) {
    cambioExterno(alternarPieza(piezasSeleccionadas, pieza));
  }

  function alternarCuad(piezas: number[]) {
    cambioExterno(alternarCuadrante(piezasSeleccionadas, piezas));
  }

  function onCambioSuperior(detalle: ToothDetail[]) {
    const nuevasSuperior = detalle.map(piezaDesdeDetalle);
    const inferiorActual = piezasSeleccionadas.filter((p) => FILA_INFERIOR.includes(p));
    onChange([...nuevasSuperior, ...inferiorActual].sort((a, b) => a - b));
  }

  function onCambioInferior(detalle: ToothDetail[]) {
    const nuevasInferior = detalle.map(piezaDesdeDetalle);
    const superiorActual = piezasSeleccionadas.filter((p) => FILA_SUPERIOR.includes(p));
    onChange([...superiorActual, ...nuevasInferior].sort((a, b) => a - b));
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-cream-card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex flex-wrap gap-1.5">
          {CUADRANTES.map((c) => {
            const todas = c.piezas.every((p) => seleccionSet.has(p));
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => alternarCuad(c.piezas)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
                  todas
                    ? "bg-gold/15 border-gold/40 text-gold-dim"
                    : "border-carbon/15 text-carbon/50 hover:border-gold/40 hover:text-gold-dim"
                )}
                title={`Seleccionar/deseleccionar cuadrante ${c.etiqueta}`}
              >
                {todas ? <CheckSquare size={11} /> : <Square size={11} />}
                {c.etiqueta}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => cambioExterno(TODAS_LAS_PIEZAS)}
            className="text-carbon/45 hover:text-gold-dim underline underline-offset-2"
          >
            Seleccionar todas
          </button>
          <span className="text-carbon/20">·</span>
          <button
            type="button"
            onClick={() => cambioExterno([])}
            className="text-carbon/45 hover:text-gold-dim underline underline-offset-2"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className={cn("mx-auto space-y-1", compacto ? "max-w-[280px]" : "max-w-[360px]")}>
        <MediaArcada
          mitad="upper"
          piezas={FILA_SUPERIOR}
          seleccionSet={seleccionSet}
          onCambiar={onCambioSuperior}
          generacion={generacion}
        />
        <MediaArcada
          mitad="lower"
          piezas={FILA_INFERIOR}
          seleccionSet={seleccionSet}
          onCambiar={onCambioInferior}
          generacion={generacion}
        />
      </div>

      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-carbon/10 flex-wrap min-h-[2rem]">
        {piezasSeleccionadas.length === 0 && (
          <p className="text-xs text-carbon/35">Ninguna pieza seleccionada — hacé clic en el odontograma.</p>
        )}
        {piezasSeleccionadas.length > 0 && (
          <span className="text-[11px] font-medium text-carbon/40 mr-1">
            {piezasSeleccionadas.length === 1 ? "1 pieza:" : `${piezasSeleccionadas.length} piezas:`}
          </span>
        )}
        {piezasSeleccionadas.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold-dim text-xs font-medium pl-2.5 pr-1.5 py-1"
          >
            {p}
            <button type="button" onClick={() => alternar(p)} className="hover:opacity-60">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
