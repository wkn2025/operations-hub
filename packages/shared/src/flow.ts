import { z } from 'zod';

export const FLOW_LIMITS = { nodes: 200, id: 64, title: 200, text: 400, detail: 1000, label: 120, options: 8 } as const;
export const MAX_STEPS = 500;

export type FlowNodeKind = 'question' | 'result' | 'article';
export type FlowSeverity = 'info' | 'warning' | 'success';
export interface FlowOption { label: string; to: string }
export interface FlowNode {
  id: string; kind: FlowNodeKind; text: string;
  /** short plain text under the headline (no rich text) */
  detail?: string; options?: FlowOption[]; articleId?: string; severity?: FlowSeverity;
}
export interface Flow { title: string; startId: string; nodes: FlowNode[] }

// ---- shape (what the API accepts); semantic checks live in validateFlow ----
export const flowNodeSchema = z.object({
  id: z.string().min(1).max(FLOW_LIMITS.id),
  kind: z.enum(['question', 'result', 'article']),
  text: z.string().max(FLOW_LIMITS.text),
  detail: z.string().max(FLOW_LIMITS.detail).optional(),
  options: z.array(z.object({ label: z.string().max(FLOW_LIMITS.label), to: z.string().max(FLOW_LIMITS.id) })).max(FLOW_LIMITS.options).optional(),
  articleId: z.string().max(FLOW_LIMITS.id).optional(),
  severity: z.enum(['info', 'warning', 'success']).optional(),
});
const title = z.string().trim().min(1).max(FLOW_LIMITS.title);
const nodes = z.array(flowNodeSchema).max(FLOW_LIMITS.nodes);
export const flowCreateBody = z.object({ title, nodes: nodes.optional(), startId: z.string().max(FLOW_LIMITS.id).optional(), articleId: z.string().nullish() });
export const flowPatchBody = z.object({
  baseRevision: z.number().int().min(1),
  title: title.optional(), nodes: nodes.optional(), startId: z.string().max(FLOW_LIMITS.id).optional(),
  articleId: z.string().nullable().optional(), autosave: z.boolean().optional(),
});

// ---- validation ----
export type IssueCode =
  | 'no_start' | 'unknown_start' | 'duplicate_id' | 'unknown_target' | 'few_options' | 'empty_label' | 'dead_end' | 'terminal_options'
  | 'missing_article' | 'empty_text' | 'no_exit' | 'unreachable' | 'limit';
export interface FlowIssue { level: 'error' | 'warning'; code: IssueCode; nodeId?: string; message: string }
export interface FlowValidation { ok: boolean; errors: string[]; warnings: string[]; issues: FlowIssue[] }

/** Errors a draft may still carry ("work in progress"); every other error is rejected even when saving a draft. */
export const INCOMPLETE_CODES: readonly IssueCode[] = ['no_start', 'few_options', 'empty_label', 'dead_end', 'missing_article', 'empty_text'];

/** Pure structural + graph validation. Never throws. */
export function validateFlow(flow: Flow): FlowValidation {
  const issues: FlowIssue[] = [];
  const add = (level: FlowIssue['level'], code: IssueCode, message: string, nodeId?: string) => issues.push({ level, code, message, nodeId });
  const list: FlowNode[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const name = (n: FlowNode) => `"${(n.text ?? '').slice(0, 40) || n.id}"`;

  if (!Array.isArray(flow?.nodes)) add('error', 'limit', 'The flow has no node list.');
  if (list.length > FLOW_LIMITS.nodes) add('error', 'limit', `A flow can have at most ${FLOW_LIMITS.nodes} nodes (this one has ${list.length}).`);
  if (!flow?.title?.trim?.()) add('error', 'empty_text', 'The flow needs a title.');

  const ids = new Set<string>();
  for (const n of list) {
    if (ids.has(n.id)) add('error', 'duplicate_id', `Duplicate node id "${n.id}".`, n.id);
    ids.add(n.id);
  }
  if (!flow?.startId) add('error', 'no_start', 'Pick a start node.');
  else if (!ids.has(flow.startId)) add('error', 'unknown_start', `The start node "${flow.startId}" does not exist.`);

  for (const n of list) {
    const text = (n.text ?? '').trim();
    if (!text) add('error', 'empty_text', `Node ${n.id} needs text.`, n.id);
    else if (text.length > FLOW_LIMITS.text) add('error', 'limit', `The text of ${name(n)} is longer than ${FLOW_LIMITS.text} characters.`, n.id);
    if ((n.detail?.length ?? 0) > FLOW_LIMITS.detail) add('error', 'limit', `The detail of ${name(n)} is longer than ${FLOW_LIMITS.detail} characters.`, n.id);
    const opts = n.options ?? [];
    if (n.kind === 'question') {
      if (!opts.length) add('error', 'dead_end', `${name(n)} is a dead end: it has no answers.`, n.id);
      else if (opts.length < 2) add('error', 'few_options', `${name(n)} needs at least 2 answers.`, n.id);
      if (opts.length > FLOW_LIMITS.options) add('error', 'limit', `${name(n)} has more than ${FLOW_LIMITS.options} answers.`, n.id);
      for (const o of opts) {
        const label = (o.label ?? '').trim();
        if (!label) add('error', 'empty_label', `${name(n)} has an answer with an empty label.`, n.id);
        else if (label.length > FLOW_LIMITS.label) add('error', 'limit', `An answer label in ${name(n)} is longer than ${FLOW_LIMITS.label} characters.`, n.id);
        if (!ids.has(o.to)) add('error', 'unknown_target', `Answer "${label || '(empty)'}" of ${name(n)} points to a node that does not exist ("${o.to}").`, n.id);
      }
    } else {
      if (opts.length) add('error', 'terminal_options', `${n.kind === 'result' ? 'Result' : 'Article'} ${name(n)} must not have options.`, n.id);
      if (n.kind === 'article' && !n.articleId) add('error', 'missing_article', `Article node ${name(n)} needs a linked article.`, n.id);
    }
  }

  // graph checks only make sense on a resolvable start
  if (ids.has(flow?.startId)) {
    const byId = new Map(list.map((n) => [n.id, n]));
    const next = (id: string) => (byId.get(id)?.options ?? []).map((o) => o.to).filter((t) => byId.has(t));
    const reach = (from: string[]) => {
      const seen = new Set<string>(), stack = [...from];
      while (stack.length) { const x = stack.pop()!; if (!seen.has(x)) { seen.add(x); stack.push(...next(x)); } }
      return seen;
    };
    const fromStart = reach([flow.startId]);
    for (const n of list) if (!fromStart.has(n.id)) add('warning', 'unreachable', `${name(n)} is not reachable from the start.`, n.id);

    // nodes that can reach a result/article (fixpoint, no recursion)
    const exits = new Set(list.filter((n) => n.kind !== 'question').map((n) => n.id));
    for (let grew = true; grew;) {
      grew = false;
      for (const n of list) if (!exits.has(n.id) && next(n.id).some((t) => exits.has(t))) { exits.add(n.id); grew = true; }
    }
    for (const id of fromStart) {
      if (exits.has(id) || !next(id).length) continue; // dead ends are reported above
      if (reach(next(id)).has(id)) add('error', 'no_exit', `${name(byId.get(id)!)} is part of a loop with no way out to a result or article.`, id);
    }
  }

  const errors = issues.filter((i) => i.level === 'error').map((i) => i.message);
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === 'warning').map((i) => i.message), issues };
}

