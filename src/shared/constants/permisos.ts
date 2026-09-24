export const ROLES = {
  ADMINISTRADOR: "ADMINISTRADOR",
  RECEPCION: "RECEPCION"
} as const;

export type RolNombre = (typeof ROLES)[keyof typeof ROLES];

export const PERMISOS = {
  TODO: "*",
  ORDENES_CREAR: "ordenes.crear",
  ORDENES_VER: "ordenes.ver",
  ORDENES_ANULAR: "ordenes.anular",
  ORDENES_ELIMINAR: "ordenes.eliminar",
  PACIENTES_CREAR: "pacientes.crear",
  PACIENTES_VER: "pacientes.ver",
  ODONTOLOGOS_CREAR: "odontologos.crear",
  ODONTOLOGOS_VER: "odontologos.ver",
  CLINICAS_CREAR: "clinicas.crear",
  CLINICAS_VER: "clinicas.ver",
  PRECIOS_EDITAR: "precios.editar",
  PAGOS_CREAR: "pagos.crear",
  PAGOS_VER: "pagos.ver",
  PAGOS_ANULAR: "pagos.anular",
  COMPROBANTES_CREAR: "comprobantes.crear",
  COMPROBANTES_VER: "comprobantes.ver",
  BACKUPS_GESTIONAR: "backups.gestionar",
  USUARIOS_GESTIONAR: "usuarios.gestionar",
  CONFIGURACION_EDITAR: "configuracion.editar",
  AUDITORIA_VER: "auditoria.ver",
  CUENTAS_VER: "cuentas.ver",
  ESTADISTICAS_VER: "estadisticas.ver"
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export function tienePermiso(permisosUsuario: string[], requerido: Permiso): boolean {
  return permisosUsuario.includes(PERMISOS.TODO) || permisosUsuario.includes(requerido);
}
