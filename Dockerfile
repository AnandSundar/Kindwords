# syntax=docker/dockerfile:1
# KTD14: multi-stage build on Debian slim (glibc, so sharp and libsql use their prebuilt binaries).

FROM node:24.14-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24.14-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Widget, Next standalone build with public/ and static assets copied in, then the CLIs.
RUN npm run build && node cli.build.mjs

FROM node:24.14-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/kindwords.db \
    UPLOADS_DIR=/data/uploads

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist-cli ./dist-cli
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/kindwords-entrypoint
COPY --chmod=755 docker/reset-password.sh /usr/local/bin/reset-password

# /data is the only writable place: the SQLite file and local uploads (a named volume in compose).
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["kindwords-entrypoint"]