// ---- runner state machine (pure; the UI holds the state) ----
/** trail[i] is a visited question, choices[i] the answer index taken there */
export interface RunState { nodeId: string; trail: string[]; choices: number[]; error?: 'unknown_node' | 'bad_option' | 'too_many_steps' }

export function start(flow: Flow): RunState {
  return flow.nodes.some((n) => n.id === flow.startId) ? { nodeId: flow.startId, trail: [], choices: [] } : { nodeId: flow.startId, trail: [], choices: [], error: 'unknown_node' };
}
export const restart = start;

/** Take answer `optionIndex` of the current question. Never throws; problems come back as `error` on an otherwise unchanged state. */
export function step(flow: Flow, state: RunState, optionIndex: number): RunState {
  const cur = flow.nodes.find((n) => n.id === state.nodeId);
  const base = { nodeId: state.nodeId, trail: state.trail, choices: state.choices };
  if (!cur) return { ...base, error: 'unknown_node' };
  const to = cur.kind === 'question' ? cur.options?.[optionIndex]?.to : undefined;
  if (to === undefined) return { ...base, error: 'bad_option' };
  if (!flow.nodes.some((n) => n.id === to)) return { ...base, error: 'unknown_node' };
  if (state.trail.length >= MAX_STEPS) return { ...base, error: 'too_many_steps' };
  return { nodeId: to, trail: [...state.trail, state.nodeId], choices: [...state.choices, optionIndex] };
}

/** One step back (no-op at the start). Clears an error state. */
export function back(state: RunState): RunState {
  const prev = state.trail[state.trail.length - 1];
  return prev === undefined ? { nodeId: state.nodeId, trail: state.trail, choices: state.choices } : { nodeId: prev, trail: state.trail.slice(0, -1), choices: state.choices.slice(0, -1) };
}
/** Jump to position `index` of the trail (breadcrumb click). */
export function goTo(state: RunState, index: number): RunState {
  return index >= 0 && index < state.trail.length ? { nodeId: state.trail[index]!, trail: state.trail.slice(0, index), choices: state.choices.slice(0, index) } : { nodeId: state.nodeId, trail: state.trail, choices: state.choices };
}

/** The worked example from the spec; also used by tests. */
export const EDI_EXAMPLE: Flow = {
  title: 'EDI claim failed to import', startId: 'gop',
  nodes: [
    { id: 'gop', kind: 'question', text: 'Is there a GOP for this case?', options: [{ label: 'Yes', to: 'member' }, { label: 'No', to: 'need-gop' }] },
    { id: 'need-gop', kind: 'result', severity: 'warning', text: 'Ask the medical team to issue a GOP, then re-queue the claim.' },
    { id: 'member', kind: 'question', text: 'Is the member ID valid?', options: [{ label: 'Yes', to: 'case' }, { label: 'No, leading zeros are missing', to: 'fix-member' }] },
    { id: 'fix-member', kind: 'result', severity: 'info', text: 'Correct the member ID on the claim and use Retry match.' },
    { id: 'case', kind: 'question', text: 'Is there a matching open case?', options: [{ label: 'Yes', to: 'proc' }, { label: 'No', to: 'member' }] },
    { id: 'proc', kind: 'article', text: 'Follow the corrective procedure', articleId: 'a-1' },
  ],
};
