import { formatearMoneda, formatearFecha } from "../utils/formatShared";
import type { TrabajoFacturadoMes, Pago, BloqueCuentaMoneda } from "../../shared/types/entities";

const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export interface DatosEstadoCuentaHtml {
  laboratorio: { nombre: string; direccion: string; telefono: string };
  /** Nombre del titular de la cuenta: un odontólogo independiente o una clínica. */
  titularNombre: string;
  /** Solo cuando el titular es una clínica: se agrega la columna "Profesional" a cada trabajo. */
  mostrarProfesional: boolean;
  generadoEn: string;
  anio: number;
  /** 1-12 */
  mes: number;
  bloques: BloqueCuentaMoneda[];
}

/** "Corona de zirconio × 10", una línea por prestación de la OT — con la
 * cantidad congelada en la propia OT (§ precio/cantidad histórico, nunca el
 * catálogo actual). Si por algún motivo no hay detalle cargado, cae al
 * resumen plano de siempre en vez de dejar la celda vacía. */
/** Piezas dentales y cantidad de servicio son conceptos distintos (nunca se
 * confunden): si la prestación tiene piezas seleccionadas se informa esa
 * cantidad de piezas; si no usa piezas (ej. un modelo), se informa la
 * cantidad del servicio en su lugar — nunca ambas, nunca inventado. */
function lineaPrestacion(p: { nombre: string; cantidad: number; cantidadPiezas: number }): string {
  if (p.cantidadPiezas > 0) return `${p.nombre} — piezas ${p.cantidadPiezas}`;
  if (p.cantidad > 1) return `${p.nombre} — cantidad ${p.cantidad}`;
  return p.nombre;
}

function detalleTrabajo(t: TrabajoFacturadoMes): string {
  if (t.prestacionesDetalle.length === 0) return t.prestacionesResumen;
  return t.prestacionesDetalle.map(lineaPrestacion).join("<br/>");
}

function filaTrabajo(t: TrabajoFacturadoMes, mostrarProfesional: boolean): string {
  return `
    <tr class="${t.anulado ? "anulado" : ""}">
      <td>${t.ordenNumero}</td>
      <td>${t.fechaFacturacion ? formatearFecha(t.fechaFacturacion) : "—"}</td>
      ${mostrarProfesional ? `<td>${t.profesionalNombre}</td>` : ""}
      <td>${t.pacienteNombreCompleto}</td>
      <td class="detalle">${detalleTrabajo(t)}${t.anulado ? " (anulado)" : ""}</td>
      <td class="num">${formatearMoneda(t.importeCentavos, t.moneda)}</td>
    </tr>`;
}

function filaPago(p: Pago): string {
  return `
    <tr class="${p.anulado ? "anulado" : ""}">
      <td>${formatearFecha(p.fecha)}</td>
      <td>${p.medioPagoNombre ?? "—"}${p.anulado ? " (anulado)" : ""}</td>
      <td class="num">${formatearMoneda(p.importeCentavos, p.moneda)}</td>
    </tr>`;
}

function bloqueHtml(b: BloqueCuentaMoneda, mostrarProfesional: boolean): string {
  const colspanTrabajos = mostrarProfesional ? 6 : 5;
  const filasTrabajos = b.trabajos.map((t) => filaTrabajo(t, mostrarProfesional)).join("");
  const filasPagos = b.pagosDelMes.map(filaPago).join("");

  return `
  <div class="bloque-moneda">
    <h2>${b.moneda}</h2>
    <div class="resumen">
      <div class="item"><div class="etq">Saldo anterior</div><div class="val">${formatearMoneda(b.saldoAnteriorCentavos, b.moneda)}</div></div>
      <div class="item"><div class="etq">Trabajos del mes</div><div class="val">${formatearMoneda(b.totalTrabajosCentavos, b.moneda)}</div><div class="detalle">${b.trabajos.filter((t) => !t.anulado).length} trabajo(s)</div></div>
      <div class="item"><div class="etq">Pagos del mes</div><div class="val pos">${formatearMoneda(b.totalPagosCentavos, b.moneda)}</div></div>
      <div class="item destacado"><div class="etq">Saldo pendiente</div><div class="val">${formatearMoneda(b.saldoPendienteCentavos, b.moneda)}</div></div>
    </div>

    <h3>Trabajos del mes</h3>
    <table>
      <thead><tr>
        <th>N° OT</th><th>Fecha</th>${mostrarProfesional ? "<th>Profesional</th>" : ""}<th>Paciente</th><th>Trabajo / detalle</th><th class="num">Total</th>
      </tr></thead>
      <tbody>${filasTrabajos || `<tr><td colspan="${colspanTrabajos}" class="vacio">Sin trabajos facturados este mes.</td></tr>`}</tbody>
    </table>

    <h3>Pagos del mes</h3>
    <table>
      <thead><tr><th>Fecha</th><th>Medio de pago</th><th class="num">Importe</th></tr></thead>
      <tbody>${filasPagos || '<tr><td colspan="3" class="vacio">Sin pagos registrados este mes.</td></tr>'}</tbody>
    </table>
  </div>`;
}

