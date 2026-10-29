# Operations Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-backed internal knowledge base with in-browser editing, RBAC, search, troubleshooting flows, admin area and demo content.

**Architecture:** npm-workspaces monorepo. Fastify + Drizzle + SQLite API (FTS5 search) serves a React/Vite/Tailwind SPA in production from one process. Content is ProseMirror JSON in SQLite; uploads on disk. One authorization module gates every route.

**Tech Stack:** Node 22, TypeScript, Fastify, Zod, Drizzle ORM, better-sqlite3, React 18, Vite, Tailwind, Radix, Motion, TanStack Query, React Router, Tiptap, Vitest, Playwright, @fontsource/inter.

**Spec:** `docs/superpowers/specs/2026-10-29-operations-hub-design.md`

## Global Constraints

- Colors: primary `#26408F`, accent `#C7CD3D` (small accents only), background `#FFFFFF`; all defined once in `apps/web/src/styles/tokens.css` + Tailwind theme.
- Font: Inter, self-hosted (no CDN calls).
- Roles: `admin | editor | viewer`; article statuses: `draft | in_review | published | archived`.
- Nine seed categories exactly: EDI & Automation; Clients & Terms and Conditions; Work Instructions; Claims & Reimbursements; Provider Networks & Partners; Finance & Payment Processing; Internal Systems; Troubleshooting Center; Glossary & Acronyms.
- Templates (`articles.type`): `standard | work_instruction | client_terms | technical | troubleshooting | glossary`.
- `AUTH_MODE=dev` must refuse to start when `NODE_ENV=production`.
- No `localStorage` for knowledge data. All sample content labelled DEMO, fictional names only, no real PHI.
- Env: `PORT`, `DATA_DIR`, `AUTH_MODE`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_EMAILS`, `OIDC_*`.
- Windows dev machine: scripts must be cross-platform (no bash-only npm scripts).

## Review Focus

- Viewer requests drafts/archived articles by id, search, or revisions endpoints → 404/403, never content (Task 2, 3).
- Searching with FTS syntax characters (`"`, `*`, `-`, `AND`, unbalanced quotes) → no 500, sensible results (Task 2).
- Two editors save the same article from the same base revision → second gets 409 with current revision (Task 2).
- Archiving a category/article that others link to → links show "archived" state, no crash; category with children can't be deleted (Task 2, 5).
- Pasted/uploaded hostile content: SVG/HTML upload with script, oversized file, wrong mime → rejected or served as attachment with safe headers; stored HTML is never trusted (Task 4).
- Flow with a cycle or dead-end answer is rejected on save; runner never loops infinitely (Task 6).
- Server restart mid-session keeps data and signed sessions valid (Task 10).

---

### Task 1: Scaffold, tokens, DB, migrations, auth, RBAC

**Files:**
- Create: root `package.json` (workspaces), `tsconfig.base.json`, `.gitignore`, `.env.example`, `apps/server/**`, `apps/web/**`, `packages/shared/src/{roles.ts,schemas.ts}`
- Create: `apps/server/src/{app.ts,config.ts,db/schema.ts,db/client.ts,auth/session.ts,auth/dev.ts,auth/oidc.ts,auth/policy.ts,routes/auth.ts}`, `apps/server/drizzle/` migrations
- Create: `apps/web/src/styles/tokens.css`, `apps/web/tailwind.config.ts`
- Test: `apps/server/test/{policy.test.ts,auth.test.ts,config.test.ts}`

**Interfaces:**
- Produces: `buildApp(opts?: {dbPath?: string}): Promise<FastifyInstance>`; `can(user: User|null, action: Action, resource?: {status?: ArticleStatus; ownerId?: string}): boolean` in `auth/policy.ts`; Fastify decorator `req.user: User|null`; hook `requireRole(...roles)`; `resolveRole(email: string): Role` using allowlist + bootstrap admins; all tables from the Data model in `db/schema.ts`; `loadConfig(env): Config`.

