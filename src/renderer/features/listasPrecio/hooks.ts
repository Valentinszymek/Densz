import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosListaPrecioDto, OpcionesListaPreciosDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "listasPrecio";

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
}

export function useListasPrecio(soloActivas = false) {
  return useQuery({ queryKey: [CLAVE, "lista", soloActivas], queryFn: () => window.densz.listasPrecioListar(soloActivas) });
}

export function useListaPrecio(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "detalle", id],
    queryFn: () => window.densz.listasPrecioObtener(id!),
    enabled: id !== undefined
  });
}

export function useCrearListaPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosListaPrecioDto) => window.densz.listasPrecioCrear(data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Lista de precios creada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo crear la lista", descripcion: String(e), tono: "error" })
  });
}

export function useActualizarListaPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nombre }: { id: number; nombre: string }) => window.densz.listasPrecioActualizar(id, nombre),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Lista actualizada", tono: "exito" });
    }
  });
}

export function useSetActivaListaPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.listasPrecioSetActiva(id, activo),
    onSuccess: () => invalidar(qc)
  });
}

export function useUsoListaPrecio(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "uso", id],
    queryFn: () => window.densz.listasPrecioUso(id!),
    enabled: id !== undefined
  });
}

export function useEliminarListaPrecio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.listasPrecioEliminar(id),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Lista eliminada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo eliminar la lista", descripcion: String(e), tono: "error" })
  });
}

export function useItemsListaPrecio(listaId: number | undefined, soloActivas = false) {
  return useQuery({
    queryKey: [CLAVE, "items", listaId, soloActivas],
    queryFn: () => window.densz.listasPrecioItems(listaId!, soloActivas),
    enabled: listaId !== undefined
  });
}

export function useHistorialItemLista(listaId: number | undefined, prestacionId: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "historial", listaId, prestacionId],
    queryFn: () => window.densz.listasPrecioHistorialItem(listaId!, prestacionId!),
    enabled: listaId !== undefined && prestacionId !== undefined
  });
}

export function useCambiarPrecioLista() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listaId,
      prestacionId,
      precioCentavos
    }: {
      listaId: number;
      prestacionId: number;
      precioCentavos: number;
    }) => window.densz.listasPrecioCambiarPrecio(listaId, prestacionId, precioCentavos),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Precio actualizado", descripcion: "Las OT ya creadas conservan su precio anterior.", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo cambiar el precio", descripcion: String(e), tono: "error" })
  });
}

export function useGenerarListaPrecios() {
  return useMutation({
    mutationFn: (opciones: OpcionesListaPreciosDto) => window.densz.listaPreciosGenerar(opciones),
    onError: (e: unknown) => toast({ titulo: "No se pudo generar la lista de precios", descripcion: String(e), tono: "error" })
  });
}

export function useVerPdfListaPrecios() {
  return useMutation({
    mutationFn: (pdfPath: string) => window.densz.listaPreciosVerPdf(pdfPath),
    onError: (e: unknown) => toast({ titulo: "No se pudo abrir el PDF", descripcion: String(e), tono: "error" })
  });
}

export function useImprimirListaPrecios() {
  return useMutation({
    mutationFn: (pdfPath: string) => window.densz.impresoraImprimirPdf(pdfPath),
    onSuccess: () => toast({ titulo: "Enviado a la impresora", tono: "exito" }),
    onError: (e: unknown) => toast({ titulo: "No se pudo imprimir", descripcion: String(e), tono: "error" })
  });
}
