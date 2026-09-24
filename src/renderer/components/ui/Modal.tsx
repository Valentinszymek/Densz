import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

const TAMANOS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl"
};

export function Modal({ open, onOpenChange, title, description, children, size = "md" }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-carbon/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out z-40" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-cream-card border border-carbon/10 shadow-lg focus:outline-none",
            TAMANOS[size]
          )}
        >
          <div className="flex items-start justify-between px-6 pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-carbon">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-carbon/60 mt-1">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-md p-1 text-carbon/40 hover:text-carbon hover:bg-carbon/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
