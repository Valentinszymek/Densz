// Fuente única de verdad para los dos planes comerciales de Densz
// (docs/PLAN_COMERCIAL_DENSZ.md §0) — la usan tanto la landing
// (Bienvenida.tsx, solo para mostrar el precio) como el backend de
// facturación (billingService.ts, para calcular el monto real del
// checkout). Nunca confiar en un precio que mande el cliente: el server
// siempre recalcula el monto a partir de este archivo.
export type PlanId = "essential" | "professional";

export interface DefinicionPlan {
  id: PlanId;
  nombre: string;
  precioArs: number;
  precioUsd: number;
}

export const PLANES_COMERCIALES: DefinicionPlan[] = [
  { id: "essential", nombre: "Densz Essential", precioArs: 19900, precioUsd: 19 },
  { id: "professional", nombre: "Densz Professional", precioArs: 34900, precioUsd: 35 }
];

export function obtenerPlanComercial(id: string): DefinicionPlan | undefined {
  return PLANES_COMERCIALES.find((p) => p.id === id);
}

export const DIAS_TRIAL = 30;
