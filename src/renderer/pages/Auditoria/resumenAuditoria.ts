import { formatearMoneda, formatearFecha } from "../../lib/format";
import type { Moneda } from "@shared/types/entities";

export interface LookupsAuditoria {
  clinicas: Map<number, string>;
  odontologos: Map<number, string>;
  mediosPago: Map<number, string>;
  listasPrecio: Map<number, string>;
}

export const SIN_LOOKUPS_AUDITORIA: LookupsAuditoria = {
  clinicas: new Map(),
  odontologos: new Map(),
  mediosPago: new Map(),
  listasPrecio: new Map()
};

// *Id conocidos que se resuelven a un nombre legible, por catálogo — si el
// id ya no existe (ej. una clínica borrada), cae a "#id" en vez de romper.
const RESOLUTOR_ID: Record<string, keyof LookupsAuditoria> = {
  clinicaId: "clinicas",
  odontologoId: "odontologos",
  medioPagoId: "mediosPago",
  listaPrecioId: "listasPrecio",
  listaId: "listasPrecio"
};

const ETIQUETA_CAMPO: Record<string, string> = {
  clinicaId: "Clínica",
  odontologoId: "Odontólogo",
  medioPagoId: "Medio de pago",
  listaPrecioId: "Lista de precios",
  listaId: "Lista de precios",
  fecha: "Fecha",
  motivo: "Motivo",
  descripcion: "Descripción",
  numero: "Número",
  nombre: "Nombre",
  nombreCompleto: "Nombre",
  nombreUsuario: "Usuario",
  nombreDispositivo: "Dispositivo",
  nombreVisible: "Nombre visible",
  mensaje: "Detalle",
  clave: "Clave",
  valor: "Valor",
  origen: "Origen",
  anio: "Año",
  mes: "Mes",
  ordenId: "Orden",
  resultado: "Resultado",
  cantidadTrabajos: "Trabajos asociados",
  direccion: "Dirección",
  formato: "Formato"
};

const VALOR_LEGIBLE: Record<string, Record<string, string>> = {
  resultado: {
    eliminado_fisicamente: "Eliminado por completo",
    inactivado_por_historial: "Desactivado (tenía trabajos asociados)"
  }
};

function nombrePorId(valor: unknown, mapa: Map<number, string>): string {
  const id = Number(valor);
  return mapa.get(id) ?? `#${id}`;
}

function etiquetaCampo(clave: string): string {
  return ETIQUETA_CAMPO[clave] ?? clave;
}

// Pares importe/total + moneda que viven como dos claves hermanas en el
// mismo `detalle` — se muestran como una sola línea, nunca como dos.
const CAMPOS_IMPORTE: Array<[clave: string, etiqueta: string]> = [
  ["importeCentavos", "Importe"],
  ["totalCentavos", "Total"],
  ["nuevoPrecioCentavos", "Precio nuevo"]
];

export interface FilaDetalleAuditoria {
  label: string;
  texto: string;
}

/** Convierte el `detalle` crudo (JSON tal como lo guarda el backend) en
 * filas legibles — nunca inventa un campo que el registro no tenga, pero
 * resuelve los *Id conocidos a un nombre real y junta importe+moneda en
 * una sola línea, en vez del volcado clave:valor de antes. Un campo que no
 * está en ningún diccionario simplemente se muestra con su propia clave
 * (compatible hacia adelante con detalles nuevos que todavía no se
 * catalogaron acá). */
export function filasDetalleAuditoria(
  detalle: Record<string, unknown> | null | undefined,
  lookups: LookupsAuditoria = SIN_LOOKUPS_AUDITORIA
): FilaDetalleAuditoria[] {
  if (!detalle) return [];
  const filas: FilaDetalleAuditoria[] = [];
  const vistos = new Set<string>(["cambios", "anterior", "nuevo"]);

  for (const [claveImporte, etiqueta] of CAMPOS_IMPORTE) {
    if (typeof detalle[claveImporte] === "number") {
      const moneda = (detalle.moneda as Moneda | undefined) ?? "ARS";
      filas.push({ label: etiqueta, texto: formatearMoneda(detalle[claveImporte] as number, moneda) });
      vistos.add(claveImporte);
      vistos.add("moneda");
    }
  }

  for (const [clave, valor] of Object.entries(detalle)) {
    if (vistos.has(clave) || valor === null || valor === undefined || typeof valor === "object") continue;

    if (clave in RESOLUTOR_ID) {
      filas.push({ label: etiquetaCampo(clave), texto: nombrePorId(valor, lookups[RESOLUTOR_ID[clave]]) });
      continue;
    }
    if (clave === "fecha") {
      filas.push({ label: "Fecha", texto: formatearFecha(String(valor)) });
      continue;
    }
    filas.push({ label: etiquetaCampo(clave), texto: VALOR_LEGIBLE[clave]?.[String(valor)] ?? String(valor) });
  }

  return filas;
}

/** editarDeuda guarda `{ anterior: {...}, nuevo: {...} }` (mismas claves de
 * los dos lados) en vez de un array `cambios` ya armado — se arma acá en el
 * mismo formato campo/anterior/nuevo que ya sabe mostrar el modal, para no
 * duplicar esa UI. */
export function cambiosDesdeAnteriorNuevo(
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown>
): Array<{ campo: string; anterior: string; nuevo: string }> {
  const formatearLado = (lado: Record<string, unknown>, clave: string): string => {
    const valor = lado[clave];
    if (valor === null || valor === undefined) return "—";
    if (clave === "importeCentavos" || clave === "totalCentavos") {
      return formatearMoneda(valor as number, (lado.moneda as Moneda | undefined) ?? "ARS");
    }
    if (clave === "fecha") return formatearFecha(String(valor));
    return String(valor);
  };

  const claves = new Set([...Object.keys(anterior), ...Object.keys(nuevo)]);
  claves.delete("moneda"); // ya va embebido en el importe formateado

  const cambios: Array<{ campo: string; anterior: string; nuevo: string }> = [];
  for (const clave of claves) {
    const textoAnterior = formatearLado(anterior, clave);
    const textoNuevo = formatearLado(nuevo, clave);
    if (textoAnterior === textoNuevo) continue;
    cambios.push({ campo: etiquetaCampo(clave), anterior: textoAnterior, nuevo: textoNuevo });
  }
  return cambios;
}

/** Resumen de una sola línea para la columna "Detalle" de la tabla. */
export function resumenDetalleAuditoria(
  detalle: Record<string, unknown> | null | undefined,
  lookups: LookupsAuditoria = SIN_LOOKUPS_AUDITORIA
): string {
  if (!detalle) return "—";

  if (Array.isArray(detalle.cambios)) {
    const cambios = detalle.cambios as Array<{ campo: string; anterior: string; nuevo: string }>;
    return cambios.length > 0 ? cambios.map((c) => `${c.campo}: ${c.anterior} → ${c.nuevo}`).join(" · ") : "—";
  }

  if (detalle.anterior && detalle.nuevo && typeof detalle.anterior === "object" && typeof detalle.nuevo === "object") {
    const cambios = cambiosDesdeAnteriorNuevo(
      detalle.anterior as Record<string, unknown>,
      detalle.nuevo as Record<string, unknown>
    );
    return cambios.length > 0 ? cambios.map((c) => `${c.campo}: ${c.anterior} → ${c.nuevo}`).join(" · ") : "—";
  }

  const filas = filasDetalleAuditoria(detalle, lookups);
  return filas.length > 0 ? filas.map((f) => `${f.label}: ${f.texto}`).join(" · ") : "—";
}
