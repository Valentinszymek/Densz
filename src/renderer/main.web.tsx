import React from "react";
import ReactDOM from "react-dom/client";
import { webApi } from "./webApi";
import App from "./App";
import "./styles/globals.css";

// Punto de entrada EXCLUSIVO de la versión web — nunca se usa en Electron
// (main.tsx, sin tocar, sigue siendo el entry point del escritorio). Antes
// de montar React, se reemplaza window.densz (que en Electron pone
// preload.ts vía contextBridge) por la implementación HTTP — todo lo
// demás de la app (hooks, páginas, componentes) sigue llamando
// `window.densz.algo(...)` exactamente igual, sin saber ni importarle
// cuál de las dos implementaciones está corriendo.
window.densz = webApi;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
