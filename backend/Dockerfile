# ── Backend image ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=4000
EXPOSE 4000

# server.js runs migrations on boot, then starts listening.
CMD ["node", "src/server.js"]
