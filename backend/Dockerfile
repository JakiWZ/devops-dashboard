# Immagine di produzione del backend (usata da Railway, funziona con qualunque host Docker).
# Build: docker build -t devops-dashboard-api backend/

FROM node:22-slim AS base
# Prisma richiede OpenSSL per il motore delle query.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Solo le dipendenze di produzione; il CLI prisma resta per `prisma migrate deploy`.
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
# Le migrazioni girano prima dell'avvio (preDeployCommand su Railway, vedi railway.json).
CMD ["node", "dist/server.js"]
