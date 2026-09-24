import type { Queryable } from "../types";
import type { ResumenMensual, Moneda } from "../../../shared/types/entities";
import type { TitularCuenta } from "./movimientosRepo";

export interface DatosNuevoResumen {
  anio: number;
  mes: number;
  moneda: Moneda;
  saldoAnteriorCentavos: number;
  totalTrabajosCentavos: number;
  totalPagosCentavos: number;
  saldoPendienteCentavos: number;
  cantidadTrabajos: number;
  pdfPath: string | null;
  generadoPor: number;
}

/** Inserta un resumen mensual — SIEMPRE una fila nueva, nunca actualiza
 * una existente: volver a generar el mismo período queda registrado como
 * una generación adicional, preservando el historial completo (§15). */
export async function crearResumenMensual(db: Queryable, titular: TitularCuenta, data: DatosNuevoResumen): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO resumenes_mensuales
      (odontologo_id, clinica_id, anio, mes, moneda, saldo_anterior_centavos, total_trabajos_centavos,
       total_pagos_centavos, saldo_pendiente_centavos, cantidad_trabajos, pdf_path, generado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      titular.odontologoId,
      titular.clinicaId,
      data.anio,
      data.mes,
      data.moneda,
      data.saldoAnteriorCentavos,
      data.totalTrabajosCentavos,
      data.totalPagosCentavos,
      data.saldoPendienteCentavos,
      data.cantidadTrabajos,
      data.pdfPath,
      data.generadoPor
    ]
  );
  return rows[0].id;
}

interface FilaResumen {
  id: number;
  odontologo_id: number | null;
  clinica_id: number | null;
  anio: number;
  mes: number;
  moneda: Moneda;
  saldo_anterior_centavos: number;
  total_trabajos_centavos: number;
  total_pagos_centavos: number;
  saldo_pendiente_centavos: number;
  cantidad_trabajos: number;
  pdf_path: string | null;
  generado_por: number;
  generado_por_nombre: string | null;
  generado_en: string;
}

function mapear(f: FilaResumen): ResumenMensual {
  return {
    id: f.id,
    odontologoId: f.odontologo_id,
    clinicaId: f.clinica_id,
    anio: f.anio,
    mes: f.mes,
    moneda: f.moneda,
    saldoAnteriorCentavos: f.saldo_anterior_centavos,
    totalTrabajosCentavos: f.total_trabajos_centavos,
    totalPagosCentavos: f.total_pagos_centavos,
    saldoPendienteCentavos: f.saldo_pendiente_centavos,
    cantidadTrabajos: f.cantidad_trabajos,
    pdfPath: f.pdf_path,
    generadoPor: f.generado_por,
    generadoPorNombre: f.generado_por_nombre ?? undefined,
    generadoEn: f.generado_en
  };
}

const SELECT_BASE = `
  SELECT r.*, u.nombre_completo AS generado_por_nombre
  FROM resumenes_mensuales r
  LEFT JOIN usuarios u ON u.id = r.generado_por
`;

export async function listarResumenesMensuales(db: Queryable, titular: TitularCuenta, limite = 100): Promise<ResumenMensual[]> {
  const columna = titular.clinicaId != null ? "r.clinica_id" : "r.odontologo_id";
  const id = titular.clinicaId ?? titular.odontologoId;
  const { rows } = await db.query<FilaResumen>(
    `${SELECT_BASE} WHERE ${columna} = $1 ORDER BY r.generado_en DESC, r.id DESC LIMIT $2`,
    [id, limite]
  );
  return rows.map(mapear);
}

export async function obtenerResumenMensual(db: Queryable, id: number): Promise<ResumenMensual | null> {
  const { rows } = await db.query<FilaResumen>(`${SELECT_BASE} WHERE r.id = $1`, [id]);
  return rows[0] ? mapear(rows[0]) : null;
}
