# ── Frontend image (dev server for local compose) ─────
# For local docker-compose we run the Vite dev server. For production the
# frontend is built (`npm run build`) and served by Vercel — no image needed.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 5173

# --host binds 0.0.0.0 so the port is reachable outside the container.
CMD ["npm", "run", "dev", "--", "--host"]
