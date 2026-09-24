import { formatearMoneda, formatearFecha } from "../utils/formatShared";
import type { PrestacionEnLista, Moneda } from "../../shared/types/entities";

export interface DatosListaPreciosHtml {
  laboratorio: { nombre: string; direccion: string; telefono: string };
  /** Solo cuando es una lista personalizada de un odontólogo puntual. */
  odontologoNombre: string | null;
  moneda: Moneda;
  generadoEn: string;
  /** Ya viene ordenado por categoría → prestación (§ mismo orden que en Precios). */
  items: PrestacionEnLista[];
}

interface GrupoCategoria {
  categoria: string;
  items: PrestacionEnLista[];
}

function agruparPorCategoria(items: PrestacionEnLista[]): GrupoCategoria[] {
  const grupos: GrupoCategoria[] = [];
  for (const item of items) {
    // `listarPrestacionesDeLista` siempre trae la categoría (JOIN interno),
    // el fallback es solo para que TS quede tranquilo con el tipo opcional.
    const categoria = item.categoriaNombre ?? "Sin categoría";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.categoria === categoria) {
      ultimo.items.push(item);
    } else {
      grupos.push({ categoria, items: [item] });
    }
  }
  return grupos;
}

function filaPrestacion(it: PrestacionEnLista, moneda: Moneda): string {
  // `precioCentavos` nunca es null acá: quien arma `items` ya filtró las
  // prestaciones sin precio configurado en esta lista (no tiene sentido
  // mandarle al odontólogo una prestación sin precio).
  return `
    <div class="fila">
      <span class="nombre">${it.nombre}</span>
      <span class="precio">${formatearMoneda(it.precioCentavos!, moneda)}</span>
    </div>`;
}

function bloqueCategoria(g: GrupoCategoria, moneda: Moneda): string {
  return `
    <h2>${g.categoria}</h2>
    <div class="lista">${g.items.map((it) => filaPrestacion(it, moneda)).join("")}</div>`;
}

/** Lista de precios lista para mandar por WhatsApp/email — solo
 * informativa: nunca genera un comprobante, no modifica precios ni
 * trabajos. Muestra siempre el precio ACTUALMENTE vigente en la lista (o
 * en la lista personalizada del odontólogo elegido) — a diferencia de un
 * comprobante o resumen mensual, acá es intencional: es "lo que cuesta
 * hoy", no un histórico congelado. */
export function generarHtmlListaPrecios(d: DatosListaPreciosHtml): string {
  const grupos = agruparPorCategoria(d.items);
  const bloques = grupos.map((g) => bloqueCategoria(g, d.moneda)).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0E0E10; margin: 0; padding: 36px 42px; font-size: 12px; }
  .encabezado { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #C9A24B; padding-bottom: 14px; margin-bottom: 18px; }
  .encabezado .nombre { font-size: 19px; font-weight: bold; }
  .encabezado .marca { font-size: 10px; color: #8A6F35; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }
  .encabezado .datos { text-align: right; font-size: 11px; color: #555; }
  h1 { font-size: 16px; letter-spacing: 0.06em; margin: 2px 0 10px; }
  .sub { color: #777; font-size: 11px; margin-bottom: 2px; }
  h2 { font-size: 12px; margin: 22px 0 6px; color: #8A6F35; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #eee; padding-bottom: 4px; page-break-after: avoid; break-after: avoid; }
  .fila { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 4px 0; border-bottom: 1px dotted #ddd; page-break-inside: avoid; break-inside: avoid; }
  .fila .nombre { flex: 1; }
  .fila .precio { font-weight: bold; white-space: nowrap; }
  .vacio { color: #999; font-size: 11px; margin-top: 20px; }
  .pie { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
</style>
</head>
<body>
  <div class="encabezado">
    <div>
      <div class="nombre">${d.laboratorio.nombre}</div>
      <div class="marca">Dental Laboratory</div>
    </div>
    <div class="datos">${d.laboratorio.direccion}<br/>${d.laboratorio.telefono}</div>
  </div>
  <h1>LISTA DE PRECIOS</h1>
  ${d.odontologoNombre ? `<div class="sub">Odontólogo: ${d.odontologoNombre}</div>` : ""}
  <div class="sub">Generado el ${formatearFecha(d.generadoEn)}</div>

  ${bloques || '<div class="vacio">Todavía no hay prestaciones con precio configurado en esta lista.</div>'}

  <div class="pie">Densz — Dental Laboratory Management</div>
</body>
</html>`;
}
