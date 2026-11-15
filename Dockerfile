# Next.js standalone image (target runtime) and the schema migration image (target migrate), from one build in
# GitHub Actions (.github/workflows/image.yml); deployed by Flux from bulbashenko-com/infra.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=https://bulbashenko.com
ARG NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=$NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
LABEL org.opencontainers.image.title="bulbashenko.com" \
      org.opencontainers.image.description="Personal website and blog of Aleksandr Albekov (Next.js standalone server)" \
      org.opencontainers.image.url="https://bulbashenko.com" \
      org.opencontainers.image.source="https://github.com/bulbashenko-com/site" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
# The commit this image was built from; /api/health reports it.
ARG REVISION=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SITE_REVISION=$REVISION
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Applies prisma/migrations before the app starts (init container `migrate`, scripts/migrate.mjs). Production
# dependencies only: the Prisma CLI and its schema engine, pg for the baseline check.
FROM node:22-slim AS migrate
# The schema engine talks TLS to Postgres (verify-full) through the system OpenSSL, which the slim image lacks.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    HOME=/tmp
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY scripts/migrate.mjs ./scripts/
USER node
CMD ["node", "scripts/migrate.mjs"]
