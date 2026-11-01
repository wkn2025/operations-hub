import type { Flow, FlowNode, FlowNodeKind } from '@ops/shared';

/** What "Create flow" starts from: one question, two outcomes. Valid, so it can be saved and published straight away. */
export const STARTER_FLOW: Flow = {
  title: '', startId: 'q1',
  nodes: [
    { id: 'q1', kind: 'question', text: 'What are you seeing?', options: [{ label: 'The first symptom', to: 'r1' }, { label: 'Something else', to: 'r2' }] },
    { id: 'r1', kind: 'result', severity: 'info', text: 'Describe what to do for the first symptom.' },
    { id: 'r2', kind: 'result', severity: 'warning', text: 'Describe who to contact when nothing matches.' },
  ],
};

const PREFIX: Record<FlowNodeKind, string> = { question: 'q', result: 'r', article: 'a' };
const nextId = (nodes: FlowNode[], kind: FlowNodeKind) => {
  const used = new Set(nodes.map((n) => n.id));
  for (let i = 1; ; i++) if (!used.has(PREFIX[kind] + i)) return PREFIX[kind] + i;
};

const blank = (id: string, kind: FlowNodeKind): FlowNode =>
  kind === 'question' ? { id, kind, text: '', options: [] }
  : kind === 'result' ? { id, kind, text: '', severity: 'info' }
  : { id, kind, text: '' };

export function addNode(flow: Flow, kind: FlowNodeKind): { flow: Flow; id: string } {
  const id = nextId(flow.nodes, kind);
  return { id, flow: { ...flow, startId: flow.startId || id, nodes: [...flow.nodes, blank(id, kind)] } };
}

/** Deleting a step also removes the answers that led to it (they would dangle); the caller tells the user how many. */
export function removeNode(flow: Flow, id: string): { flow: Flow; removedAnswers: number } {
  let removedAnswers = 0;
  const nodes = flow.nodes.filter((n) => n.id !== id).map((n) => {
    if (!n.options?.some((o) => o.to === id)) return n;
    removedAnswers += n.options.filter((o) => o.to === id).length;
    return { ...n, options: n.options.filter((o) => o.to !== id) };
  });
  return { flow: { ...flow, nodes, startId: flow.startId === id ? (nodes[0]?.id ?? '') : flow.startId }, removedAnswers };
}

/** `to` is a node id, or "__new:<kind>" to create a new node and point the answer at it. */
export function setTarget(flow: Flow, nodeId: string, optionIndex: number, to: string): { flow: Flow; createdId?: string } {
  let base = flow, target = to, createdId: string | undefined;
  if (to.startsWith('__new:')) {
    const added = addNode(flow, to.slice(6) as FlowNodeKind);
    base = added.flow; target = createdId = added.id;
  }
  const nodes = base.nodes.map((n) => (n.id === nodeId ? { ...n, options: (n.options ?? []).map((o, i) => (i === optionIndex ? { ...o, to: target } : o)) } : n));
  return { flow: { ...base, nodes }, createdId };
}

export interface OutlineRow { depth: number; nodeId: string; via?: string; repeat?: boolean }
/** Depth-first tree from the start; a node reached again is shown once more as a "repeat" and not expanded (loops are allowed). */
export function outline(flow: Flow): { rows: OutlineRow[]; unconnected: string[] } {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const rows: OutlineRow[] = [], seen = new Set<string>();
  const walk = (id: string, depth: number, via?: string) => {
    const n = byId.get(id);
    if (!n) return;
    if (seen.has(id)) { rows.push({ depth, nodeId: id, via, repeat: true }); return; }
    seen.add(id);
    rows.push({ depth, nodeId: id, via });
    for (const o of n.options ?? []) walk(o.to, depth + 1, o.label);
  };
  walk(flow.startId, 0);
  return { rows, unconnected: flow.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id) };
}

/** What is sent to the server: answers without a target yet stay in the editor only. */
export function saveable(flow: Flow): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.options ? { ...n, options: n.options.filter((o) => o.to) } : n)) };
}
