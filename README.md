# Operations Hub

Internal knowledge base for the operations team: a searchable, browser-editable encyclopedia that replaces scattered Word, PDF and Excel files. Articles, troubleshooting flows, categories and users are all managed in the browser; content lives in a server-side SQLite database.

> **Status:** local management demo. Everything you see after `npm run seed` is **DEMO content** (fictional clients, people and numbers, labelled "DEMO"). Production sign-in (Microsoft Entra ID) is implemented but has **not** been tested against a real tenant. See [docs/IT-HANDOVER.md](docs/IT-HANDOVER.md).

## Quickstart (Windows, macOS or Linux)

Requires Node.js 22 and npm 10+.

```bash
npm install
cp .env.example .env          # defaults are fine for the demo
npm run seed                  # demo users, 9 categories, 37 DEMO articles, 3 flows, screenshots
npm run dev                   # API on :3001, web app on :5173
```

Open <http://localhost:5173> and pick a demo user on the sign-in page.

| Demo login | Role | Can |
|---|---|---|
| `admin@demo.test` | Admin (bootstrap admin from `ADMIN_BOOTSTRAP_EMAILS`) | everything, incl. users, allowlist, categories, settings, audit log, export |
| `editor@demo.test` | Editor (on the editor allowlist) | create, edit, publish articles and flows; upload files |
| `viewer@demo.test` | Viewer | read published content, search, run flows |

Any other email signs in as a viewer. The demo picker exists only when `AUTH_MODE=dev`, and the server refuses to start in that mode unless `NODE_ENV` is `development` or `test`.

## Commands (repo root)

| Command | What it does |
|---|---|
| `npm run dev` | API (`apps/server`, port 3001) + Vite dev server (`apps/web`, port 5173, proxies `/api`) |
| `npm run seed` | Idempotent demo seed into `DATA_DIR` (refuses production / OIDC without `--force-demo`) |
| `npm run build` | Typecheck shared + server (+ `scripts/`), typecheck and build the web app into `apps/web/dist` |
| `npm test` | Unit and API tests: `packages/shared`, `apps/server`, `apps/web` (Vitest) |
| `npx playwright test` | End-to-end and acceptance tests (first time: `npx playwright install chromium`). Starts its own API on :3101 (fresh seeded temp `DATA_DIR`) and Vite on :5174, plus a fresh web build served by a second API on :3103 (`e2e/built-app.spec.ts`: the real CSP, fails on any violation) |
| `npm run backup` | Hot backup to `backups/<timestamp>/app.db` + `uploads.zip` |
| `npm run export` | Content export to `exports/<timestamp>/`: JSON + Markdown per article, flows, used files, `index.json` |
| `npm run db:generate` | New Drizzle migration after a schema change (never edit an existing migration) |

Admins can also download the same export from **Admin → Articles → Export all content**.

### Running the built app from one process

`npm run build`, then start the API with `WEB_DIST` pointing at the build; it serves the web app and the API on one port:

```bash
# PowerShell: $env:NODE_ENV='development'; $env:AUTH_MODE='dev'; $env:WEB_DIST="$PWD/apps/web/dist"; npm start -w apps/server
NODE_ENV=development AUTH_MODE=dev WEB_DIST="$PWD/apps/web/dist" npm start -w apps/server   # http://localhost:3000
```

In production (`NODE_ENV=production`) the server serves `apps/web/dist` automatically when it exists. Production setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What is real and what is demo

| Real (works, tested) | Demo / not verified |
|---|---|
| Database, migrations, revisions, search, uploads, roles enforced by the API | All seeded articles, flows, clients, screenshots (`DEMO` labelled) |
| Editor with autosave, preview, history and restore | Demo sign-in picker (`AUTH_MODE=dev`) |
| Troubleshooting flows (runner + editor) | Entra ID sign-in: implemented and unit-tested with a mocked IdP only |
| Admin area, audit log, backup, export | Docker image: written, **not built** here (no Docker on the build machine) |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - how it is built
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - running it on a server, backups, restore, security headers, known dependency advisories
- [docs/IT-HANDOVER.md](docs/IT-HANDOVER.md) - what IT must set up or approve (Entra ID, TLS, hosting, backups, roles)
- `docs/screenshots/` - screenshots of every main screen
- `docs/superpowers/` - design spec and implementation plan
