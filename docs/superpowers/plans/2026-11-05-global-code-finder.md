# Global Code Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed one binary-choice guided flow that tells staff the single Global Code for an invoice.

**Architecture:** Pure data. A new `SeedFlow` constant (nodes per the spec tree) is appended to `SEED_FLOWS`; the existing seeder, flow engine, runner UI and admin editor are unchanged. Tests walk answer sequences through `@ops/shared` `start`/`step`.

**Tech Stack:** TypeScript, Vitest, `@ops/shared` flow module (`validateFlow`, `start`, `step`, `FLOW_LIMITS`), seed in `apps/server/src/seed`.

**Spec:** `docs/superpowers/specs/2026-11-05-global-code-finder-design.md` (the tree there is the node list: ids, questions, Yes/No targets). Business rules and wording source: `C:\Users\wkn\Downloads\GLOBAL_CODE_FINDER_IMPLEMENTATION.md` §4–5.

## Global Constraints

- Every `question` node has **exactly 2 options**, labels exactly `Yes` then `No` (index 0 = Yes, 1 = No).
- `text` ≤ 400, `detail` ≤ 1000 chars (`FLOW_LIMITS`); ≤ 200 nodes; `validateFlow` returns `ok` with no errors.
- Known numbers only: **A01** Consultation, **B01** ER, **B00** Inpatient Physician Fees, **C12** Inpatient Treatment. Result `text` = `"A01 · Consultation"`; all other codes `"<Name> · code TBC"`. Never invent another number.
- Unresolved rules use the spec's provisional defaults (`r-us` Ultrasonography, `r-ecg` ECG, `r-spiro` Spirometry / Pulmonary Function Test): `warning` severity, detail names the alternative code and says the rule is not yet defined.
- Result `severity`: `success` for a code, `warning` for pending-rule and manual review, `info` for Free Choice.
- Flow title exactly `Global Code Finder (DEMO)`; `articleSlug: 'global-codes-for-invoice-processing'`.
- Do not touch the pre-existing uncommitted change in `apps/server/test/seed.test.ts` other than the one count assertion in Task 1; stage with `git add -p` / only your hunks.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A node unreachable from `multi`, or a question path that can't reach a result (typo'd target id) → reachability test.
- A result reachable that is just the placeholder name with no reason (Task 2) → every result has non-empty `detail`.
- A provisional result that hides its alternative → test asserts the alternative name appears.
- A made-up code number leaking into result text → regex test allows only A01/B01/B00/C12.
- Re-running the seed twice must not duplicate or fail (4 flows) → existing idempotency tests updated, not skipped.

---

### Task 1: Tree, wiring, scenario tests

**Files:**
- Create: `apps/server/src/seed/content/global-code-finder.ts`
- Create: `apps/server/test/global-code-finder.test.ts`
- Modify: `apps/server/src/seed/content/flows.ts` (append to `SEED_FLOWS`)
- Modify: `apps/server/test/flows.test.ts:164`, `apps/server/test/seed.test.ts:55`, `apps/server/test/ops.test.ts:107` (3 → 4 flows, add title to the list)

**Interfaces:**
- Produces: `export const GLOBAL_CODE_FLOW: SeedFlow` (type from `./flows`; import type only to avoid a cycle); `flows.ts` does `SEED_FLOWS = [...existing, GLOBAL_CODE_FLOW]`.
- Consumes: `start(flow)`, `step(flow, state, optionIndex)`, `validateFlow` from `@ops/shared`. Result node ids start `r-`; start node is `multi`.

- [ ] **Step 1: Write failing tests** in `global-code-finder.test.ts`. A helper `walk(...a: ('Y'|'N')[])` runs `start`/`step` (Y=0, N=1) on `GLOBAL_CODE_FLOW` (resolve `articleSlug` away: nodes only need ids) and returns the final node id; asserts no `error`. Tests:
  - `validateFlow` ok (article nodes absent so no article ids needed).
  - every question has exactly 2 options labelled Yes/No; every id unique; all nodes reachable from `multi`; every non-`r-` node is a question.
  - `scenarios`: table `[name, answers, expectedId]` covering **every row of reference §5** (derive each path from the spec tree). Anchors that must pass:
    - ER facility + CT: `NYYY` → `r-er`
    - Surgery facility with inpatient days: `NYYNY` → `r-forfait`
    - Inpatient room/ICU no surgery: `NYYNNY` → `r-inpatient`
    - Inpatient surgeon fee: `NYNYNNNY` → `r-b00`; separate ER doctor: `NYNYNNNN` → `r-outpt`
    - Anesthesiologist: `NYNYY` → `r-anes`; nurse: `NYNYNY` → `r-medfees`
    - MRI read only: `NYNYNNYYNYY` → `r-mri`
    - Specialist consult: `NYNNYNNNY` → `r-spec`; urgent care: `NYNNYNNNN` → `r-a01`; dentist: `NYNNYY` → `r-dentist`
    - Vaccination: `NYNNNNYY` → `r-vac`; chemotherapy: `NYNNNNYNY` → `r-chemo`
    - Gastroscopy: `NYNNNYNYY` → `r-gastro`; colonoscopy: `NYNNNYNYNN` → `r-scopies`
    - Wheelchair $100 = crutches $100, no principal: `YNN` → `r-free`
    - Unknown service: a path ending `r-review`
  - Each `r-` node's `text` is non-empty.
