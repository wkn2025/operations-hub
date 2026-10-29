# Operations Hub — Design

Approved 2026-10-29. Internal knowledge-management web app for ~20–30 staff of an international medical assistance company. Local demo first, IT deployment later.

## Intent
Centralize operational knowledge (now spread over Word/PDF/Excel/PowerPoint) into a searchable, editable, premium-looking encyclopedia. All ordinary content is managed in the browser; no code edits for content changes.

## Goals
- Full article system: rich text, images, tables, checklists, collapsibles, callouts, steps, attachments, internal links, related articles, tags, breadcrumbs, owner, versions, review dates, draft/publish.
- Six distinct templates: standard, work instruction, client T&C, technical doc, troubleshooting guide, glossary entry.
- Nine admin-editable top-level categories with nested subcategories (create/rename/reorder/archive).
- Tiptap WYSIWYG with autosave, preview, uploads, attachments.
- Global search (Ctrl/Cmd+K), grouped, highlighted, keyboard-navigable, permission-aware.
- Interactive troubleshooting decision trees, editable in-app.
- Roles Admin/Editor/Viewer enforced by backend; editor allowlist by email.
- Admin area: users, allowlist, categories, articles, drafts/approvals, revisions, archive, review reminders, files, audit log.
- Seed: 30+ clearly-labelled DEMO articles over all 9 categories, 3+ flows, SVG illustrative screenshots.
- Ops: migrations, idempotent seed, backup, export, env config, tests, docs.

## Non-goals
Real Entra integration testing; email sending; real-time co-editing (last-write-wins + conflict warning); Word/PDF/Excel import; mobile-first layout.

## Anti-goals
Decorative controls that do nothing; demo auth usable in production; authoritative data in localStorage; authentic-looking client contracts or real patient data.

## Architecture (builder's calls)
- npm workspaces monorepo, TypeScript: `apps/web`, `apps/server`, `packages/shared`.
- Web: React, Vite, Tailwind (tokens in one file), Radix primitives, Motion, TanStack Query, React Router, `@fontsource/inter`.
- Server: Fastify, Zod, Drizzle ORM, SQLite (`better-sqlite3`), FTS5 search with role/status filtering inside the query.
- Single process serves API + built web in production; Dockerfile; `data/app.db` + `data/uploads/`.
- Content stored as ProseMirror JSON + extracted plain text for FTS.
- Colors: primary #26408F, accent #C7CD3D (sparingly), background #FFFFFF.

## Data model
users, editor_allowlist, categories (tree, order, archived), articles (type, status, owner, review_date, template fields), revisions, tags, article_links, attachments, flows, audit_log, settings.
Statuses: draft, in_review, published, archived. `requireApproval` setting default off.

## Auth
- `AUTH_MODE=dev`: demo user picker, signed httpOnly cookie, visible DEMO banner, refuses to start when NODE_ENV=production.
- `AUTH_MODE=oidc`: openid-client for Entra ID behind same session interface; implemented and unit-tested, unverifiable without tenant (IT item).
- Unknown emails → Viewer; allowlisted → Editor; admins by admin action or bootstrap env var.

## Troubleshooting engine
Nodes: question (options), result/action, article link. Runner with back/restart/trail. Form-based tree editor validating dead ends and cycles.

## Testing
Vitest (logic), Fastify inject (API incl. viewer-bypass), Playwright (acceptance: browse/search, edit+refresh+restart persistence, upload, links, category edit, revisions, flow run).

## Milestones
1 scaffold/tokens/DB/auth/RBAC; 2 categories+articles API, revisions, FTS; 3 shell, viewer, search dialog; 4 Tiptap editor; 5 templates + links; 6 troubleshooting; 7 admin; 8 seed; 9 ops+docs; 10 review, acceptance run, report.

## Left to builder
Exact component choices, route shapes, visual details within the stated system.
