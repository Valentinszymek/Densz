import { useState, useEffect } from "react";
import { Printer, RefreshCw, Check, MonitorX } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { useImpresorasDisponibles, useSeleccionarImpresora } from "../../features/impresora/hooks";

export function ImpresoraSelectorModal({
  open,
  onOpenChange,
  seleccionActual
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seleccionActual: string | undefined;
}) {
  const { data: impresoras, isLoading, isError, refetch, isFetching } = useImpresorasDisponibles();
  const seleccionar = useSeleccionarImpresora();
  const [elegida, setElegida] = useState<string | null>(null);

  useEffect(() => {
    if (open) setElegida(seleccionActual ?? null);
  }, [open, seleccionActual]);

  if (isError) {
    return (
      <Modal open={open} onOpenChange={onOpenChange} title="Elegir impresora predeterminada" size="sm">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MonitorX size={28} className="text-carbon/30" />
          <p className="text-sm text-carbon">Esta función solo está disponible en la aplicación de escritorio de Densz.</p>
          <p className="text-xs text-carbon/45">
            Para imprimir desde Densz Web, generá el PDF y utilizá el diálogo de impresión del navegador.
          </p>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Entendido
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Elegir impresora predeterminada" size="sm">
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 text-xs text-carbon/45 hover:text-carbon"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Actualizar lista
          </button>
        </div>

        {isLoading && <p className="text-sm text-carbon/40">Detectando impresoras…</p>}
        {!isLoading && impresoras?.length === 0 && (
          <p className="text-sm text-carbon/40">No se detectó ninguna impresora instalada en Windows.</p>
        )}

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {impresoras?.map((p) => (
            <button
              key={p.nombreDispositivo}
              type="button"
              onClick={() => setElegida(p.nombreDispositivo)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm",
                elegida === p.nombreDispositivo
                  ? "border-gold bg-gold/10 text-gold-dim"
                  : "border-carbon/10 hover:border-carbon/25"
              )}
            >
              <Printer size={15} className="shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{p.nombreVisible}</span>
                <span className="block text-xs text-carbon/40">
                  {p.disponible ? "Disponible" : "No disponible"}
                  {p.predeterminadaDelSistema ? " · Predeterminada de Windows" : ""}
                </span>
              </span>
              {elegida === p.nombreDispositivo && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!elegida || seleccionar.isPending}
            onClick={() => {
              const p = impresoras?.find((x) => x.nombreDispositivo === elegida);
              if (!p) return;
              seleccionar.mutate(
                { nombreDispositivo: p.nombreDispositivo, nombreVisible: p.nombreVisible },
                { onSuccess: () => onOpenChange(false) }
              );
            }}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
