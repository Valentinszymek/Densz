import logoCompleto from "../../assets/brand/densz-logo.png";
import logoIsotipo from "../../assets/brand/densz-logo-isotipo.png";
import { cn } from "../../lib/cn";

/**
 * Identidad visual oficial de Densz — el archivo de logo provisto por el
 * usuario (`assets/branding/densz-logo.png` en la raíz del proyecto es la
 * fuente original; estas imágenes son esa misma pieza, con el fondo
 * negro propio del archivo quitado — nunca rediseñada, solo con una
 * variante técnica transparente para integrarse sobre el fondo oscuro de
 * Densz sin quedar encerrada en un recuadro).
 *
 * A propósito NUNCA se fuerzan `width` y `height` iguales: eso es
 * exactamente lo que hacía que el logo se viera "metido en un cuadrado".
 * Solo se fija una altura (`size`) y el ancho fluye solo, respetando la
 * proporción real de la pieza (`height: auto` invertido — acá es
 * `width: auto`) — así el logo respira con su forma natural en vez de
 * quedar recortado a una caja.
 *
 * - `DenszLogo`: el lockup completo (diente + "Densz" + "DENTAL LAB") —
 *   para los lugares con espacio suficiente para que se lea completo
 *   (Login, Splash, sidebar expandido).
 * - `DenszIsotipo`: recorte cuadrado de la MISMA pieza con solo el
 *   diente — únicamente para donde el lockup completo sería ilegible
 *   por el tamaño (sidebar colapsado), igual criterio que el ícono de
 *   Windows.
 */
export function DenszLogo({ className, height = 64 }: { className?: string; height?: number }) {
  return (
    <img
      src={logoCompleto}
      alt="Densz — Dental Lab"
      style={{ height, width: "auto" }}
      className={cn("object-contain shrink-0", className)}
      draggable={false}
    />
  );
}

export function DenszIsotipo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src={logoIsotipo}
      alt="Densz"
      style={{ width: size, height: size }}
      className={cn("object-contain shrink-0", className)}
      draggable={false}
    />
  );
}
