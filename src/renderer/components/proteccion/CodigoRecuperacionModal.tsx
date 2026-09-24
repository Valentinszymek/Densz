import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

/**
 * Muestra el código de recuperación en texto plano — la ÚNICA vez que
 * existe en algún lado fuera de su hash: se lo entrega quien acaba de
 * activar la protección, generar uno nuevo, o restablecer la contraseña
 * (§8). Después de cerrar este modal, Densz ya no puede volver a
 * mostrarlo — solo puede generar uno nuevo, que invalida este.
 */
export function CodigoRecuperacionModal({
  open,
  onCerrar,
  codigo
}: {
  open: boolean;
  onCerrar: () => void;
  codigo: string | null;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles — el código sigue seleccionable a mano.
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onCerrar()} title="Código de recuperación" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-carbon/60">
          Guardá este código en un lugar seguro. Si alguna vez olvidás la contraseña, vas a poder usarlo para recuperar
          el acceso a Estadísticas y Cuentas.
        </p>
        <p className="font-mono text-lg tracking-wider text-center bg-carbon text-gold rounded-lg py-3.5 px-4 select-all">
          {codigo}
        </p>
        <Button type="button" variant="secondary" onClick={copiar} className="w-full">
          {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Copiado" : "Copiar código"}
        </Button>
        <Button type="button" onClick={onCerrar} className="w-full">
          Ya lo guardé
        </Button>
      </div>
    </Modal>
  );
}
