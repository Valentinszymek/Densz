import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../ui/Button";

/** Solo escritorio: aparece cuando electron-updater ya descargó una
 * versión nueva en segundo plano (ver autoUpdaterService.ts). Nunca
 * interrumpe nada en sí — es un banner chico, persistente, que queda ahí
 * hasta que la persona decide reiniciar cuando le convenga (o cierra y
 * vuelve a abrir Densz más tarde, momento en el que igual se aplica sola
 * gracias a `autoInstallOnAppQuit`). En web es un no-op (ver webApi.ts). */
export function ActualizacionBanner() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window.densz === "undefined") return;
    return window.densz.onActualizacionLista((v) => setVersion(v));
  }, []);

  if (!version) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-gold/30 bg-carbon text-cream px-4 py-3 shadow-xl max-w-sm">
      <Sparkles size={18} className="shrink-0 text-gold" />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">Densz {version} ya está lista</p>
        <p className="text-xs text-cream/50">Se descargó sola — reiniciá cuando quieras para usarla.</p>
      </div>
      <Button variant="gold" size="sm" className="shrink-0" onClick={() => window.densz.reiniciarParaActualizar()}>
        Reiniciar
      </Button>
    </div>
  );
}
