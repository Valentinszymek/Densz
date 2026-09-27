import { useEffect, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToastStore, type TonoToast, type ToastItem } from "../../store/toastStore";
import { cn } from "../../lib/cn";

const ICONOS: Record<TonoToast, typeof Info> = {
  info: Info,
  exito: CheckCircle2,
  error: XCircle
};

const COLORES: Record<TonoToast, string> = {
  info: "border-carbon/10 text-carbon",
  exito: "border-emerald-600/30 text-emerald-700",
  error: "border-red-600/30 text-red-700"
};

/** Cuánto tiempo queda visible un toast antes de cerrarse solo. */
const DURACION_MS = 4000;

/** Un toast por vez, con su propio temporizador de auto-cierre.
 *
 * No usa el `duration` de Radix: ese timer interno de Radix Toast no es
 * resiliente al doble montaje de efectos de React.StrictMode (en
 * desarrollo, monta → limpia → vuelve a montar), y esa doble invocación
 * confunde su cálculo de tiempo transcurrido — el toast terminaba
 * cerrándose mucho antes de los 4000ms configurados. Un `useEffect` propio
 * con `setTimeout`/`clearTimeout` sí es resiliente a eso (StrictMode
 * cancela el primer timer en la limpieza simulada y arranca uno nuevo en
 * el remontaje, así que el timer real sigue midiendo los 4000ms correctos
 * desde el montaje "de verdad"). `duration={Infinity}` en el `Root`
 * desactiva el auto-cierre propio de Radix para que no compita con este. */
function Toast({ t, onClose }: { t: ToastItem; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const Icono = ICONOS[t.tono];

  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), DURACION_MS);
    return () => clearTimeout(timer);
  }, []);

  // Al cerrarse (por el timer de arriba, por el botón de cerrar o por swipe)
  // se le da tiempo a la animación de salida antes de sacarlo del estado
  // global — si se saca de una, React lo desmonta de golpe y la animación
  // de salida nunca se ve.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(onClose, 200);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  return (
    <ToastPrimitive.Root
      open={open}
      duration={Infinity}
      onOpenChange={setOpen}
      className={cn(
        "flex items-start gap-3 rounded-lg bg-cream-card border shadow-card px-4 py-3 w-80",
        "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=open]:fade-in",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out",
        COLORES[t.tono]
      )}
    >
      <Icono size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <ToastPrimitive.Title className="font-medium">{t.titulo}</ToastPrimitive.Title>
        {t.descripcion && (
          <ToastPrimitive.Description className="text-carbon/60 mt-0.5">
            {t.descripcion}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Close className="text-carbon/30 hover:text-carbon">
        <X size={14} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export { toast } from "../../store/toastStore";

/** Debe montarse una única vez, cerca de la raíz de la app. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const quitar = useToastStore((s) => s.quitar);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast key={t.id} t={t} onClose={() => quitar(t.id)} />
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