- [ ] **Step 2: Run** `npm test -w apps/server -- global-code-finder` → FAIL (module missing).
- [ ] **Step 3: Implement** `GLOBAL_CODE_FLOW` with all nodes from the spec tree (helper `q(id, text, yesTo, noTo, detail?)` producing the two Yes/No options keeps it short). In this task result `text` follows the Global Constraints format; `detail` may be a placeholder one-liner (Task 2 fills it). `multi.detail` = "This finder picks one Global Code for one invoice. It classifies the invoice only; it does not decide coverage or medical necessity." `main` and `top` Yes answers lead to `svc`; their `detail` = "Answer the next questions for that service only." Append to `SEED_FLOWS`; update the three count/title assertions.
- [ ] **Step 4: Run** `npm test -w apps/server` → all pass (previous 214 + new).
- [ ] **Step 5: Commit** `feat(seed): Global Code Finder binary guided flow` (only the files above; leave the unrelated `seed.test.ts` hunks unstaged).

### Task 2: Result wording and guard tests

**Files:**
- Modify: `apps/server/src/seed/content/global-code-finder.ts`
- Modify: `apps/server/test/global-code-finder.test.ts`

**Interfaces:**
- Consumes: Task 1 `GLOBAL_CODE_FLOW` (result ids as in the spec).

- [ ] **Step 1: Failing tests:** (a) every `r-` node has non-empty `detail` and `text`/`detail` within `FLOW_LIMITS`; (b) the only `/\b[A-Z]\d{2}\b/` matches in any result text/detail are within {A01, B01, B00, C12}; `r-a01` text starts `A01 ·`, `r-er` `B01 ·`, `r-b00` `B00 ·`, `r-inpatient` `C12 ·`; (c) `r-us`, `r-ecg`, `r-spiro` have severity `warning`; `r-us` text starts `Ultrasonography` and detail names `Ecography`; `r-ecg` starts `ECG` and names `EKG`; `r-spiro` text is `Spirometry / Pulmonary Function Test · code TBC`; all three details say the rule is not yet defined; `r-review` is `warning`, `r-free` is `info`, all others `success`; (d) `r-a01` detail mentions US routine check-up and medical certificate; `r-analysis-cysto` detail says cystoscopy is Analysis and flagged for review; `r-er` detail mentions ER-with-surgery rule and that included tests/dressings stay ER.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write each result's `detail`** (reason + rule applied + one example) from reference §4 tables and §5 rows; plain, short sentences; one example per result. `r-review` detail: no matching code, no generic fallback, send to team lead (EMG, blood transfusion, oxygen therapy are unmapped).
- [ ] **Step 4: Run** `npm test -w apps/server` → pass.
- [ ] **Step 5: Commit** `feat(seed): Global Code Finder result wording`.

### Task 3: Verify, look, hand off

**Files:**
- Modify: `HANDOFF.md` (status, tests, next action, branch `feat/global-code-finder`, open items: numeric codes TBC, 3 provisional rules)
- Modify: `.superpowers/sdd/…/progress.md` ledger line (git-ignored)

- [ ] **Step 1:** `npm test` → exit 0, record counts. `npm run build` → exit 0. `npx playwright test` → all pass (22 expected).
- [ ] **Step 2:** `npm run seed`, `npm run dev`, open the flow in the browser: confirm each screen shows two big answers, Back works, result shows code and reason, Finance article links to the flow. Report anything that looks heavy.
- [ ] **Step 3:** Update HANDOFF.md as above (mark claims VERIFIED/REPORTED); commit `docs(handoff): Global Code Finder`.
