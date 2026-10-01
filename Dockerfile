# Dockerfile del BACKEND WEB de Densz (src/server) — exclusivo de Railway.
#
# No afecta a la app de escritorio (Electron, se sigue empaquetando con
# electron-builder/npm run dist) ni al frontend web (Vercel, que no lee
# este archivo). Railway detecta un Dockerfile en la raíz del repo y lo
# usa automáticamente en el próximo deploy, sin que haga falta cambiar
# nada a mano en su panel.
#
# CAUSA RAÍZ QUE CORRIGE (ver docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md, Bloque
# 1-A): la generación de PDF (comprobantes, estados de cuenta, listas de
# precio — src/server/pdf.ts, Puppeteer) necesita estas librerías de
# sistema para poder arrancar Chromium. Ya estaban documentadas en
# nixpacks.toml, pero Railway usa el builder Railpack para este servicio,
# que IGNORA nixpacks.toml por completo — esas librerías nunca llegaron a
# instalarse de verdad, y cada intento de generar un PDF en producción
# fallaba con un error de "no se pudo lanzar el navegador". Un Dockerfile
# es inequívoco: Railway SIEMPRE lo usa si existe, sin depender de qué
# builder detecte automáticamente.
#
# Mismo listado exacto de paquetes que ya tenía nixpacks.toml (la lista
# estándar que recomienda la propia documentación de Puppeteer para
# sistemas Debian/Ubuntu) — no se agregó nada nuevo, solo se lo puso en un
# lugar que Railway realmente aplica.
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libstdc++6 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      wget \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Capa de dependencias separada de la de código fuente: Docker la cachea
# mientras package.json/package-lock.json no cambien, así que un deploy
# que solo cambia código (el caso más común) no vuelve a bajar ni
# reinstalar nada — incluida la descarga del Chromium propio de Puppeteer,
# que ocurre acá (necesita las librerías de arriba ya instaladas).
COPY package.json package-lock.json ./
RUN npm ci

# Todo lo que tsconfig.server.json necesita compilar (ver ese archivo):
# src/server, src/main/db, src/main/services, src/main/utils, src/shared.
# Se copia la carpeta src/ completa en vez de armar la lista a mano, para
# que nunca quede desincronizada si se agrega un archivo nuevo ahí.
COPY tsconfig.base.json tsconfig.server.json ./
COPY src ./src
RUN npm run build:server

# Las devDependencies (typescript, vitest, etc.) ya cumplieron su función
# en el build de arriba — se podan para que la imagen final no las cargue
# en producción. Puppeteer y el resto de las dependencias reales quedan.
RUN npm prune --omit=dev

ENV NODE_ENV=production

# Railway asigna el puerto real por la variable PORT en tiempo de
# ejecución (ver src/server/index.ts) — este EXPOSE es solo documentación
# para quien lea el Dockerfile, no cambia el puerto real que escucha.
EXPOSE 4000

CMD ["node", "dist-server/server/index.js"]
