# Una sola imagen para api, worker y migraciones; otra etapa para el panel web.
# Node 22 LTS sobre Debian slim.
FROM node:22-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/dominio/package.json packages/dominio/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM dependencias AS construir-web
COPY packages packages
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web

# ---------- API / worker / migraciones ----------
FROM node:22-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias /app/node_modules node_modules
COPY package.json ./
COPY packages packages
COPY apps/api apps/api
COPY db db
RUN mkdir -p /datos/archivos && chown -R node:node /datos
USER node
EXPOSE 3101
CMD ["node", "apps/api/src/servidor.js"]

# ---------- Panel web (Next.js standalone) ----------
FROM node:22-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=construir-web /app/apps/web/.next/standalone ./
COPY --from=construir-web /app/apps/web/.next/static apps/web/.next/static
COPY --from=construir-web /app/apps/web/public apps/web/public
USER node
EXPOSE 3100
CMD ["node", "apps/web/server.js"]
