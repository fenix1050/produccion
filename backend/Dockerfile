FROM node:20-slim

# Dependencias de sistema que Chromium necesita para correr (Puppeteer las requiere
# para generar los PDF de Carta Oferta / Propuesta Formal).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Usar el Chromium del sistema en vez de que Puppeteer descargue el suyo.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
