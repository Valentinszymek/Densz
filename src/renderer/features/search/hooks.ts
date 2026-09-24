import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { ResultadoBusqueda } from "@shared/types/ipc-contracts";

export function useBusquedaGlobal(textoCrudo: string) {
  const texto = useDebouncedValue(textoCrudo.trim(), 250);

  return useQuery<ResultadoBusqueda[]>({
    queryKey: ["busqueda-global", texto],
    queryFn: () => window.densz.buscarGlobal(texto),
    enabled: texto.length >= 2,
    placeholderData: (anterior) => anterior
  });
}
