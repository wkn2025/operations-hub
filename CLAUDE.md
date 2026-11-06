# Operations Hub — Project Instructions

Internal knowledge-management web app (~20–30 staff, international medical assistance company). Searchable, browser-editable encyclopedia replacing Word/PDF/Excel files. Local management demo first; IT deploys later.

Source of truth for *what* and *why*: the approved spec and plan. Source of truth for *where we are*: `HANDOFF.md`. Never contradict either without the user's say-so.

- Spec: `docs/superpowers/specs/2026-10-29-operations-hub-design.md`
- Plan (10 tasks): `docs/superpowers/plans/2026-10-29-operations-hub.md`
- SDD ledger/recovery map (git-ignored): `.superpowers/sdd/2026-10-29-operations-hub/` — `progress.md` (rulings, deferred minors), `task-N-brief.md`, `task-N-report.md`

## Context management protocol (MANDATORY)

1. **Session start, before any work:** read `HANDOFF.md`, the plan, and the ledger `progress.md`; run `git status` and `git log --oneline -10`. Reconcile them. If the repo disagrees with `HANDOFF.md`, the repo wins — say so and fix `HANDOFF.md`.
2. **End of every implementation task** (and every fix round): update `HANDOFF.md` automatically — task status, changes made, commits, test results (suite + counts, as actually run), review findings and their disposition, next pending task. Append the matching line to the ledger.
3. **Never mark a task complete** until implementation, tests, AND code review have all finished and any review findings are fixed or explicitly deferred in the ledger. "Implemented, not yet reviewed" is a valid status; "complete" is not.
4. **Before any context reset / compaction / stopping:** update `HANDOFF.md` to the actual repository state (HEAD sha, working-tree changes, in-flight subagents, next action). Do this proactively when context is getting long.
5. **After resuming:** continue from the last verified milestone. Do not redo completed, reviewed work. Re-verify only what the handoff marks unverified or what the repo contradicts.
6. **Keep `HANDOFF.md` concise, accurate, synchronized with the plan.** Mark claims `[VERIFIED]` (ran/read it), `[REPORTED]` (subagent said so), `[UNVERIFIED]`. No stale sections; edit in place, don't append history. Don't rewrite it wholesale or touch unrelated sections.
7. **Preserve the Superpowers workflow and architectural decisions** (below). Changing either needs an explicit user decision, recorded as a `Ruling:` in the ledger.

## Workflow (Superpowers)