/** Resumen mensual profesional: por cada moneda con actividad, saldo
 * anterior + trabajos del mes (uno por OT, con sus prestaciones) + pagos
 * del mes + saldo pendiente resultante — pensado para mandárselo tal cual
 * al odontólogo/clínica a fin de mes. */
export function generarHtmlEstadoCuenta(d: DatosEstadoCuentaHtml): string {
  const nombreMes = NOMBRES_MES[d.mes - 1] ?? String(d.mes);
  const bloques = d.bloques.map((b) => bloqueHtml(b, d.mostrarProfesional)).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0E0E10; margin: 0; padding: 36px 42px; font-size: 12px; }
  .encabezado { display: flex; justify-content: space-between; border-bottom: 2px solid #C9A24B; padding-bottom: 14px; margin-bottom: 18px; }
  .encabezado .nombre { font-size: 19px; font-weight: bold; }
  .encabezado .datos { text-align: right; font-size: 11px; color: #555; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 26px 0 8px; color: #8A6F35; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  h3 { font-size: 11px; margin: 16px 0 6px; color: #777; text-transform: uppercase; letter-spacing: 0.03em; }
  .sub { color: #777; font-size: 11px; margin-bottom: 4px; }
  .resumen { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .resumen .item { flex: 1; min-width: 120px; border: 1px solid #eee; border-radius: 6px; padding: 9px 11px; }
  .resumen .item.destacado { background: #FAF3E3; border-color: #C9A24B55; }
  .resumen .item .etq { font-size: 9px; text-transform: uppercase; color: #999; }
  .resumen .item .val { font-size: 15px; font-weight: bold; margin-top: 2px; }
  .resumen .item .val.pos { color: #0a7d4f; }
  .resumen .item .detalle { font-size: 9px; color: #999; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #777; border-bottom: 1px solid #ddd; padding: 5px 6px; }
  /* vertical-align: top — cuando "detalle" ocupa varias líneas (una prestación
     por línea), el resto de las columnas de esa fila (N° OT, fecha, paciente,
     total) quedan alineadas arriba, a la altura de la primera línea, en vez
     de "flotar" centradas en una fila que ahora puede ser bastante más alta. */
  td { padding: 6px; border-bottom: 1px solid #f0f0f0; font-size: 11px; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  .num { text-align: right; white-space: nowrap; }
  td.detalle { line-height: 1.5; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  tr.anulado td { color: #bbb; text-decoration: line-through; }
  .vacio { color: #999; text-decoration: none; padding: 12px 6px; }
  .pie { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
</style>
</head>
<body>
  <div class="encabezado">
    <div class="nombre">${d.laboratorio.nombre}</div>
    <div class="datos">${d.laboratorio.direccion}<br/>${d.laboratorio.telefono}</div>
  </div>
  <h1>Resumen mensual de trabajos</h1>
  <div class="sub">Período: ${nombreMes} ${d.anio}</div>
  <div class="sub">${d.mostrarProfesional ? "Clínica" : "Odontólogo"}: ${d.titularNombre}</div>
  <div class="sub">Generado el ${formatearFecha(d.generadoEn)}</div>

  ${bloques}

  <div class="pie">Densz — Dental Laboratory Management</div>
</body>
</html>`;
}
