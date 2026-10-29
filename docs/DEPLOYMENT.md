# Deployment

How to run Operations Hub on a server. Items marked **[verified]** were run on the build machine (Windows 11, Node 22.23) on 2026-10-29; **[unverified]** items could not be tested there.

## What runs

One Node.js 22 process (`apps/server`) that serves the API under `/api` and the built web app for every other path. State is two things under `DATA_DIR`: `app.db` (SQLite) and `uploads/`. There is no other database, cache or queue. The server is designed for one instance; do not run two processes on the same `DATA_DIR`.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `NODE_ENV` | yes | `production` on a server. `development`/`test` only for demos and tests. |
| `AUTH_MODE` | yes | `oidc` on a server. `dev` (demo picker) is refused unless `NODE_ENV` is `development` or `test`. |
| `SESSION_SECRET` | yes (oidc) | Random, at least 32 characters, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Startup fails on short or placeholder values. Changing it signs everyone out. |
| `OIDC_ISSUER` | yes (oidc) | `https://login.microsoftonline.com/<tenant-id>/v2.0` for Entra ID. |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | yes (oidc) | From the Entra app registration. |
| `OIDC_REDIRECT_URI` | yes (oidc) | `https://<host>/api/auth/callback`; must match the app registration exactly. |
| `OIDC_TENANT_ID` | recommended (oidc) | Entra directory (tenant) ID. When set, an ID token whose `tid` claim differs (or is missing) is rejected. |
| `ADMIN_BOOTSTRAP_EMAILS` | recommended | Comma-separated emails that are always admin (cannot be demoted in the UI). At least one, so someone can administer the system after first sign-in. |
| `DATA_DIR` | no | Default `./data` relative to `apps/server`. Use an absolute path (the Docker image uses `/data`). |
| `PORT` | no | Default `3000`. The server listens on `0.0.0.0`. |
| `WEB_DIST` | no | Path of the built web app. Default in production: `apps/web/dist` if it exists. |
| `BACKUP_DIR` / `EXPORT_DIR` | no | Targets of `npm run backup` / `npm run export` (default `backups/`, `exports/` in the repo root). |

`.env` in the repo root is read by `npm start -w apps/server`, `npm run seed`, `npm run backup` and `npm run export`.

## Option A: Docker [unverified]

The `Dockerfile` builds the web app in a build stage, prunes dev dependencies and runs as the non-root `node` user with `/data` as a volume and a health check on `/api/me`. **Docker was not available on the build machine, so the image has never been built or run.** Build and smoke-test it before relying on it.

```bash
docker build -t operations-hub .
docker run -d --name ops-hub -p 127.0.0.1:3000:3000 \
  -v ops-hub-data:/data -v ops-hub-backups:/app/backups \
  -e SESSION_SECRET=... -e OIDC_ISSUER=... -e OIDC_CLIENT_ID=... -e OIDC_CLIENT_SECRET=... \
  -e OIDC_REDIRECT_URI=https://hub.example.com/api/auth/callback -e ADMIN_BOOTSTRAP_EMAILS=it.admin@example.com \
  operations-hub
docker exec ops-hub sh -c 'cd /app && npm run seed -- --categories-only'   # once: create the nine top-level categories
docker exec ops-hub sh -c 'cd /app && npm run backup'   # writes to /app/backups (the ops-hub-backups volume)
```

The container runs as uid/gid 1000 (`node`). Named volumes (as above) inherit the image's ownership. If you bind-mount host folders instead (`-v /srv/ops-hub/data:/data`, `-v /srv/ops-hub/backups:/app/backups`), the mount hides the image's `chown`, so first run `sudo chown -R 1000:1000 /srv/ops-hub/data /srv/ops-hub/backups`, or the server cannot write its database and backups fail with a permission error.

## Option B: plain Node.js [verified with dummy OIDC settings]

```bash
npm ci
npm run build                       # builds apps/web/dist
# set the variables above (or put them in .env), then:
npm run seed -- --categories-only   # once: create the nine top-level categories (no demo content)
npm start -w apps/server
```

### First start: categories

