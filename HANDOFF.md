# Operations Hub — Session Handoff

Updated 2026-10-29 ~20:57 local after the final fix wave + re-reviews, from the repository (git status/log), not only conversation memory.
Legend: **[VERIFIED]** = I ran or read it during this handoff. **[REPORTED]** = stated by a subagent/reviewer, not re-checked by me. **[UNVERIFIED]** = nobody has checked.

## 1. Project

Internal knowledge-management web app ("Operations Hub") for ~20–30 staff at an international medical assistance company. Searchable, editable encyclopedia replacing scattered Word/PDF/Excel files. Runs locally for a management demo; later deployed by IT. All ordinary content is edited in the browser, stored in a server-side database.

Non-negotiables from the user's brief: premium Apple-like white UI (primary `#26408F`, accent `#C7CD3D` sparingly, bg `#FFFFFF`, Inter, centralized tokens); 9 fixed top-level categories (admin-editable); Tiptap WYSIWYG with autosave/preview/versions/uploads; 6 article templates; 3 roles with BACKEND enforcement; editor allowlist; Ctrl/Cmd+K search; interactive troubleshooting flows; admin area; 30+ clearly-DEMO sample articles; migrations, repeatable seed, backup, export, docs, tests; secure dev auth + documented Entra ID (OIDC) production path; never claim a feature works without verifying it.

User chose **subagent-driven development** (fresh implementer per task + spec/quality reviewer + scoped re-review loop, max 5 fix rounds/task).

### Stack
npm-workspaces monorepo, TypeScript, Node 22 / npm 11 (Windows 11). `apps/server` (Fastify, Zod, Drizzle ORM, better-sqlite3, SQLite FTS5, @fastify/multipart, @fastify/cookie, openid-client), `apps/web` (React 18, Vite, Tailwind, Radix, Motion, TanStack Query, React Router, Tiptap v2, lucide-react, Inter via @fontsource), `packages/shared` (`@ops/shared`: roles, Zod schemas, PM node names, flow validation/runner). Tests: Vitest (+ Testing Library/jsdom for web), Playwright (chromium).

### Repo layout
```
apps/server/src: app.ts config.ts index.ts | auth/{dev,oidc,policy,session}.ts | db/{client,schema}.ts
                 routes/{allowlist,articles,audit,auth,categories,files,flows,review,search,settings,users}.ts
                 services/{articles,audit,files,flows,pm-text,search}.ts | seed/{base,run}.ts seed/content/{articles,flows,pm}.ts seed/screenshots/
apps/server/drizzle/0000..0005 *.sql + meta/   apps/server/test/*.test.ts (15 files)
apps/web/src: api/ components/ features/{articles,editor,flows,search} layout/ pages/ styles/tokens.css index.css main.tsx
packages/shared/src (+ test/flow.test.ts)      e2e/{edit.spec.ts,flow.spec.ts,start-api.mjs}   playwright.config.ts
docs/superpowers/{specs,plans}/   docs/screenshots/ (01–24 PNGs)   .superpowers/ (git-ignored SDD workspace)
```

