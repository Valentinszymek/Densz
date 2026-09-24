import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";
import { cn } from "../../lib/cn";

export interface OpcionSelectBuscable {
  id: number;
  label: string;
  sublabel?: string;
}

interface SelectBuscableProps {
  opciones: OpcionSelectBuscable[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Mensaje cuando no hay NINGUNA opción para elegir (antes de escribir nada
   * en el buscador) — ej: "No hay pacientes asociados a este odontólogo."
   * Si se está buscando y no hay coincidencias, siempre se muestra "Sin resultados." */
  mensajeVacio?: string;
}

export function SelectBuscable({
  opciones,
  value,
  onChange,
  placeholder = "Seleccionar…",
  disabled,
  mensajeVacio
}: SelectBuscableProps) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const seleccionado = opciones.find((o) => o.id === value) ?? null;

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [opciones, filtro]);

  // El resaltado (navegación con flechas) se reinicia cada vez que cambia
  // la lista filtrada, y nunca queda apuntando fuera de rango.
  useEffect(() => {
    setResaltado(0);
  }, [filtro, abierto]);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    // Mantiene la opción resaltada visible al navegar con flechas.
    const el = listaRef.current?.children[resaltado] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [resaltado, abierto]);

  function elegir(id: number) {
    onChange(id);
    setAbierto(false);
    setFiltro("");
  }

  // Vaciar la selección explícitamente — nunca queda "algo puesto" que el
  // usuario no haya elegido a propósito y no pueda sacar con un solo click.
  function limpiar(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setFiltro("");
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((r) => Math.min(r + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opcion = filtradas[resaltado];
      if (opcion) elegir(opcion.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
    }
  }

  function onKeyDownToggle(e: React.KeyboardEvent) {
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setAbierto(true);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={onKeyDownToggle}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-carbon/15 bg-cream-card px-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className={cn("truncate text-left", !seleccionado && "text-carbon/35")}>
          {seleccionado ? seleccionado.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {seleccionado && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={limpiar}
              title="Quitar selección"
              className="rounded p-0.5 text-carbon/35 hover:text-carbon hover:bg-carbon/5"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} className="text-carbon/40" />
        </span>
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-carbon/10 bg-cream-card shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b border-carbon/10 px-3">
            <Search size={14} className="text-carbon/35" />
            <input
              ref={inputRef}
              autoFocus
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              onKeyDown={onKeyDownInput}
              placeholder="Buscar…"
              role="combobox"
              aria-expanded
              className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-carbon/35"
            />
          </div>
          <div ref={listaRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtradas.length === 0 && (
              <p className="px-3 py-3 text-sm text-carbon/40 text-center">
                {opciones.length === 0 && mensajeVacio ? mensajeVacio : "Sin resultados."}
              </p>
            )}
            {filtradas.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(o.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  i === resaltado ? "bg-gold/10" : "hover:bg-gold/10"
                )}
              >
                <Check size={14} className={cn("shrink-0", o.id === value ? "opacity-100 text-gold-dim" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.sublabel && <span className="text-xs text-carbon/35 shrink-0">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