- [ ] Step 1: Write failing tests: `can()` matrix (viewer reads only published; editor writes drafts/publishes per `requireApproval`; admin all); `loadConfig({AUTH_MODE:'dev',NODE_ENV:'production'})` throws; dev login sets signed httpOnly cookie, `/api/me` returns role; unknown email → viewer, allowlisted → editor.
- [ ] Step 2: Run `npm test -w apps/server` → FAIL.
- [ ] Step 3: Scaffold workspaces, install deps, define Drizzle schema + generate initial migration (incl. FTS5 virtual table `article_fts(title, body, tags, category, client, terms)`), implement policy, config, dev auth, OIDC auth behind same `SessionProvider` interface (unit-test with mocked client), run migrations on boot.
- [ ] Step 4: Tests PASS; `npm run build` passes.
- [ ] Step 5: Commit.

### Task 2: Categories & articles API, revisions, search

**Files:** Create `apps/server/src/{routes/categories.ts,routes/articles.ts,routes/search.ts,services/articles.ts,services/revisions.ts,services/search.ts,services/audit.ts,services/pm-text.ts}`; Test `apps/server/test/{articles.test.ts,search.test.ts,categories.test.ts,permissions.test.ts}`

**Interfaces:**
- Consumes: `can`, `requireRole`, schema from Task 1.
- Produces: REST: `GET/POST /api/categories`, `PATCH /api/categories/:id` (rename/reorder/parent/archive); `GET/POST /api/articles`, `GET/PATCH /api/articles/:id`, `POST /api/articles/:id/{publish,submit,archive,restore}`, `GET /api/articles/:id/revisions`, `POST /api/articles/:id/revisions/:rev/restore`; `GET /api/search?q=&limit=` → `{groups:[{kind:'article'|'category'|'tag'|'glossary', hits:[{id,title,snippet,categoryPath}]}]}`; `extractText(pmJson): string`; `searchArticles(q, user): Hit[]`; PATCH body requires `baseRevision: number` (409 on mismatch).

- [ ] Step 1: Write failing tests: revision created per save and restorable; 409 on stale baseRevision; viewer gets 404 for draft/archived by id and in search and revisions; search for term in body, tag, client field returns hit with `<mark>` snippet; query `"foo` / `a AND` / `*` returns 200; archived category hidden from viewers; category with children cannot be deleted; every write produces an audit row.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement services; keep FTS in sync inside the same transaction as article save; sanitize query to quoted prefix tokens; filter status/role in SQL.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit.

### Task 3: Remaining server surfaces — users, allowlist, settings, review queue

**Files:** Create `routes/{users.ts,allowlist.ts,settings.ts,review.ts,audit.ts}`; Test `test/admin.test.ts`

**Interfaces:** `GET/PATCH /api/admin/users`, `GET/POST/DELETE /api/admin/allowlist`, `GET/PATCH /api/admin/settings` (`requireApproval`), `GET /api/admin/review-due?days=30` → articles with `reviewDate` overdue/soon, `GET /api/admin/audit?limit=&cursor=`. All admin-only except review-due (editor+).

- [ ] Step 1: Failing tests: viewer/editor get 403 on every admin route; adding allowlist email promotes next login to editor; demoting last admin rejected; with `requireApproval` on, editor `publish` → 403 and `submit` → `in_review`, admin `publish` ok; review-due lists correct rows.
- [ ] Step 2–4: fail → implement → pass.
- [ ] Step 5: Commit.

### Task 4: Uploads & attachments

**Files:** Create `routes/files.ts`, `services/files.ts`; Test `test/files.test.ts`

