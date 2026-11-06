import type { Flow, FlowNode, FlowNodeKind, FlowOption } from '@ops/shared';
import { setTarget } from './flowOps';

/** One step of the guided builder: the single thing the author is asked next. */
export type Task =
  | { kind: 'title' }
  | { kind: 'question' | 'answers' | 'result' | 'article'; nodeId: string; path: PathStep[] }
  | { kind: 'branch'; nodeId: string; option: number; path: PathStep[] }
  | { kind: 'done' };
/** How the author got here: each question on the way and the answer taken (the last one is the open answer). */
export interface PathStep { nodeId: string; answer?: string }

const missing = (n: FlowNode): Task['kind'] | null =>
  !n.text.trim() ? (n.kind === 'question' ? 'question' : n.kind) // a blank result/article: write it
  : n.kind === 'question' && ((n.options ?? []).length < 2 || n.options!.some((o) => !o.label.trim())) ? 'answers'
  : n.kind === 'article' && !n.articleId ? 'article'
  : null;

/**
 * What to ask next, in the order people think it through:
 * 1. a step that isn't filled in yet (the one the author just added);
 * 2. a new question's first answer (follow the "Yes" path down to an ending first);
 * 3. otherwise the highest open answer, top-down, so after an ending the author goes back to the FIRST question's
 *    other answer, not the last one.
 */
export function nextTask(flow: Flow): Task {
  if (!flow.title.trim()) return { kind: 'title' };
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const order: { id: string; path: PathStep[] }[] = [], seen = new Set<string>();
  for (let queue = [{ id: flow.startId, path: [] as PathStep[] }]; queue.length;) {
    const at = queue.shift()!, n = byId.get(at.id);
    if (!n || seen.has(at.id)) continue; // loops back to a known step are fine
    seen.add(at.id); order.push(at);
    for (const o of n.options ?? []) if (o.to) queue.push({ id: o.to, path: [...at.path, { nodeId: at.id, answer: o.label }] });
  }
  for (const { id, path } of order) {
    const need = missing(byId.get(id)!);
    if (need) return { kind: need, nodeId: id, path: [...path, { nodeId: id }] } as Task;
  }
  const branch = (id: string, path: PathStep[], i: number): Task =>
    ({ kind: 'branch', nodeId: id, option: i, path: [...path, { nodeId: id, answer: byId.get(id)!.options![i]!.label }] });
  const fresh = (id: string) => { const o = byId.get(id)!.options ?? []; return o.length > 0 && o.every((x) => !x.to); };
  for (const { id, path } of order) if (fresh(id)) return branch(id, path, 0); // a new question, the highest first
  for (const { id, path } of order) {
    const i = (byId.get(id)!.options ?? []).findIndex((o) => !o.to);
    if (i >= 0) return branch(id, path, i);
  }
  return { kind: 'done' };
}

/** "What happens when they answer X?": make the new step and point the answer at it. Endings default to "this solves it". */
export function chooseNext(flow: Flow, nodeId: string, option: number, kind: FlowNodeKind) {
  const r = setTarget(flow, nodeId, option, `__new:${kind}`);
  const id = r.createdId!;
  return { id, flow: kind === 'result' ? { ...r.flow, nodes: r.flow.nodes.map((n) => (n.id === id ? { ...n, severity: 'success' as const } : n)) } : r.flow };
}

/** Steps reachable from the start (the only ones a reader can ever see). */
function reachable(flow: Flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n])), seen = new Set<string>(), stack = [flow.startId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const o of byId.get(id)!.options ?? []) if (o.to) stack.push(o.to);
  }
  return [...seen].map((id) => byId.get(id)!);
}

/** Finished endings vs. things still to do on reachable steps (blank steps + answers going nowhere), for the progress bar. */
export function progress(flow: Flow) {
  let done = 0, open = 0;
  for (const n of reachable(flow)) {
    open += (n.options ?? []).filter((o) => !o.to).length;
    if (missing(n)) open++;
    else if (n.kind !== 'question') done++;
  }
  return { done, open };
}

