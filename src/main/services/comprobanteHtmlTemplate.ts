import { formatearMoneda, formatearFecha } from "../utils/formatShared";
import { LOGO_COMPLETO_PDF_DATA_URI } from "./brandAssets";
import type { Moneda } from "../../shared/types/entities";

export interface LineaComprobanteHtml {
  nombre: string;
  piezasFdi: number[];
  cantidad: number;
  precioUnitarioCentavos: number;
  subtotalCentavos: number;
}

export interface DatosComprobanteHtml {
  /** Nombre del laboratorio congelado en el comprobante — `null` (no se
   * muestra la línea "By [laboratorio]") en comprobantes históricos
   * generados antes de que existiera este dato, o si nunca se configuró. */
  laboratorioNombre: string | null;
  /** Dirección y teléfono del odontólogo o clínica dueños de la orden
   * (nunca datos del propio laboratorio) — siempre el valor actual. */
  direccion: string | null;
  telefono: string | null;
  comprobante: { numero: string; fechaEmision: string };
  orden: {
    numero: string;
    fechaTrabajo: string;
    moneda: Moneda;
    totalCentavos: number;
    prestaciones: LineaComprobanteHtml[];
  };
  odontologoNombre: string;
  /** Si la OT es de un profesional de una clínica, se muestra CLÍNICA + PROFESIONAL (§7). */
  clinicaNombre: string | null;
  pacienteNombreCompleto: string;
}

/** Ancho/alto exactos del formulario de papel "DENSZ" registrado en el
 * driver de la Xerox Phaser 3020 — los valores en mm de acá son los
 * EXACTOS que Windows reporta para ese formulario (109.982 × 150.114mm —
 * vienen de 433×591 centésimas de pulgada), no un redondeo. Es la MISMA
 * hoja física tanto para "Ver PDF" como para "Imprimir": una sola
 * plantilla, un solo tamaño de página (§13). */
export const ANCHO_PAGINA_COMPROBANTE_MM = 109.982;
export const ALTO_PAGINA_COMPROBANTE_MM = 150.114;

/** Íconos de línea minimalistas (no son el logo — son pictogramas chicos
 * de apoyo, mismo criterio que la imagen de referencia). Trazo grueso (2)
 * a propósito: uno fino desaparece al imprimirse en la Xerox. */
const ICONO_UBICACION = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICONO_TELEFONO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.8 16.6a1 1 0 0 0 1.2-.3l.4-.5a2 2 0 0 1 1.6-.8h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.5.4a1 1 0 0 0-.3 1.2 14 14 0 0 0 6.4 6.4Z"/></svg>`;
const ICONO_DOCUMENTO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5v4.5h4.5"/></svg>`;
const ICONO_CALENDARIO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 2v6M16 2v6"/></svg>`;
const ICONO_PERSONA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`;
const ICONO_DIENTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2c-1.6 0-2.3.9-3.6.9S6 3.2 4.6 3.7C3.3 4.2 2.5 5.6 2.6 8c.1 2.6.9 4.4 1.5 7 .4 1.8.8 4 1.9 4 1 0 1.1-2 1.4-3.8.3-1.7.8-2.8 1.5-2.8s1.2 1.1 1.5 2.8c.3 1.8.4 3.8 1.4 3.8 1.1 0 1.5-2.2 1.9-4 .6-2.6 1.4-4.4 1.5-7 .1-2.4-.7-3.8-2-4.3C15 3.2 13.6 3.2 12 3.2z"/></svg>`;
const ICONO_MONEDAS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>`;
const ICONO_BILLETERA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h12a2 2 0 0 1 2 2v2Z"/><path d="M3 7v11a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5"/><circle cx="16" cy="14" r="1.2"/></svg>`;

/**
 * Genera el HTML del comprobante — una única plantilla, usada sin ninguna
 * diferencia tanto por "Ver PDF" como por "Imprimir" (§13): mismos datos,
 * mismo diseño, mismo tamaño de página (110×150mm), una sola fuente de
 * verdad para el documento.
 */