**Interfaces:** `POST /api/files` (multipart, editor+) → `{id,url,name,mime,size}`; `GET /api/files/:id` (serves with `X-Content-Type-Options: nosniff`; non-image types as `Content-Disposition: attachment`); `GET /api/admin/files`, `DELETE /api/admin/files/:id` (blocked if referenced); `attachments` link files to articles. Limits: 15 MB; allowlist of mimes (png, jpg, webp, gif, pdf, docx, xlsx, pptx, csv, txt); SVG rejected for user upload.

- [ ] Step 1: Failing tests: viewer upload 403; `.html` and `.svg` rejected; oversize rejected; file bytes survive app restart (`buildApp` twice on same DATA_DIR); viewer can fetch file only if attached to a published article.
- [ ] Step 2–4: fail → implement → pass.
- [ ] Step 5: Commit.

### Task 5: Web shell, design system, viewer, search dialog, templates

**Files:** Create `apps/web/src/{main.tsx,App.tsx,api/client.ts,components/ui/*,layout/{Shell,Sidebar,Topbar}.tsx,features/search/SearchDialog.tsx,features/articles/{ArticlePage,ArticleRenderer,templates/*.tsx}.tsx,pages/{Home,Category,Login}.tsx}`; Test `apps/web/src/**/*.test.tsx`, `e2e/browse.spec.ts`

**Interfaces:**
- Consumes: Task 2 REST API.
- Produces: `<ArticleRenderer doc={PMJson} />` (renders custom nodes: callout, collapsible, steps, checklist, table, image, internalLink); one template component per article type under `templates/`, selected by `article.type`; `<SearchDialog />` bound to Ctrl/Cmd+K; `useSession()` hook; `<Breadcrumbs>`, `<Sidebar collapsed>` with spring animation.

- [ ] Step 1: Write failing component tests: renderer outputs each custom node; SearchDialog opens on Ctrl+K, arrows move selection, Enter navigates, highlights `<mark>`; each template renders its distinctive header; sidebar collapse persists in localStorage (UI pref only).
- [ ] Step 2–3: fail → implement. Invoke `frontend-design` + `impeccable` skills for visual pass; glass/floating panels, 14–20px radii, soft shadows, `prefers-reduced-motion` support.
- [ ] Step 4: Tests pass; start dev servers, screenshot Home, Category, Article (each template), Search via browser tools and visually check palette/typography.
- [ ] Step 5: Commit.

### Task 6: Tiptap editor, autosave, preview, internal links, versions UI

**Files:** Create `apps/web/src/features/editor/{ArticleEditor.tsx,extensions/{Callout,Collapsible,Steps,InternalLink,ImageUpload}.ts,useAutosave.ts,LinkPicker.tsx,VersionPanel.tsx,MetaPanel.tsx}`, `pages/EditArticle.tsx`; Test `src/features/editor/*.test.ts(x)`, `e2e/edit.spec.ts`

**Interfaces:** `useAutosave(save: (doc, baseRevision) => Promise<{revision:number}>, delayMs=1500)` → `{status:'idle'|'saving'|'saved'|'conflict'|'error'}`; editor reads/writes ProseMirror JSON matching renderer nodes; MetaPanel edits type, category, tags, owner, review date, related articles, template-specific fields; VersionPanel lists revisions with restore.

- [ ] Step 1: Failing tests: autosave debounces, sends latest baseRevision, surfaces `conflict` on 409; image paste uploads via `/api/files` and inserts node; internal link picker inserts link node resolving to article id.
- [ ] Step 2–4: fail → implement → pass.
- [ ] Step 5: Playwright: editor creates article with image + internal link, refreshes, content persists. Commit.

### Task 7: Troubleshooting engine & flow editor

**Files:** Create `apps/server/src/{routes/flows.ts,services/flows.ts}`, `packages/shared/src/flow.ts`, `apps/web/src/features/flows/{FlowRunner,FlowEditor}.tsx`; Test `apps/server/test/flows.test.ts`, `packages/shared/test/flow.test.ts`, `e2e/flow.spec.ts`