/** "Choose something else": drop a step that has nothing after it and reopen the answers that led to it. */
export function undoChoice(flow: Flow, id: string): Flow {
  return {
    ...flow,
    nodes: flow.nodes.filter((n) => n.id !== id).map((n) => (n.options?.some((o) => o.to === id) ? { ...n, options: n.options.map((o) => (o.to === id ? { ...o, to: '' } : o)) } : n)),
  };
}

/** A box on the live map: a step, an answer not decided yet ("open"), or a jump back to a step shown elsewhere ("repeat"). */
export interface MapBox { key: string; kind: FlowNodeKind | 'open' | 'repeat'; nodeId?: string; from?: { nodeId: string; option: number }; col: number; row: number }
export interface MapEdge { from: string; to: string; label: string; option: number }

/**
 * Tree layout: `col` = steps from the start (drawn top-down); `row` = centre across, in step widths. Open "?" slots and
 * "back to" boxes are half width (SLOT), so a half-built yes/no tree stays narrow; a question sits centred over its answers.
 */
export const SLOT = 0.5;
export function layout(flow: Flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const boxes: MapBox[] = [], edges: MapEdge[] = [], seen = new Set<string>();
  let leaf = 0, cols = 0; // leaf = width used so far
  const next = (span: number) => { const c = leaf + span / 2; leaf += span; return c; };
  const add = (b: Omit<MapBox, 'row'>, row: number) => { boxes.push({ ...b, row }); cols = Math.max(cols, b.col + 1); return row; };
  const place = (id: string, col: number, key: string): number => {
    const n = byId.get(id)!;
    if (seen.has(id)) return add({ key, kind: 'repeat', nodeId: id, col }, next(SLOT));
    seen.add(id);
    const box: MapBox = { key, kind: n.kind, nodeId: id, col, row: 0 };
    boxes.push(box);
    const opts = n.options ?? [];
    if (!opts.length) { box.row = next(1); cols = Math.max(cols, col + 1); return box.row; }
    const start = leaf;
    const rows = opts.map((o, i) => {
      const child = `${key}/${i}`;
      edges.push({ from: key, to: child, label: o.label, option: i });
      return o.to && byId.has(o.to) ? place(o.to, col + 1, child) : add({ key: child, kind: 'open', from: { nodeId: id, option: i }, col: col + 1 }, next(SLOT));
    });
    leaf = Math.max(leaf, start + 1); // a question is a full step wide even over one narrow "?"
    box.row = Math.min(Math.max((rows[0]! + rows.at(-1)!) / 2, start + 0.5), leaf - 0.5);
    cols = Math.max(cols, col + 1);
    return box.row;
  };
  if (byId.has(flow.startId)) place(flow.startId, 0, 's');
  return { boxes, edges, cols, rows: leaf };
}

/** "I mixed up Yes and No": answers i and j swap where they lead (whole branches move; labels and order stay). */
export function swapAnswers(flow: Flow, id: string, i: number, j: number): Flow {
  const n = flow.nodes.find((x) => x.id === id), a = n?.options?.[i], b = n?.options?.[j];
  if (!n || !a || !b || i === j || a.to === b.to) return flow;
  const options = n.options!.map((o, k): FlowOption => (k === i ? { ...o, to: b.to } : k === j ? { ...o, to: a.to } : o));
  return { ...flow, nodes: flow.nodes.map((x) => (x.id === id ? { ...x, options } : x)) };
}

/**
 * The × on a map tile: remove a step, plus whatever only it led to (steps nobody else can reach any more); every
 * answer that led to it is open again, so the builder asks "what happens next?" there. The first question stays.
 */
export function removeStep(flow: Flow, id: string): Flow {
  if (id === flow.startId || !flow.nodes.some((n) => n.id === id)) return flow;
  const before = new Set(reachable(flow).map((n) => n.id));
  const opened = undoChoice(flow, id);
  const after = new Set(reachable(opened).map((n) => n.id));
  return { ...opened, nodes: opened.nodes.filter((n) => after.has(n.id) || !before.has(n.id)) }; // unrelated orphans stay
}

/** The × on a "Same" box: this answer no longer uses that ending (the ending stays for the others). */
export function unlinkAnswer(flow: Flow, id: string, option: number): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.id === id && n.options?.[option] ? { ...n, options: n.options.map((o, i) => (i === option ? { ...o, to: '' } : o)) } : n)) };
}