export function generarHtmlComprobante(d: DatosComprobanteHtml): string {
  const moneda = d.orden.moneda;

  const items = d.orden.prestaciones
    .map(
      (linea) => `
      <div class="item">
        <div class="item-fila">
          <span class="item-nombre">${linea.nombre}</span>
          <span class="item-cant">×${linea.cantidad}</span>
          <span class="item-subtotal">${formatearMoneda(linea.subtotalCentavos, moneda)}</span>
        </div>
        ${linea.piezasFdi.length ? `<div class="item-piezas">Piezas: ${linea.piezasFdi.join(", ")}</div>` : ""}
      </div>`
    )
    .join("");

  // Cada comprobante se genera junto con la orden recién facturada, antes
  // de cualquier pago (los pagos en Densz se registran contra la cuenta
  // corriente general, no contra una orden puntual) — por eso "Total
  // pagado" y "Saldo pendiente" son siempre estos dos valores fijos en el
  // momento de generación del documento, igual que el resto de sus datos.
  const totalPagadoCentavos = 0;
  const saldoPendienteCentavos = d.orden.totalCentavos;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  /* Declara el tamaño de página DENTRO del propio documento — sin esto,
     el motor de paginación de impresión de Chromium puede terminar
     usando otro alto de página por defecto (el de la impresora/driver
     seleccionada) aunque el tamaño se pase también al llamar a print()
     desde el proceso main. */
  @page { size: ${ANCHO_PAGINA_COMPROBANTE_MM}mm ${ALTO_PAGINA_COMPROBANTE_MM}mm; margin: 0; }
  html, body { width: ${ANCHO_PAGINA_COMPROBANTE_MM}mm; }
  body {
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #111113;
    margin: 0;
    padding: 5.5mm 5.5mm 4mm;
    font-size: 11px;
    line-height: 1.25;
    display: flex;
    flex-direction: column;
    min-height: ${ALTO_PAGINA_COMPROBANTE_MM}mm;
  }
  /* Un ".relleno" flexible entre cada bloque reparte el espacio sobrante
     cuando el comprobante es corto (para que ocupe toda la hoja) y se
     achica a su piso mínimo cuando es largo (para que nunca empuje
     contenido fuera de la página). */
  .relleno { flex: 1 0 1mm; }
  svg { display: block; }

  /* ---------- Encabezado: dirección/teléfono | logo | comprobante/fecha ---------- */
  .cabecera { display: flex; align-items: stretch; }
  .cab-izq { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2.6mm; padding-right: 3mm; }
  .cab-dato { display: flex; align-items: flex-start; gap: 1.6mm; }
  .cab-dato svg { width: 12px; height: 12px; margin-top: 1.5px; flex-shrink: 0; }
  .cab-dato-label { font-size: 6px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E73; }
  .cab-dato-valor { font-size: 8.5px; font-weight: 700; margin-top: 0.5px; line-height: 1.3; }
  .cab-divisor-vertical { width: 1px; background: #B5B2A8; align-self: stretch; }
  .cab-logo { flex: 0 0 auto; text-align: center; padding: 0 4mm; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  /* El archivo del logo es dorado (no se redibuja ni se modifica) — este
     filtro solo cambia cómo se PINTA acá, para que en el comprobante se
     vea en negro sólido como en el diseño aprobado. En el resto de la
     app (por ejemplo el menú lateral) sigue viéndose dorado, sin filtro. */
  .cab-logo img { height: 95px; width: auto; object-fit: contain; display: block; margin: 0 auto; filter: brightness(0); }
  .cab-by { font-size: 6.6px; font-weight: 600; color: #55555A; margin-top: 1.4mm; letter-spacing: 0.2px; }
  .cab-der { flex: 1; text-align: right; padding-left: 3mm; display: flex; flex-direction: column; justify-content: center; }
  .cab-label { font-size: 6px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E73; }
  .cab-valor { font-size: 10.5px; font-weight: 700; margin-top: 0.5px; }
  .cab-der-divisor { height: 1px; background: #B5B2A8; margin: 2.6mm 0; }

  .divisor-encabezado { height: 1.2px; background: #111113; margin-top: 3mm; }

  /* ---------- Tarjeta N.º OT / Paciente / Fecha / Odontólogo ---------- */
  .info-card { border: 1.3px solid #111113; border-radius: 2mm; padding: 3mm 3.2mm; display: grid; grid-template-columns: 1fr 1fr; row-gap: 2.8mm; position: relative; }
  .info-card::after { content: ""; position: absolute; top: 3mm; bottom: 3mm; left: 50%; width: 1px; background: #B5B2A8; }
  .info-celda { display: flex; align-items: flex-start; gap: 2mm; padding-right: 2mm; }
  .info-celda svg { width: 15px; height: 15px; color: #111113; margin-top: 1px; flex-shrink: 0; }
  .info-label { font-size: 6.3px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E73; }
  .info-valor { font-size: 10.5px; font-weight: 700; margin-top: 0.5px; }

  /* ---------- Prestaciones ---------- */
  .tabla-header { display: flex; justify-content: space-between; background: #111113; color: #fff; padding: 1.8mm 2.8mm; border-radius: 1.5mm 1.5mm 0 0; font-size: 6.8px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
  .tabla-body { border: 1.1px solid #111113; border-top: none; border-radius: 0 0 1.5mm 1.5mm; padding: 0 2.8mm; }
  .item { padding: 2mm 0; border-top: 1px solid #D8D5CB; }
  .item:first-child { border-top: none; }
  .item-fila { display: flex; align-items: baseline; }
  .item-nombre { font-size: 12px; font-weight: 700; flex: 1; }
  .item-cant { font-size: 10.5px; font-weight: 600; color: #3a3a3e; width: 14mm; text-align: center; flex-shrink: 0; }
  .item-subtotal { font-size: 10.5px; font-weight: 700; width: 24mm; text-align: right; flex-shrink: 0; }
  .item-piezas { font-size: 10px; font-weight: 600; color: #3a3a3e; margin-top: 0.8mm; }

  /* ---------- Total ---------- */
  .total-block { background: #EAEAEA; border: 1px solid #111113; padding: 2.6mm 3.2mm; display: flex; justify-content: space-between; align-items: center; }
  .total-block .total-label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .total-block .total-valor { font-size: 19px; font-weight: 700; }

  /* ---------- Pagado / Saldo pendiente ---------- */
  .pago-card { border: 1.3px solid #111113; border-radius: 2mm; padding: 3mm 3.2mm; display: grid; grid-template-columns: 1fr 1fr; position: relative; }
  .pago-card::after { content: ""; position: absolute; top: 3mm; bottom: 3mm; left: 50%; width: 1px; background: #B5B2A8; }
  .pago-celda { display: flex; align-items: flex-start; gap: 2mm; padding-right: 2mm; }
  .pago-celda svg { width: 16px; height: 16px; color: #111113; margin-top: 1px; flex-shrink: 0; }
  .pago-label { font-size: 6.3px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E73; }
  .pago-valor { font-size: 10.5px; font-weight: 700; margin-top: 0.5px; }

  /* ---------- Pie ---------- */
  .pie-divisor { height: 1px; background: #111113; margin-bottom: 0.6mm; }
  .pie-divisor + .pie-divisor { margin-top: 0.6mm; }
  .pie { display: flex; align-items: flex-start; gap: 1.6mm; margin-top: 1.6mm; }
  .pie svg { width: 11px; height: 11px; color: #6E6E73; margin-top: 1px; flex-shrink: 0; }
  .pie-texto { font-size: 6.8px; color: #6E6E73; line-height: 1.5; }
</style>
</head>
<body>
  <div class="cabecera">
    <div class="cab-izq">
      ${
        d.direccion
          ? `<div class="cab-dato">
        ${ICONO_UBICACION}
        <div><div class="cab-dato-label">Dirección</div><div class="cab-dato-valor">${d.direccion}</div></div>
      </div>`
          : ""
      }
      ${
        d.telefono
          ? `<div class="cab-dato">
        ${ICONO_TELEFONO}
        <div><div class="cab-dato-label">Teléfono</div><div class="cab-dato-valor">${d.telefono}</div></div>
      </div>`
          : ""
      }
    </div>
    ${d.direccion || d.telefono ? `<div class="cab-divisor-vertical"></div>` : ""}
    <div class="cab-logo">
      <img src="${LOGO_COMPLETO_PDF_DATA_URI}" alt="Densz — Dental Lab" />
      ${d.laboratorioNombre ? `<div class="cab-by">By ${d.laboratorioNombre}</div>` : ""}
    </div>
    <div class="cab-der">
      <div class="cab-label">N.° Comprobante</div>
      <div class="cab-valor">${d.comprobante.numero}</div>
      <div class="cab-der-divisor"></div>
      <div class="cab-label">Fecha de emisión</div>
      <div class="cab-valor">${formatearFecha(d.comprobante.fechaEmision)}</div>
    </div>
  </div>

  <div class="divisor-encabezado"></div>

  <div class="relleno"></div>

  <div class="info-card">
    <div class="info-celda">
      ${ICONO_DOCUMENTO}
      <div><div class="info-label">N.° OT</div><div class="info-valor">${d.orden.numero}</div></div>
    </div>
    <div class="info-celda">
      ${ICONO_PERSONA}
      <div><div class="info-label">Paciente</div><div class="info-valor">${d.pacienteNombreCompleto}</div></div>
    </div>
    <div class="info-celda">
      ${ICONO_CALENDARIO}
      <div><div class="info-label">Fecha del trabajo</div><div class="info-valor">${formatearFecha(d.orden.fechaTrabajo)}</div></div>
    </div>
    <div class="info-celda">
      ${ICONO_DIENTE}
      <div><div class="info-label">${d.clinicaNombre ? "Clínica / Profesional" : "Odontólogo"}</div><div class="info-valor">${d.clinicaNombre ? `${d.clinicaNombre} — ${d.odontologoNombre}` : d.odontologoNombre}</div></div>
    </div>
  </div>

  <div class="relleno"></div>

  <div>
    <div class="tabla-header"><span>Prestación</span><span>Cant.</span><span>Subtotal</span></div>
    <div class="tabla-body">
      ${items}
    </div>
  </div>

  <div class="relleno"></div>

  <div class="total-block">
    <span class="total-label">Total${moneda === "USD" ? " (USD)" : ""}</span>
    <span class="total-valor">${formatearMoneda(d.orden.totalCentavos, moneda)}</span>
  </div>

  <div class="relleno"></div>

  <div class="pago-card">
    <div class="pago-celda">
      ${ICONO_MONEDAS}
      <div><div class="pago-label">Total pagado</div><div class="pago-valor">${formatearMoneda(totalPagadoCentavos, moneda)}</div></div>
    </div>
    <div class="pago-celda">
      ${ICONO_BILLETERA}
      <div><div class="pago-label">Saldo pendiente</div><div class="pago-valor">${formatearMoneda(saldoPendienteCentavos, moneda)}</div></div>
    </div>
  </div>

  <div class="relleno"></div>

  <div class="pie-divisor"></div>
  <div class="pie-divisor"></div>
  <div class="pie">
    ${ICONO_DOCUMENTO}
    <div class="pie-texto">Documento no válido como factura.<br/>Comprobante de entrega interno del laboratorio.</div>
  </div>
</body>
</html>`;
}
