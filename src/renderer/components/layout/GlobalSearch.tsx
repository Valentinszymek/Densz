import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Stethoscope, Building2, Users, ClipboardList, Receipt, Loader2 } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useBusquedaGlobal } from "../../features/search/hooks";
import type { TipoResultadoBusqueda, ResultadoBusqueda } from "@shared/types/ipc-contracts";
import { cn } from "../../lib/cn";

const ICONO_POR_TIPO: Record<TipoResultadoBusqueda, typeof Search> = {
  odontologo: Stethoscope,
  clinica: Building2,
  paciente: Users,
  orden: ClipboardList,
  comprobante: Receipt
};

const ETIQUETA_POR_TIPO: Record<TipoResultadoBusqueda, string> = {
  odontologo: "Odontólogo",
  clinica: "Clínica",
  paciente: "Paciente",
  orden: "Orden de trabajo",
  comprobante: "Comprobante"
};

/** A dónde navega cada tipo de resultado: los que tienen ficha propia van
 * directo al registro (con su refId); el resto va al listado general. */
function rutaDeResultado(r: ResultadoBusqueda): string {
  switch (r.tipo) {
    case "odontologo":
      return `/odontologos/${r.refId}`;
    case "clinica":
      return `/clinicas/${r.refId}`;
    case "orden":
      return `/trabajos/${r.refId}`;
    case "paciente":
      return "/pacientes";
    case "comprobante":
      return "/comprobantes";
  }
}

export function GlobalSearch() {
  const abierta = useUiStore((s) => s.busquedaAbierta);
  const setAbierta = useUiStore((s) => s.setBusquedaAbierta);
  const [texto, setTexto] = useState("");
  const navigate = useNavigate();
  const { data: resultados, isFetching, isError } = useBusquedaGlobal(texto);

  function irA(resultado: ResultadoBusqueda) {
    setAbierta(false);
    setTexto("");
    navigate(rutaDeResultado(resultado));
  }

  return (
    <Dialog.Root
      open={abierta}
      onOpenChange={(o) => {
        setAbierta(o);
        if (!o) setTexto("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-carbon/50 backdrop-blur-[2px] z-40" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-50 w-[92vw] max-w-lg -translate-x-1/2 rounded-xl bg-cream-card border border-carbon/10 shadow-lg overflow-hidden focus:outline-none">
          <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>
          <div className="flex items-center gap-3 px-4 border-b border-carbon/10">
            <Search size={18} className="text-carbon/40" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar odontólogo, paciente, N° de OT o comprobante…"
              className="h-14 flex-1 bg-transparent outline-none text-sm placeholder:text-carbon/35"
            />
            {isFetching && <Loader2 size={16} className="animate-spin text-carbon/30" />}
            <kbd className="text-[10px] text-carbon/35 border border-carbon/15 rounded px-1.5 py-0.5">Esc</kbd>
          </div>

          <div className="max-h-80 overflow-y-auto py-2">
            {texto.trim().length < 2 && (
              <p className="px-4 py-6 text-sm text-carbon/40 text-center">
                Escribí al menos 2 caracteres para buscar.
              </p>
            )}
            {texto.trim().length >= 2 && isError && (
              <p className="px-4 py-6 text-sm text-red-600 text-center">
                No se pudo realizar la búsqueda. Probá de nuevo.
              </p>
            )}
            {texto.trim().length >= 2 && !isError && resultados?.length === 0 && !isFetching && (
              <p className="px-4 py-6 text-sm text-carbon/40 text-center">Sin resultados.</p>
            )}
            {resultados?.map((r) => {
              const Icono = ICONO_POR_TIPO[r.tipo];
              return (
                <button
                  key={`${r.tipo}-${r.refId}`}
                  onClick={() => irA(r)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gold/10 transition-colors"
                  )}
                >
                  <Icono size={16} className="text-gold-dim shrink-0" />
                  <span className="flex-1 truncate text-carbon">{r.texto}</span>
                  <span className="text-xs text-carbon/35">{ETIQUETA_POR_TIPO[r.tipo]}</span>
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