- Execution mode chosen by user: **subagent-driven-development** — fresh implementer per task, then spec/quality review, then scoped re-review loop, max 5 fix rounds per task.
- Skills to use: `superpowers:subagent-driven-development`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `finishing-a-development-branch` (end of Task 10). Use `systematic-debugging` for any failure.
- The controller session does NOT fix review findings itself — resume the implementer. Always pass an explicit `model` to subagents (opus for UI polish, sonnet/haiku for re-reviews, most capable for final whole-branch review).
- Task briefs/review packages via skill scripts (`task-brief`, `review-package`, `sdd-workspace`) under `C:\Users\wkn\.claude\plugins\cache\claude-plugins-official\superpowers\<version>\skills\subagent-driven-development\scripts\`.
- Verification before claims: run the command, read the output, then state the result. Never claim a feature works unverified; report failures with output.
- Work on branch `feat/operations-hub` (no worktree). Base branch is `master` (no local `main`). Commit only when asked or when the SDD flow requires it; no pushes without being asked. `git clean -fdx` destroys the ledger — never run it.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (user ruling 2026-11-06: sign with the model that did the work) (Conventional Commits: `feat(scope):`, `fix(scope):`, `test(scope):`).

## Stack and layout

npm-workspaces monorepo, TypeScript, Node 22 / npm 11, Windows 11.
- `apps/server` — Fastify, Zod, Drizzle ORM, better-sqlite3, SQLite FTS5, openid-client
- `apps/web` — React 18, Vite, Tailwind, Radix, Motion, TanStack Query, React Router, Tiptap v2
- `packages/shared` (`@ops/shared`) — roles, Zod schemas, ProseMirror node names (`pm-nodes.ts`), flow validation/runner
- `e2e/` + `playwright.config.ts` — Playwright (chromium); `docs/screenshots/` — numbered PNGs

## Commands (repo root)

```
npm install | npm run dev (API :3001 + Vite :5173) | npm run seed | npm run build
npm test                      # shared + server + web
npm test -w apps/server | -w apps/web | -w packages/shared
npx playwright test           # own API :3101 + Vite :5174, temp DATA_DIR
npm run db:generate           # new Drizzle migration
```
Run the relevant suite before every completion claim. Full `npm test` + `npm run build` + Playwright before closing a task.

## Architecture decisions to preserve

- **Auth:** `AUTH_MODE=dev` only when `NODE_ENV` is `development`/`test` (fail-closed). Non-dev needs strong `SESSION_SECRET`. Role/active re-read from DB each request. Anonymous reads nothing. Role resolution: bootstrap email → admin; admin-pinned role; allowlist → editor; else viewer. Entra ID (OIDC) is the production path; cannot be verified without an IT tenant — never claim it works end to end.
- **Authorization:** one `can(user, action, resource?, {requireApproval})` in `auth/policy.ts`. **Backend enforces all permissions**; frontend `can()` only hides/hints. Categories are admin-write only.
- **Content:** ProseMirror JSON in `articles.content` + `content_text` for FTS. Node names defined once in `pm-nodes.ts`. Renderer never uses `dangerouslySetInnerHTML`; links through `safeHref`.
- **Revisions:** `articles.revision` is the concurrency counter (PATCH needs `baseRevision`, 409 on conflict); `revisions.rev` is immutable; autosaves coalesce per rules in HANDOFF §7.
- **Search:** FTS5 `article_fts` + `flow_fts`; input reduced to quoted prefix tokens; visibility filtered in SQL; snippets HTML-escaped.
- **Flows:** one shared visibility rule for list/get/search; integrity errors always 422, "incomplete" errors allowed on draft saves only.
- **Files:** uuid names under `DATA_DIR/uploads`, magic-byte sniffing, allowlist, no SVG/HTML upload, 15 MB, nosniff + restrictive CSP.
- **Errors:** non-`ApiError` → `{error:'internal'}` 500, never a stack.
- **DB:** never edit an existing migration; generate a new one. Migrations auto-apply on boot.
- **Seed:** extend `seed/base.ts` + `seed/content/*`, never replace; idempotent; refuses production/OIDC without `--force-demo`. Sample content clearly labelled DEMO. Exception (user ruling 2026-11-05): the EDI & Automation articles are real procedure, not DEMO; the seed may delete retired seed-owned articles by title (`DELETED_TITLES`).

## UI conventions

Premium Apple-like white UI: primary `#26408F`, accent lime `#C7CD3D` used visibly as fills (icon wells, active/hover states, markers; user decision 2026-10-30) but never as text, icons or the only state indicator on white (≈1.7:1; focus stays primary) — text on lime is primary/neutral-900, `accent-ink` only on `accent-soft`, background `#FFFFFF`, Inter. Colors only via `styles/tokens.css` + Tailwind theme — no raw color literals elsewhere. 8 fixed top-level categories (admin-editable; was 9 until the 2026-10-30 restructure). `ErrorState` with Retry for failed loads; 401 → `/login?next=…`; honour reduced motion; keep a11y (labels, focus, aria, keyboard) — reviewers check it. localStorage only for UI prefs.

## Coding conventions

- TDD: failing test first, watch it fail, then implement. Tests live beside code (web) or in `apps/server/test/`, `packages/shared/test/`.
- Zod validate at every API boundary; share schemas via `@ops/shared`.
- Match surrounding style; no speculative abstractions; fix root causes, not symptoms.
- Don't commit `.env`, `data/`, `backups/`, `exports/`, `.superpowers/`, `test-results/`.

## Known open items (details in HANDOFF.md)

Web `npm test` exit-1 from jsdom `getClientRects` (fix in progress via `apps/web/src/test/setup.ts`); `npm audit` highs; secure-cookie flag should also follow `AUTH_MODE=oidc`. Check HANDOFF.md for current status — this list may be stale.
