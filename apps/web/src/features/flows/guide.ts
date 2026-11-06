import type { Flow, FlowNode, FlowNodeKind } from '@ops/shared';
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

/** Depth first from the start: finish one path to its ending before the next answer, so the author never juggles branches. */
export function nextTask(flow: Flow): Task {
  if (!flow.title.trim()) return { kind: 'title' };
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const walk = (id: string, path: PathStep[]): Task | null => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return null; // loops back to a known step are fine
    seen.add(id);
    const need = missing(n);
    if (need) return { kind: need, nodeId: id, path: [...path, { nodeId: id }] } as Task;
    for (const [i, o] of (n.options ?? []).entries()) {
      const here = [...path, { nodeId: id, answer: o.label }];
      if (!o.to) return { kind: 'branch', nodeId: id, option: i, path: here };
      const t = walk(o.to, here);
      if (t) return t;
    }
    return null;
  };
  return walk(flow.startId, []) ?? { kind: 'done' };
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
