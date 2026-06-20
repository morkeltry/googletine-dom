# Googletine — live-algo service (Express + Puppeteer)
# Uses the system Chromium instead of Puppeteer's bundled download to keep the
# image small and avoid shipping two browsers.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    LIVE_PORT=7100

# Chromium + the libraries/fonts it needs to render. dumb-init reaps the
# Chromium child processes so the container shuts down cleanly.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production deps only. PUPPETEER_SKIP_DOWNLOAD avoids fetching a second
# Chromium; the puppeteer library itself still installs.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only the live-algo app is needed at runtime.
COPY live-algo ./live-algo

EXPOSE 7100
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "live-algo/server.mjs"]
