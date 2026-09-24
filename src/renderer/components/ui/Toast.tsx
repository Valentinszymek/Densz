import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToastStore, type TonoToast } from "../../store/toastStore";
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

export { toast } from "../../store/toastStore";

/** Debe montarse una única vez, cerca de la raíz de la app. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const quitar = useToastStore((s) => s.quitar);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {toasts.map((t) => {
        const Icono = ICONOS[t.tono];
        return (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && quitar(t.id)}
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
      })}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
