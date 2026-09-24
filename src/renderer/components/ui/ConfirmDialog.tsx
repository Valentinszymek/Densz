import * as AlertDialog from "@radix-ui/react-dialog";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-carbon/50 backdrop-blur-[2px] z-40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-cream-card border border-carbon/10 shadow-lg p-6 focus:outline-none">
          <AlertDialog.Title className="text-base font-semibold text-carbon">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-carbon/60 mt-2">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant={destructive ? "destructive" : "primary"}
              size="sm"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