A new production database has **no categories**, and editors can only file articles under one. Run `npm run seed -- --categories-only` once (same `.env`/`DATA_DIR` as the server; it is allowed with `NODE_ENV=production`/`AUTH_MODE=oidc`). It creates only the nine top-level categories, never demo users, articles or subcategories, and is safe to re-run: it skips any category that already exists under the same name. Admins add subcategories in **Admin -> Categories**. [verified with placeholder OIDC settings on an empty `DATA_DIR`]

The full `npm run seed` (without the flag) **resets the demo content**: every seeded DEMO article and flow is put back to its seeded text and published again, overwriting edits made to them. It refuses to run in production unless forced with `--force-demo`; never force it on a real deployment.

Verified: with `NODE_ENV=production AUTH_MODE=oidc` and placeholder OIDC values the server started, served the web app at `/` and deep links such as `/admin/users` (SPA fallback), served hashed assets with `Cache-Control: public, max-age=31536000, immutable`, answered `/api/me` and returned 404 for the dev login route. Signing in was **not** tested (no tenant). Run it under a service manager (systemd, NSSM on Windows, or the container runtime) so it restarts on failure.

The server runs the TypeScript source through `tsx` (a runtime dependency); there is no separate compile step for the server. `npm run build` only typechecks it.

## TLS and reverse proxy

TLS is required in production: session cookies are `Secure` whenever `AUTH_MODE=oidc` or `NODE_ENV=production`, so over plain HTTP browsers drop them and sign-in loops. Terminate TLS at a reverse proxy (IIS/ARR, nginx, Azure App Gateway, ...) and forward to the Node port. Keep the Node port reachable only from the proxy.

Example nginx server block [unverified]:

```nginx
server {
  listen 443 ssl;
  server_name hub.example.com;
  ssl_certificate     /etc/ssl/hub.crt;
  ssl_certificate_key /etc/ssl/hub.key;
  client_max_body_size 16m;            # uploads are capped at 15 MB by the app
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Add `Strict-Transport-Security` at the proxy once HTTPS is confirmed working; the app does not send HSTS itself.

## Security headers sent by the app [verified]

On every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, and (unless the route sets its own) this Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

File downloads (`/api/files/:id`) keep their stricter `default-src 'none'; sandbox`. `e2e/built-app.spec.ts` (part of `npx playwright test`) builds the web app, serves it through the API under this policy and fails on any CSP violation or console error while it opens the home page, an article with a screenshot, the editor and a flow.

Consequences: images in articles must be uploaded; a pasted external image URL (`https://...png`) is blocked by the browser. `style-src` allows inline styles because the UI libraries set style attributes; scripts are strictly same-origin. In `npm run dev` the page itself is served by Vite, so this CSP applies only to API responses there.

## Backups [verified on an idle database]

`npm run backup` writes `backups/<UTC timestamp>/app.db` and `uploads.zip` (every file in `DATA_DIR/uploads`) and prints row counts per table. The database copy uses the SQLite online backup API, which is designed for hot backups (a consistent snapshot while the server keeps running). **Tested only against an idle database** (no writes during the backup): the copy passes `PRAGMA integrity_check`, has identical row counts in every table, and Windows `Expand-Archive` extracts `uploads.zip` to byte-identical files. A backup taken under concurrent writes has not been tested.

`app.db` and `uploads.zip` are captured moments apart (database first, then files):
- a file uploaded during the backup can be in the zip without a database row (harmless; it is ignored after a restore);
- a file deleted during the backup is skipped; the script prints a `WARNING ... vanished during the backup` line, and that file's row in the copy then points at nothing (the image or attachment shows as missing).

Schedule backups for a quiet time (e.g. night) to make both cases unlikely.

Schedule it (cron, Windows Task Scheduler) and copy the folder off the server; the script does not rotate or upload backups. Suggested: daily, keep 30 days, plus a copy before every upgrade. The schedule and off-site target are IT decisions (see IT-HANDOVER.md).

### Restore [verified]

1. Stop the server.
2. Move the current `DATA_DIR` aside.
3. Create an empty `DATA_DIR`, copy `app.db` from the backup into it, and extract `uploads.zip` into it (it contains an `uploads/` folder).
4. Start the server. Pending migrations, if the backup is older than the code, are applied automatically.

Verified on 2026-10-29: a backup of the seeded demo database was restored this way into a fresh folder; the server started on it, articles and their screenshots rendered in the browser and search worked.

## Export [verified]

