# =====================================================================
# Catatin — single-image deployment (frontend static + backend API)
# Build: docker compose build
# =====================================================================

# ---- Stage 1: Build frontend (React + Vite) ----
FROM node:22-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build        # vite build -> /app/dist

# ---- Stage 2: Build backend (TypeScript -> JS) ----
FROM node:22-slim AS backend
WORKDIR /app/server
COPY server/package.json server/package-lock.json server/tsconfig.json ./
RUN npm ci
COPY server/src ./src
RUN npm run build        # tsc -> /app/server/dist
RUN npm prune --omit=dev # hapus devDependencies (tsc/tsx/types)

# ---- Stage 3: Runtime ----
FROM node:22-slim
ENV NODE_ENV=production
ENV DATA_DIR=/data
WORKDIR /app
RUN mkdir -p /data

# Frontend static (di-serve oleh Express)
COPY --from=frontend /app/dist ./dist

# Backend ter-compile + dependency produksi
COPY --from=backend /app/server/dist ./server/dist
COPY --from=backend /app/server/node_modules ./server/node_modules
COPY --from=backend /app/server/package.json ./server/package.json

# Semua data persisten (SQLite + uploads) ada di /data — mount satu volume di sini.
VOLUME /data

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
