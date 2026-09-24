import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatosPrestacionDto, FiltroPrestacionesDto } from "@shared/types/ipc-contracts";
import { toast } from "../../store/toastStore";

const CLAVE = "precios";

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CLAVE] });
  qc.invalidateQueries({ queryKey: ["listasPrecio"] });
}

// Categorías
export function useCategorias(soloActivas = false) {
  return useQuery({ queryKey: [CLAVE, "categorias", soloActivas], queryFn: () => window.densz.categoriasListar(soloActivas) });
}

export function useCrearCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => window.densz.categoriasCrear(nombre),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Categoría creada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo crear la categoría", descripcion: String(e), tono: "error" })
  });
}

export function useActualizarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nombre }: { id: number; nombre: string }) => window.densz.categoriasActualizar(id, nombre),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Categoría actualizada", tono: "exito" });
    }
  });
}

export function useSetActivaCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.categoriasSetActiva(id, activo),
    onSuccess: () => invalidar(qc)
  });
}

export function useMoverCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direccion }: { id: number; direccion: "arriba" | "abajo" }) =>
      window.densz.categoriasMover(id, direccion),
    onSuccess: () => invalidar(qc)
  });
}

export function useUsoCategoria(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "categorias", "uso", id],
    queryFn: () => window.densz.categoriasUso(id!),
    enabled: id !== undefined
  });
}

export function useEliminarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.categoriasEliminar(id),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Categoría eliminada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo eliminar la categoría", descripcion: String(e), tono: "error" })
  });
}

// Prestaciones (catálogo — el precio vive en las listas de precios)
export function usePrestaciones(filtro: FiltroPrestacionesDto = {}) {
  return useQuery({ queryKey: [CLAVE, "prestaciones", filtro], queryFn: () => window.densz.prestacionesListar(filtro) });
}

export function useCrearPrestacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DatosPrestacionDto) => window.densz.prestacionesCrear(data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Prestación creada", descripcion: "Definile un precio en cada lista que la necesite.", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo crear", descripcion: String(e), tono: "error" })
  });
}

export function useActualizarPrestacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatosPrestacionDto }) => window.densz.prestacionesActualizar(id, data),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Prestación actualizada", tono: "exito" });
    }
  });
}

export function useSetActivaPrestacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => window.densz.prestacionesSetActiva(id, activo),
    onSuccess: () => invalidar(qc)
  });
}

export function usePrestacion(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "prestacion", id],
    queryFn: () => window.densz.prestacionesObtener(id!),
    enabled: id !== undefined
  });
}

export function useUsoPrestacion(id: number | undefined) {
  return useQuery({
    queryKey: [CLAVE, "prestaciones", "uso", id],
    queryFn: () => window.densz.prestacionesUso(id!),
    enabled: id !== undefined
  });
}

export function useEliminarPrestacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => window.densz.prestacionesEliminar(id),
    onSuccess: () => {
      invalidar(qc);
      toast({ titulo: "Prestación eliminada", tono: "exito" });
    },
    onError: (e: unknown) => toast({ titulo: "No se pudo eliminar la prestación", descripcion: String(e), tono: "error" })
  });
}
