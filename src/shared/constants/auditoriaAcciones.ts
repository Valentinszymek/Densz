/** Nombres amigables para las acciones que YA existen en Auditoría — nunca
 * cambia el valor guardado en `accion`, solo cómo se muestra en pantalla y
 * en la exportación. Compartido entre renderer (tabla/detalle) y main
 * (export a CSV/Excel/PDF) para que ambos lados digan siempre lo mismo. */
export const ACCION_LABEL: Record<string, string> = {
  crear: "Creó",
  editar: "Editó",
  modificar: "Modificó",
  anular: "Anuló",
  eliminar: "Eliminó",
  eliminar_definitivo: "Eliminó (definitivo)",
  activar: "Activó",
  desactivar: "Desactivó",
  login: "Inició sesión",
  login_fallido: "Inicio de sesión fallido",
  logout: "Cerró sesión",
  cambiar_precio: "Cambió precio",
  cambiar_precio_personalizado: "Cambió precio personalizado",
  quitar_precio_personalizado: "Quitó precio personalizado",
  generar: "Generó",
  generar_resumen_mensual: "Generó resumen mensual",
  crear_backup: "Creó backup",
  restaurar_backup: "Restauró backup",
  cambiar_password: "Cambió contraseña",
  imprimir_estado_cuenta: "Imprimió estado de cuenta",
  editar_fecha: "Editó fecha",
  activar_proteccion: "Activó la protección",
  desactivar_proteccion: "Desactivó la protección",
  cambiar_password_proteccion: "Cambió la contraseña de acceso protegido",
  recuperar_proteccion: "Recuperó el acceso protegido",
  generar_codigo_proteccion: "Generó un nuevo código de recuperación",
  exportar: "Exportó"
};

export function etiquetaAccion(accion: string): string {
  return ACCION_LABEL[accion] ?? accion;
}