**Interfaces:** `type FlowNode = {id; kind:'question'|'result'|'article'; text; options?: {label; to: string}[]; articleId?: string}`; `validateFlow(flow): {ok:boolean; errors: string[]}` (rejects unknown targets, dead-end questions, unreachable-from-start cycles without exit, missing start); `GET/POST/PATCH /api/flows`; runner state machine `step(flow, nodeId, optionIndex)`.

- [ ] Step 1: Failing tests: valid "EDI claim failed to import" flow (GOP exists? → member ID valid? → matching case? → procedure) validates; cycle without exit, dangling target, empty options rejected; viewer cannot PATCH; runner back/restart.
- [ ] Step 2–4: fail → implement → pass. Flow editor is form-based (add node, edit options, pick target).
- [ ] Step 5: Commit.

### Task 8: Admin area UI

**Files:** Create `apps/web/src/pages/admin/{Users,Allowlist,Categories,Articles,ReviewQueue,Revisions,Archive,Files,Audit}.tsx`; Test `e2e/admin.spec.ts`

**Interfaces:** Consumes Tasks 2–4 admin endpoints. Category tree supports drag reorder (call PATCH with new `sortOrder`/`parentId`), rename, archive. Admin route guarded client-side AND server-side.

- [ ] Step 1: Failing Playwright spec: admin renames category and sidebar updates without reload code change; editor navigating to `/admin/users` sees forbidden; archived article appears in Archive and is restorable.
- [ ] Step 2–4: implement → pass.
- [ ] Step 5: Commit.

### Task 9: Seed data

**Files:** Create `apps/server/src/seed/{index.ts,content/*.ts,screenshots/*.svg.ts}`; Test `test/seed.test.ts`; script `npm run seed`

**Interfaces:** `seedDemo(db): Promise<void>` idempotent (upserts by slug).

- [ ] Step 1: Failing tests: after `seedDemo` twice → ≥30 published articles, each of 9 categories has ≥2, ≥3 flows, all internal links resolve to existing articles, every article has "DEMO" marker, ≥6 articles per type spread, demo users admin/editor/viewer exist.
- [ ] Step 2–4: fail → author content (UHCG Direct EDI, MacroHealth EDI, 837/999, missing GOP, invoice registration, claim approval, medical records requests, invoice denials, client coverage summaries, reimbursement processing, Globo, ECNet, provider network admin, payment processing, acronyms; fictional clients/limits; tables, steps, SVG screenshots) → pass.
- [ ] Step 5: Commit.

### Task 10: Ops, docs, Docker, acceptance run, review

**Files:** Create `scripts/{backup.ts,export.ts}`, `Dockerfile`, `README.md`, `docs/{DEPLOYMENT.md,IT-HANDOVER.md,ARCHITECTURE.md}`, `e2e/acceptance.spec.ts`, `playwright.config.ts`

**Interfaces:** `npm run backup` → timestamped `backups/<ts>/{app.db,uploads.zip}` via SQLite online backup; `npm run export` → `exports/<ts>/` JSON + Markdown per article; admin "Export" button calls same service.

- [ ] Step 1: Write `acceptance.spec.ts` covering each acceptance criterion: viewer browse/search; editor create/edit; refresh and **server restart** persistence; uploaded screenshot still loads; internal link works; category rename; viewer API bypass attempts (403/404 matrix); revision restore; search finds body text; flow completes; every category has content.
- [ ] Step 2: Implement backup/export (test: backup DB opens and row counts match; export contains all published slugs).
- [ ] Step 3: Run full `npm run build`, `npm test`, `npx playwright test`; fix failures via superpowers:systematic-debugging.
- [ ] Step 4: Whole-branch review via superpowers:requesting-code-review; fix findings; superpowers:verification-before-completion.
- [ ] Step 5: Final report: works / incomplete / needs IT approval (Entra tenant, TLS, hosting, backups schedule, SSO group mapping). Commit.
