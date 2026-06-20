# YourAlgoMate — live-algo service (Express + Puppeteer)
# Runs server/live-algo-server.js and serves server/public/. Uses the system
# Chromium (via PUPPETEER_EXECUTABLE_PATH) instead of Puppeteer's bundled download.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    LIVE_PORT=7100

# Chromium + the libraries/fonts it needs. dumb-init reaps Chromium children.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Production deps only; PUPPETEER_SKIP_DOWNLOAD avoids a second Chromium.
# --legacy-peer-deps: mppx declares a peerOptional express>=5 (we use express 4).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# The YourAlgoMate server + its static UI + activity logger.
COPY server ./server
# shared/ holds the MPP payment modules imported by the server.
COPY shared ./shared

# Activity logs are written at runtime under server/logs/users — make the
# directory writable by the non-root user.
RUN mkdir -p server/logs/users && chown -R node:node server/logs

EXPOSE 7100
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/live-algo-server.js"]