`npm run export` (or **Admin -> Articles -> Export all content**, a zip download) produces `index.json`, `articles/<slug>.json` (metadata + raw ProseMirror JSON), `articles/<slug>.md` (front matter + Markdown), `flows/<slug>.json` and `files/` (the files those articles use). All statuses are included; each file states its status. It is a portable copy for reading or migration, not a restore format: use backups to restore.

## Upgrades

1. `npm run backup`.
2. Deploy the new code, `npm ci`, `npm run build`.
3. Restart. Database migrations run at startup.

## Health and logs

`GET /api/me` returns 200 (`{"user":null,...}` when not signed in) while the process is healthy; the Docker health check uses it. Logs are JSON lines on stdout (Fastify/pino); errors are logged server-side and clients only see `{"error":"internal"}`.

## Known dependency advisories (`npm audit`, 2026-10-29)

Totals: 46 (2 critical, 3 high, 41 moderate). `npm audit fix` (non-breaking) was run and changed no package versions: every affected package is already on the newest release of its current line (drizzle-orm 0.44.7, zod 3.25.76, vite 5.4.21, vitest 2.1.9, Tiptap 2.27.3), so each fix needs a breaking upgrade (`npm audit fix --force`). That was deliberately **not** done in this delivery; each needs migration work and regression testing.

### The 2 critical and 3 high

| Package (installed) | Severity | In production? | Advisory | Exposure in this app |
|---|---|---|---|---|
| `vitest` 2.1.9 | critical | **no**: test runner, dev dependency, pruned from the Docker image | GHSA-5xrq-8626-4rwp: arbitrary file read/execute *while the Vitest UI server is listening* | None in production. The Vitest UI is never started (`vitest run` only). Fix: Vitest >= 3.2.6. |
| `tinypool` 1.1.1 (via vitest 2) | critical | **no**: Vitest's worker pool | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr: prototype-pollution gadget in worker options -> code execution | None in production; it needs a prototype-pollution bug inside the test process first. Fixed by the Vitest upgrade. |
| `drizzle-orm` 0.44.7 | high | **yes**: the server's ORM | GHSA-gpj5-g38j-94v9: SQL *identifiers* (table, column, alias names) are not escaped correctly, so an attacker-controlled identifier could inject SQL | **Not reachable with our usage** (reviewed 2026-10-29): the server only uses the static schema in `apps/server/src/db/schema.ts` and the query builder with `eq` / `and` / `desc`; it never calls `sql.identifier()`, the `sql` template tag or `.as()` aliases, and no identifier is built from request data (user values are always bound parameters). Raw SQL elsewhere uses better-sqlite3 prepared statements, not drizzle. Fix: drizzle-orm >= 0.45.2. **Recommended first follow-up** (defence in depth). |
| `zod` 3.25.76 | high | **yes**: validates every API request body (server) and is bundled into the web app | GHSA-mrhx-c7xc-m3w5: validating an oversized collection against size constraints can exhaust memory | Reachable in principle (any request body is parsed by zod), but bounded: Fastify rejects JSON bodies over its default 1 MB limit before validation, and every write route requires a signed-in editor or admin. Low practical risk. Fix: zod 4 (API changes across all shared schemas). |
| `vite` 5.4.21 | high | **no**: build tool and dev server only | launch-editor / dev-server path issues (high: GHSA-587h-7wmj-h5pm; plus moderates) | None in production: the server serves the prebuilt files itself and never runs Vite. Matters only for a developer running `npm run dev` on an untrusted network. Fix: Vite >= 6.4.4. |

### Moderates (41)

| Package | In production? | Notes / fix |
|---|---|---|
| `@tiptap/*` 2.27.3 (latest v2) | yes (editor, in the browser) | `mergeAttributes()` `__proto__` handling. Attributes come from the app's own documents; fix only in Tiptap 3 (editor migration). |
| `esbuild` (via vite), `vite-node`, `@vitest/mocker` | no (build/test) | Fixed by the Vite/Vitest upgrades. |
| `drizzle-kit`, `@esbuild-kit/*` | no (migration generator, dev only) | Fix: newer drizzle-kit. |

The Docker image prunes dev dependencies, so test/build-only packages are not in the runtime image. `tsx`, which runs the server, uses its own esbuild 0.28 (not affected).
