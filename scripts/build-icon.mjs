// Genera build/icon.ico (multi-resolución) e build/icon.png a partir del
// isotipo oficial de Densz — un recorte del logo real provisto por el
// usuario (assets/branding/densz-logo.png en la raíz del proyecto es la
// fuente original completa; build/icon-source.png —copia de
// assets/branding/densz-icono-transparente.png— es ese MISMO diseño,
// recortado a "diente + Densz" (sin "DENTAL LAB", ilegible a tamaño de
// ícono) y CON FONDO TRANSPARENTE, no un cuadrado ni una placa negra: el
// ícono se comporta como el de cualquier app moderna, nunca un logo
// distinto ni redibujado). Se corre una sola vez (o cuando cambie el
// logo); el resultado se versiona en build/.
import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"), "..");
const sourcePath = path.join(projectRoot, "build", "icon-source.png");
const icoPath = path.join(projectRoot, "build", "icon.ico");
const pngPath = path.join(projectRoot, "build", "icon.png");

const sourceBuffer = fs.readFileSync(sourcePath);

// PNG grande para la tienda / builds no-Windows — conserva el canal
// alfa (fondo transparente), sharp no lo aplana salvo que se lo pida.
await sharp(sourceBuffer).resize(512, 512).png().toFile(pngPath);
console.log(`[build-icon] PNG generado en ${pngPath}`);

// .ico necesita varias resoluciones embebidas para verse bien en cada
// contexto de Windows — todas con transparencia real (RGBA), no un
// fondo sólido agregado en el camino.
const tamanos = [16, 24, 32, 48, 64, 128, 256];
const buffers = await Promise.all(tamanos.map((t) => sharp(sourceBuffer).resize(t, t).png().toBuffer()));
const icoBuffer = await pngToIco(buffers);
fs.writeFileSync(icoPath, icoBuffer);
console.log(`[build-icon] ICO generado en ${icoPath} (${tamanos.join(", ")}px)`);