## 2. Superpowers artifacts
- Design spec (approved): `docs/superpowers/specs/2026-10-29-operations-hub-design.md` (committed `cdc7e6c`)
- Implementation plan (10 tasks): `docs/superpowers/plans/2026-10-29-operations-hub.md` (committed `0b2d2f8`)
- SDD workspace (git-ignored, **recovery map**): `.superpowers/sdd/2026-10-29-operations-hub/` — `progress.md` is the ledger (every ruling and deferred minor), plus `task-N-brief.md`, `task-N-report.md` (full TDD evidence per task + fix rounds), `review-*.diff`. Skill scripts live in `C:\Users\wkn\.claude\plugins\cache\claude-plugins-official\superpowers\7.0.0\skills\subagent-driven-development\scripts\` (`sdd-workspace`, `task-brief`, `review-package`). `git clean -fdx` would destroy the workspace; git history is then the record.

## 3. Progress by task

| Task | Scope | Status | Commits |
|---|---|---|---|
| 1 | Scaffold, tokens, DB, auth, RBAC | **Complete** (review clean after 1 fix round) | d105784, 50c6bab |
| 2 | Categories/articles API, revisions, FTS search | **Complete** (2 fix rounds) | 343a057, 12426aa, e23f5f7, 8d2c8d9 |
| 3 | Users, allowlist, settings, review-due, audit routes | **Complete** (1 fix round) | 4c4efb9, b736863 |
| 4 | Uploads & attachments | **Complete** (2 fix rounds) | 0cfcaea, 10276a3, 5a1c9fc |
| 5 | Web shell, design system, viewer, 6 templates, search dialog, base seed | **Complete** (1 fix round) | 84bac8a, 0f16c9b, 1af486a, 7eae51a |
| 6 | Tiptap editor, autosave, preview, meta/version panels, Playwright setup | **Complete** (2 fix rounds) | 62e0b07…61ae9be, 9bce3b8, d174b80, 08fbcca, c08dcc2 |
| 7 | Troubleshooting engine | **Complete** (fix round 1 re-reviewed clean 2026-10-29) | 27e7499, 718cc0a, 32346c1, d1c9b39 |
| 8 | Admin area UI | **Complete** (1 fix round, re-review clean) [REPORTED: npm test 13/154/120 exit 0, PW 10/10, build ok] | a1f2773, bd4705f, a49afff |
| 9 | Seed: DEMO articles (35 after restructure), 3 flows, 5 screenshots | **Complete** (1 fix round, re-review clean); [VERIFIED] npm test 13/162/121 exit 0 | ac9480d, 50f393b |
| 10 | Ops, docs, Docker, acceptance e2e | **Complete** (1 fix round, re-review clean); [VERIFIED] npm test exit 0, build exit 0, Playwright 22/22; Docker unbuilt, Entra untested | a02cd17, 5072385, 11934f1, 52915af |
| Final | Whole-branch review (opus) + fix wave | **Complete**: 3 Important + minors fixed (8 commits), re-review found 1 new Important (open redirect via tab in `next`) → fixed, re-review clean. [VERIFIED] npm test 13/192/132 exit 0, build exit 0, PW 22/22 | b1ed427, 78dec5f, 4128399, b8eeeae, 4660c20, cfa8ae7, 110abe2, 158c13c, 4dab4c4, 977185d |

## 4. Where development stopped (READ FIRST)

**Current (2026-11-05):** `master` fast-forwarded to `feat/edi-rework` (no merge commit; not pushed). It carries Feature D (Finance: Global codes + Bank information subcategories, `3bf69c6..3d2031f`; Bank information category jumps straight to its article, `9526b18`) and **Feature E (EDI & Automation rework, `66bf430` + fix round `cb5fbcc`)**. E replaces the fictional DEMO EDI content with the real "EDI 101" procedure from the user's reference artifact (claude.ai/artifact/3T35gSmVoGk7vE2dHyiqA5): subcategories EDI 101 / Import & web.transformer / Adjudication & adjustments / EDI issues; articles for the 837/PCF/835 loop, the 3 Globo import checks, web.transformer tabs, adjudication, 13 denial codes, changing a coverage decision; redrawn SVGs `edi-loop`, `globo-refund-fields`. **User ruling: these articles are real procedure, NOT DEMO-labelled; seed deletes the 8 old fictional EDI articles on re-seed (`DELETED_TITLES` in `seed/base.ts`, only if seed-owned: owner and every revision author are demo accounts).** Old EDI subcategories archived. Flow "EDI claim failed to import" rewritten (fresh DB slug `edi-claim-failed-to-import`; upgraded DBs keep `-demo`). Review: round 1 found 2 Important (unscoped delete, dangling links) + stale wording, all fixed in `cb5fbcc`; re-review clean. [REPORTED by implementer, in worktree] npm test 13/227/142 exit 0, build exit 0, Playwright 22/22, upgrade seed on temp DB (37 -> 40 articles, idempotent). Open: `docs/screenshots/17-21` and `28` still show old content (run Playwright with `SCREENSHOTS=1`); `retireLegacy` leaves orphan file rows for old EDI screenshots (harmless); dead internal links in user articles render "not available"; ECA/ECL/SPD acronyms not expanded (reference does not define them); native-speaker check of bank pt/es/fr/nl/da requests and TBC codes (MRI/CT/X-ray/lab/dentist/specialist) still pending from user. **Parallel work (user's, Global Code Finder guided flow):** branch `feat/global-code-finder`, rebased 2026-11-05 onto `master` `bef094d` (only its 3 docs commits replayed; duplicate EDI commit dropped; old tip kept as branch `backup/gcf-before-rebase-0c5c2f9`, delete when no longer needed). Its WIP is **uncommitted** in the working tree: `seed/content/global-code-finder.ts`, `test/global-code-finder.test.ts`, edits to `flows.ts`, `flows.test.ts`, `seed.test.ts`, `ops.test.ts`, plus first-step text now starts "DEMO flow." so the DEMO-label test passes. [VERIFIED] on that tree: npm test 13/305/142 exit 0 (build and Playwright not run). A leftover stash `gcf-wip-before-rebase` may remain (safe to `git stash drop`). Branch is one HANDOFF-only commit behind master (this edit). Next: user continues that feature, then merge/PR decision.

Previous state: HEAD = `b5cbe08` on `master` (feature tip `fc32b60`) (home: hero search removed, featured guided-flows band, sidebar flows lime well; npm test 13/201/141, PW 22/22 [VERIFIED]). Prior: `2413ed2`. Post-final user-requested work, all reviewed clean: 2 full DEMO client T&C articles (80cbce3) and removal of short client summaries (18ebfe9); category restructure to **8 top-level categories** (Claims -> one Reimbursements doc under Work Instructions; Troubleshooting dissolved into EDI & Automation / Finance; new Quality Assurance; in-place seed upgrade, legacy archived) `e7fd142..bd31cf1`; calm home page with lime tiles, accent used more visibly, `dc37a6b`, `2413ed2`. [VERIFIED] npm test 13/201/138 exit 0, build exit 0, Playwright 22/22. Working tree clean except untracked HANDOFF.md. Open for user: topbar + hero search both visible; red review-due pill; minors in ledger. **MERGED into `master` 2026-11-01 (merge commit `b5cbe08`, --no-ff; feature branch deleted). Remote `origin` = https://github.com/wkn2025/operations-hub (PRIVATE), `master` pushed 2026-11-04 [VERIFIED]. [VERIFIED] on master: npm test 13/201/141 exit 0, build exit 0. Remaining: IT items (Entra, Docker, TLS, backups); further pushes only when the user asks.**

Rulings made by the fix wave (also in ledger): categories-only is an explicit flag, not auto-run on boot; users keyed by email, `OIDC_TENANT_ID` optional; deactivated SSO user redirects to `/login?error=deactivated`; demo contract dates fixed 2027-12-31; cross-site check = `Sec-Fetch-Site`, else Origin host vs Host.

Deferred from the wave: Tiptap editor still loads typed image URLs (e.g. `/api/admin/export`) when an admin edits — needs server save-time image URL check; Revisions dropdown blank for off-page article; admin Articles owner filter omits ex-editor viewers; Docker `--categories-only` command untested.

## 5. Test results — last VERIFIED on HEAD `2413ed2` (controller ran them)

| Suite | Result |
|---|---|
| `npm test` (root: shared + server + web) | **[VERIFIED] exit 0** — shared 13, server 201, web 138 |
| `npm run build` | **[VERIFIED] exit 0** |
| `npx playwright test` | **[VERIFIED] 22/22** (run on 158c13c and 977185d), ~1.5 min; builds web first |
| `npm audit` | [REPORTED + re-run by reviewer] 46 vulns: 2 critical vitest/tinypool (test tooling only); 3 high: drizzle-orm (runtime; our code doesn't use the affected `sql.identifier`/`.as()`), zod (runtime; reachable via API bodies, 1 MB limit + editor/admin session needed), vite (build only); no non-breaking fix; table in `docs/DEPLOYMENT.md` |
| Docker image | **[UNVERIFIED]** never built — Docker not installed on dev machine |
| Entra/OIDC real sign-in | **[UNVERIFIED]** no tenant |
| Backup under concurrent writes | **[UNVERIFIED]** tested on an idle DB only |


## 6. Outstanding items

**Must do before declaring the branch finished:** `superpowers:finishing-a-development-branch` (user decides merge/PR) and the final report with "Rulings I made". Fix wave and its re-reviews are done (§4).

**Needs IT / cannot verify here:** Entra ID tenant + which ID-token claim is authoritative (email vs `oid`/UPN, `tid` pin), TLS/reverse proxy/hosting, backup schedule, SSO group→role mapping, Docker image build/run (bind-mount perms: uid 1000), backup under load.

**Accepted deferred minors (production follow-ups):** category N+1 loading and rename reindex; editors can PATCH/restore `in_review` articles under requireApproval; restore reuses `article:archive` permission; non-admin cannot claim unowned article; Ctrl+K lists archived categories to editors/admins; home tile counts include archived subcategories; admin whole-cache invalidation; confirmed-delete focus untested; zip type check by substring, files buffered in memory (15 MB), no orphan-upload sweep, export zip built in memory; `flow_fts` not backfilled, old-DB flow slugs lack `-demo`, seed resets edits to seeded flows/articles; pasted external images silently blocked by CSP (ruled); keepalive 64 KB; Finder paste; table bubble untested; coalesced `created_at`; "Detached" audit wording; `Login` imports from `Shell`; `Topbar.signOut` swallows errors; collapsed-sidebar tooltips not keyboard-focusable; `pickTarget` module-level mutable; `pm.ts` b/i/code/hl/a/pre helpers still pass `''`; web test imports a server path; fixed e2e ports 3101/3103/5174; Tiptap v2 `__proto__` advisory (documented). **Closed:** bootstrap-email case handling (reviewer verified lowercase everywhere).

## 7. Architectural decisions & conventions (rulings in ledger)

- **Auth:** `AUTH_MODE=dev` refuses to start unless `NODE_ENV` is exactly `development`/`test` (fail-closed); non-dev modes require `SESSION_SECRET` ≥32 chars, not the dev default, not starting `change-me`. Cookie = signed `${userId}.${expiresAtMs}`, 12 h server-enforced expiry, httpOnly, SameSite=Lax. Role/active re-read from DB on every request (changes take effect immediately). Anonymous users read **nothing** (login required). Role resolution at login: bootstrap env email → admin; else admin-pinned role (`role_set_by_admin`); else allowlist → editor; else viewer. `role:null` PATCH clears a pin. Bootstrap admins and last active admin can't be demoted/deactivated (409). Deactivated: 401 on requests, 403 at login. OIDC: PKCE/state/nonce, requires `email_verified !== false`, email claim preferred.
- **Authorization:** single `can(user, action, resource?, {requireApproval})` in `auth/policy.ts`; routes also use `requireRole`. `requireApproval` setting (stored as JSON in `settings`, tolerant parsing; default off): editors cannot write/restore/archive PUBLISHED articles or flows; they `submit` → admin publishes. Categories are admin-write only. Owner change: admin or current owner only, audited (`article.owner_change`).
- **Content model:** ProseMirror JSON in `articles.content` + extracted `content_text` for FTS; node names defined once in `packages/shared/src/pm-nodes.ts` (callout kinds from `CALLOUT_KINDS`, collapsible, steps, taskList/taskItem, table, image, internalLink{articleId,label}). Renderer never uses `dangerouslySetInnerHTML`; links via `safeHref`. Test asserts every editor-producible node is rendered.
- **Revisions:** `articles.revision` is the concurrency counter (PATCH needs `baseRevision`, 409 `{error:'conflict',current}`); `revisions.rev` never changes once written; autosaves (`autosave:true`) coalesce into the author's open row (same author, <10 min, note null, draft/in_review only; migration 0004 `coalescable`), so revision numbers have gaps; explicit saves, transitions, restores, other authors, published articles always cut a checkpoint; latest revision found via max(rev), not `articles.revision`.
- **Search:** FTS5 `article_fts` (+ `flow_fts`); user input reduced to quoted prefix tokens; status/role/archived-category filtering inside SQL; snippets HTML-escaped with `<mark>`; groups article/category/tag/glossary/flows. Control characters stripped before indexing.
- **Files:** random uuid on disk under `DATA_DIR/uploads`, magic-byte sniffing, allowlist (png,jpg,webp,gif,pdf,docx,xlsx,pptx,csv,txt), SVG/HTML rejected, 15 MB, nosniff + CSP `default-src 'none'`, images inline others attachment, `Cache-Control: private, no-cache`. Viewers fetch only files linked (attached or embedded) to a published, readable article. `article_files.source` = `attached|embedded`; embedded rows recomputed from content on every save/restore.
- **Errors:** non-ApiError → `{error:'internal'}` 500, no stack.
- **Web:** colours only via `tokens.css` + Tailwind theme (grep found zero raw literals outside tokens at Task 5 re-review — re-check for regressions); 401 from any query → `/login?next=…`; failed `/api/me` shows "Can't reach the server" not logout; `ErrorState` with Retry; localStorage only for UI prefs (sidebar, recent searches). Reduced motion via `MotionConfig reducedMotion="user"`.
- **Seed ruling:** `seed/base.ts` + `seed/content/` are the extension point; seed refuses `NODE_ENV=production`/`AUTH_MODE=oidc` without `--force-demo`; idempotent (upsert by slug/email); trusted `storeFile` used only by seed.
- **Process rulings:** feature branch instead of worktree; Playwright infra lives in Task 6; admin/IT items listed above.

## 8. Database, migrations, seed, auth setup

- SQLite file `DATA_DIR/app.db` (default `./data`; server cwd `apps/server` → `apps/server/data/`, git-ignored). Migrations auto-applied on boot via Drizzle migrator. Generate new ones with `npm run db:generate` (drizzle-kit); **never edit an existing migration** (journal/snapshots in `apps/server/drizzle/meta`).
- Migrations [VERIFIED present]: `0000_init` (all core tables + unique indexes `revisions(article_id,rev)`, `articles.slug`), `0001_fts` (`article_fts`), `0002_admin_users` (`users.active`, `role_set_by_admin`), `0003_article_files_source`, `0004_revisions_coalescable`, `0005_flows_meta` (flow metadata + `flow_fts`).
- Tables [VERIFIED in `db/schema.ts`]: users, editor_allowlist, categories, articles, revisions, tags, article_tags, article_links, files, article_files, flows, audit_log, settings (+ FTS virtual tables).
- Seed (`npm run seed`): 8 categories with 2–3 subcategories each (exact names in `seed/base.ts` `CATEGORY_TREE`), demo users `admin@demo.test` (bootstrap admin), `editor@demo.test` (allowlisted editor), `viewer@demo.test`; 37 DEMO articles (≥6 per template, ≥2 per category, split over `seed/content/articles-*.ts`), 3 DEMO flows, 5 SVG screenshots (`seed/screenshots/*.svg.ts`, shared chrome in `frame.ts`). `seedDemo` = alias of `seedBase`. Idempotent (tested).
- Dev login: picker at `/login` using `GET /api/auth/dev/users` + `POST /api/auth/dev/login` (routes exist only in dev mode; 404 in oidc mode, tested).
- `.env.example`: `PORT, DATA_DIR, AUTH_MODE, SESSION_SECRET, ADMIN_BOOTSTRAP_EMAILS, NODE_ENV, OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI`. Note `npm start -w apps/server` fails unless `NODE_ENV` is set (by design). Server binds 0.0.0.0 (document for IT).

## 9. Commands (run from repo root `C:\Users\wkn\operations-hub`)

```
npm install
npm run seed                      # seeds demo data into DATA_DIR (needs NODE_ENV dev/test; default dev)
npm run dev                       # API on :3001 + Vite on :5173 (proxy /api); open http://localhost:5173, log in via demo picker
npm test                          # shared + server + web (exit 0 at 977185d)
npm test -w apps/server           # 192 tests at 977185d
npm test -w apps/web              # 132 tests at 977185d
npm test -w packages/shared       # 13 tests
npx playwright install chromium   # first time only
npx playwright test               # 22 tests at 977185d; starts own APIs (:3101, built-app :3103) + Vite :5174, temp DATA_DIR, seeded
npm run build                     # shared tsc, server tsc (typecheck only), web tsc + vite build
npm run db:generate               # new Drizzle migration
```
Production run is via `tsx` (`npm start -w apps/server` with NODE_ENV=production, AUTH_MODE=oidc, real SESSION_SECRET); server "build" is a typecheck only; the server serves the built web app (`WEB_DIST`, automatic in production; verified by `e2e/built-app.spec.ts`); the Dockerfile exists but was never built.

## 10. Git state [VERIFIED 2026-10-29 ~20:55]

- Branch `feat/operations-hub` (off `master`; no local `main`; no remote push has occurred). HEAD `977185d`. Recent: `977185d`/`4dab4c4` export `&` + open-redirect fix · `158c13c`…`b1ed427` final fix wave · `52915af` fix(ops) review round 1 (CSP built-app test, backup skew, export escaping) · `11934f1` docs + Dockerfile (unbuilt) · `5072385` backup/export/static serving/security headers/Secure cookies · `a02cd17` acceptance e2e · `50f393b`/`ac9480d` seed · `a49afff`/`bd4705f`/`a1f2773` admin UI · `d1c9b39` flow fixes …
- Uncommitted: none. `HANDOFF.md` is untracked (never committed by design); `CLAUDE.md` is committed (`e81b019`).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (Opus implementers used `Claude Opus 5.5`).

## 11. Next action on resume

1. Per `CLAUDE.md`: read this file, the ledger; `git status`, `git log --oneline -10`.
2. Invoke `superpowers:finishing-a-development-branch`: present merge/PR options to the user (base `master`); no push/merge without their say-so.
3. Final report: works / incomplete / needs IT, plus "Rulings I made" = every `Ruling:` line in the ledger, in order, each with cost-if-wrong. Delete the SDD workspace only after that.
