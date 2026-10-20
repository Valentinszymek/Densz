import { useQuery } from "@tanstack/react-query";

/** Panel privado del dueño de Densz — si la sesión no es superAdmin, el
 * backend tira 403/error antes de llegar acá (ver RutaSoloSuperAdmin). */
export function useLaboratorios() {
  return useQuery({ queryKey: ["laboratorios"], queryFn: () => window.densz.laboratoriosListar() });
}
