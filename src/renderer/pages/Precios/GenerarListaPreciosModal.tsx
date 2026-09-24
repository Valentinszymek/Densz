import { useEffect, useState } from "react";
import { Eye, Printer, FileText } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { SelectBuscable } from "../../components/ui/SelectBuscable";
import { cn } from "../../lib/cn";
import { useListasPrecio, useGenerarListaPrecios, useVerPdfListaPrecios, useImprimirListaPrecios } from "../../features/listasPrecio/hooks";
import { useOdontologos } from "../../features/odontologos/hooks";

interface GenerarListaPreciosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Modo = "lista" | "odontologo";

/** Solo informativa: nunca genera un comprobante, no modifica precios ni
 * trabajos. Modo "lista" usa los precios vigentes de esa lista tal cual
 * están hoy; modo "odontólogo" usa SU lista personalizada asignada — así
 * respeta sus precios propios en vez de los generales (§1 del pedido). */
export function GenerarListaPreciosModal({ open, onOpenChange }: GenerarListaPreciosModalProps) {
  const [modo, setModo] = useState<Modo>("lista");
  const [listaId, setListaId] = useState<number | null>(null);
  const [odontologoId, setOdontologoId] = useState<number | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);

  const { data: listas } = useListasPrecio(true);
  const { data: odontologos } = useOdontologos({ soloActivos: true });
  const generar = useGenerarListaPrecios();
  const verPdf = useVerPdfListaPrecios();
  const imprimir = useImprimirListaPrecios();

  useEffect(() => {
    if (open) {
      setModo("lista");
      setListaId(null);
      setOdontologoId(null);
      setPdfPath(null);
    }
  }, [open]);

  const puedeGenerar = modo === "lista" ? listaId !== null : odontologoId !== null;

  function onGenerar() {
    generar.mutate(
      modo === "lista" ? { listaId: listaId! } : { odontologoId: odontologoId! },
      { onSuccess: (r) => setPdfPath(r.pdfPath) }
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Generar lista de precios"
      description="Un PDF prolijo, listo para mandar por WhatsApp o email. Solo informativo: no genera comprobantes ni afecta trabajos ni cuentas."
      size="sm"
    >
      {!pdfPath ? (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-carbon/15 bg-cream-card p-1 w-full">
            {(["lista", "odontologo"] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  modo === m ? "bg-carbon text-gold" : "text-carbon/60 hover:bg-carbon/5"
                )}
              >
                {m === "lista" ? "Lista general" : "Odontólogo específico"}
              </button>
            ))}
          </div>

          {modo === "lista" ? (
            <SelectBuscable
              opciones={(listas ?? []).map((l) => ({ id: l.id, label: l.nombre, sublabel: l.moneda }))}
              value={listaId}
              onChange={setListaId}
              placeholder="Elegí una lista de precios…"
            />
          ) : (
            <>
              <SelectBuscable
                opciones={(odontologos ?? []).map((o) => ({ id: o.id, label: o.nombre, sublabel: o.listaPrecioNombre }))}
                value={odontologoId}
                onChange={setOdontologoId}
                placeholder="Buscar odontólogo…"
              />
              <p className="text-xs text-carbon/35">Se usan sus precios personalizados, no los generales.</p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onGenerar} disabled={!puedeGenerar || generar.isPending}>
              <FileText size={14} /> {generar.isPending ? "Generando…" : "Generar PDF"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2.5 rounded-lg bg-emerald-600/5 border border-emerald-600/15 px-4 py-3 text-sm text-emerald-800">
            <FileText size={16} className="shrink-0 mt-0.5" />
            <p>La lista de precios se generó correctamente.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPdfPath(null)}>
              Generar otra
            </Button>
            <Button variant="secondary" size="sm" onClick={() => imprimir.mutate(pdfPath)} disabled={imprimir.isPending}>
              <Printer size={14} /> {imprimir.isPending ? "Imprimiendo…" : "Imprimir"}
            </Button>
            <Button size="sm" onClick={() => verPdf.mutate(pdfPath)}>
              <Eye size={14} /> Ver PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
