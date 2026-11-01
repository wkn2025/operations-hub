# Architecture

One Node.js process serves a JSON API and (in production) the built single-page web app. Data lives in one SQLite file plus an uploads folder, both under `DATA_DIR`.

```
browser ──HTTPS──> reverse proxy (TLS) ──HTTP──> Node 22 / Fastify (apps/server)
                                                 ├─ /api/*            JSON API, auth, RBAC
                                                 ├─ /* (static)       apps/web/dist (SPA fallback to index.html)
                                                 └─ DATA_DIR/
                                                     ├─ app.db        SQLite (WAL), migrations applied on boot
                                                     └─ uploads/      uploaded files, random UUID names
```

## Repository

npm-workspaces monorepo, TypeScript throughout.

| Path | Contents |
|---|---|
| `apps/server` | Fastify API. `src/app.ts` builds the app; `config.ts` reads env; `auth/` (dev + OIDC providers, sessions, `policy.ts`); `routes/`; `services/` (articles, revisions, search, files, flows, audit, backup, export, zip); `db/` (Drizzle schema + client); `seed/`; `web.ts` (static app + security headers). Migrations in `drizzle/`. Tests in `test/` (Vitest + `app.inject`). |
| `apps/web` | React 18 + Vite + Tailwind. `pages/` (home, category, article, editor, flows, admin), `features/` (articles renderer + templates, Tiptap editor, flows, search dialog), `layout/`, `styles/tokens.css` (all colours). |
| `packages/shared` (`@ops/shared`) | Code used by both sides: roles, Zod request schemas, ProseMirror node names (`pm-nodes.ts`), template field types, flow validation and runner. |
| `scripts/` | `backup.ts`, `export.ts` (run with `npm run backup` / `npm run export`). |
| `e2e/` | Playwright specs; `start-api.mjs` starts a throwaway seeded API (and a restart control endpoint for the acceptance test). |

## Server

- **Fastify 5**, Zod validation at every route boundary. Errors: `ApiError` -> its status and body; framework 4xx passed through; anything else -> `500 {error:'internal'}` with no message or stack.
- **Database:** `better-sqlite3` + Drizzle ORM. Tables: users, editor_allowlist, categories (tree, order, archived), articles, revisions, tags, article_tags, article_links, files, article_files, flows, audit_log, settings, plus FTS5 tables `article_fts` and `flow_fts`. Migrations run automatically at startup; new ones come from `npm run db:generate`.
- **Content:** article bodies are ProseMirror JSON (`articles.content`) with an extracted plain-text copy (`content_text`) for search. Node and mark names are defined once in `packages/shared/src/pm-nodes.ts`. Template-specific fields (purpose, client, limits, symptom...) are JSON in `articles.fields`.
- **Revisions:** `articles.revision` is an optimistic-concurrency counter (a PATCH must send `baseRevision`; mismatch -> 409 with the current version). Every explicit save, status change and restore writes an immutable row in `revisions`; autosaves of drafts by the same author within 10 minutes update that author's open row instead.
- **Search:** SQLite FTS5. User input is reduced to quoted prefix tokens (no query syntax injection). Visibility (status, role, archived categories) is filtered inside the SQL, so a viewer can never get a hit for a draft. Snippets are HTML-escaped with `<mark>` highlights.
- **Files:** uploads are sniffed by magic bytes against an allowlist (png, jpg, webp, gif, pdf, docx, xlsx, pptx, csv, txt; no SVG/HTML), max 15 MB, stored under a random UUID. Downloads carry `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`; images inline, everything else as attachment. Viewers may only fetch files attached to or embedded in a published article they can read.
- **Audit log:** every content and admin write (articles, flows, categories, files, users, allowlist, settings, export) records actor, action, entity and a summary in the same transaction. Not audited: sign-ins themselves, the user row created on a person's first sign-in, and the role re-resolution done at each sign-in (bootstrap list / allowlist changes take effect there; the admin action that changed the list is audited).
- **Static app:** when `WEB_DIST` is set (or `NODE_ENV=production` and `apps/web/dist` exists) `web.ts` loads the build into memory at startup and serves only those exact paths; unknown non-API GETs get `index.html`. Unknown `/api/*` paths stay JSON 404s.

## Authentication and authorization

- **Sessions:** signed httpOnly cookie `sid` = `<userId>.<expiresAtMs>`, 12-hour server-enforced expiry, SameSite=Lax, `Secure` whenever `AUTH_MODE=oidc` or `NODE_ENV=production`. The user's role and active flag are re-read from the database on every request, so role changes and deactivation take effect immediately.
- **Providers** (same session interface):
  - `AUTH_MODE=dev`: demo picker. Refused unless `NODE_ENV` is `development` or `test`.
  - `AUTH_MODE=oidc`: Authorization Code + PKCE + state + nonce via `openid-client` (Microsoft Entra ID intended). Identity = verified email from the ID token (`email`, else `preferred_username`/`upn` if it looks like an email; `email_verified: false` is rejected). **Not tested against a real tenant.**
- **Roles at sign-in:** email in `ADMIN_BOOTSTRAP_EMAILS` -> admin; else a role an admin set explicitly; else on the editor allowlist -> editor; else viewer. Anonymous users can read nothing.
- **Enforcement:** one `can(user, action, resource, {requireApproval})` function in `auth/policy.ts` plus `requireRole` pre-handlers. The web app's permission checks only hide buttons; every rule is enforced by the API (covered by `apps/server/test/permissions.test.ts` and the acceptance bypass matrix in `e2e/acceptance.spec.ts`).
- **requireApproval** (admin setting, default off): editors cannot change, restore or archive published content; they submit for review and an admin publishes.

## Web app

React 18, React Router, TanStack Query (server state; a 401 from any query sends the user to `/login?next=...`), Radix primitives, Motion (honours reduced motion), Tiptap v2 editor with custom nodes (callout, collapsible, steps, internal link) matching the shared node names. The article renderer walks ProseMirror JSON into React elements (never `dangerouslySetInnerHTML`); links pass through `safeHref`. All colours come from `styles/tokens.css` through the Tailwind theme. Browser storage is used only for UI preferences.

## Troubleshooting flows

A flow is a list of nodes (question with options, result/action, article link) with a start node, stored as JSON in `flows.nodes`. `packages/shared/src/flow.ts` validates integrity (unknown targets, duplicate ids, loops without an exit, limits: always rejected) and completeness (dead ends, empty labels: allowed on draft saves, block publishing), and implements the runner (`step` / back / restart) used by the web app.

## Backup and export

- `services/backup.ts`: SQLite online backup API (consistent copy while the server writes) + all uploads into `uploads.zip` (`services/zip.ts`, a small dependency-free writer).
- `services/export.ts`: every article as JSON (metadata + raw ProseMirror) and Markdown (front matter + GitHub-flavoured Markdown for every supported node), every flow as JSON, the files those articles use, and `index.json`. Shared by `npm run export` and the admin-only `GET /api/admin/export` zip download.

## Tests

| Suite | Tool | Covers |
|---|---|---|
| `packages/shared/test` | Vitest | flow validation and runner |
| `apps/server/test` | Vitest + Fastify `inject` | every route, RBAC and viewer-bypass cases, revisions, search, files, flows, seed, backup/export, static serving, headers, cookies, config fail-closed |
| `apps/web/src/**/*.test.tsx` | Vitest + Testing Library (jsdom) | renderer, editor, search dialog, admin pages |
| `e2e/*.spec.ts` | Playwright (Chromium) | acceptance criteria end to end, editor, flows, admin, seed rendering; `built-app.spec.ts` runs the production build under the real CSP |
