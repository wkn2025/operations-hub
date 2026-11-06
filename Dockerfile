# Operations Hub: one container = API + built web app (single process, SQLite + uploads on the /data volume).
# Build:  docker build -t operations-hub .
# Run:    see docs/DEPLOYMENT.md (needs AUTH_MODE=oidc settings and SESSION_SECRET; serve behind TLS).

# ---- build: install everything, build the web app, then drop dev dependencies ----
FROM node:22-bookworm-slim AS build
# better-sqlite3 normally downloads a prebuilt binary; these let it compile if no prebuild matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: node + production node_modules + server source (run by tsx) + built web ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production AUTH_MODE=oidc PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build /app/apps/server/reference ./apps/server/reference
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /data /app/backups /app/exports && chown -R node:node /data /app/backups /app/exports
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/me').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# First start of a new /data volume: docker exec <container> sh -c 'cd /app && npm run seed -- --categories-only'
# (creates the nine top-level categories only; see docs/DEPLOYMENT.md "First start: categories").
WORKDIR /app/apps/server
CMD ["node", "../../node_modules/tsx/dist/cli.mjs", "src/index.ts"]
