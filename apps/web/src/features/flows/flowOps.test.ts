import { describe, expect, it } from 'vitest';
import { validateFlow, type Flow } from '@ops/shared';
import { addNode, outline, removeNode, saveable, setTarget, STARTER_FLOW } from './flowOps';

const f: Flow = {
  title: 'T', startId: 'q1',
  nodes: [
    { id: 'q1', kind: 'question', text: 'One?', options: [{ label: 'a', to: 'q2' }, { label: 'b', to: 'r1' }] },
    { id: 'q2', kind: 'question', text: 'Two?', options: [{ label: 'back', to: 'q1' }, { label: 'c', to: 'r1' }] },
    { id: 'r1', kind: 'result', text: 'Done' },
    { id: 'lost', kind: 'result', text: 'Orphan' },
  ],
};

describe('flowOps', () => {
  it('the starter flow is valid', () => expect(validateFlow({ ...STARTER_FLOW, title: 'x' }).ok).toBe(true));

  it('addNode gives unique ids and sensible defaults; the first node becomes the start', () => {
    const a = addNode({ title: 'x', startId: '', nodes: [] }, 'question');
    expect(a.flow.startId).toBe(a.id);
    expect(a.flow.nodes[0]).toMatchObject({ kind: 'question', options: [] });
    const b = addNode(a.flow, 'question');
    expect(b.id).not.toBe(a.id);
    expect(addNode(b.flow, 'result').flow.nodes.at(-1)).toMatchObject({ kind: 'result', severity: 'info' });
  });

  it('removeNode drops answers that pointed at it and reports how many; moves the start', () => {
    const r = removeNode(f, 'r1');
    expect(r.removedAnswers).toBe(2);
    expect(r.flow.nodes.map((n) => n.id)).toEqual(['q1', 'q2', 'lost']);
    expect(r.flow.nodes[0]!.options).toEqual([{ label: 'a', to: 'q2' }]);
    const s = removeNode(f, 'q1');
    expect(s.flow.startId).toBe('q2');
    expect(validateFlow(s.flow).issues.some((i) => i.code === 'unknown_target')).toBe(false);
  });

  it('setTarget can create a new node and point at it', () => {
    const r = setTarget(f, 'q1', 0, '__new:result');
    const created = r.flow.nodes.find((n) => n.id === r.createdId)!;
    expect(created.kind).toBe('result');
    expect(r.flow.nodes[0]!.options![0]!.to).toBe(created.id);
    expect(setTarget(f, 'q1', 0, 'r1').flow.nodes[0]!.options![0]!.to).toBe('r1');
  });

  it('outline indents by path, marks repeats and lists unconnected nodes', () => {
    const o = outline(f);
    expect(o.rows.map((r) => [r.depth, r.nodeId, r.repeat ?? false])).toEqual([[0, 'q1', false], [1, 'q2', false], [2, 'q1', true], [2, 'r1', false], [1, 'r1', true]]);
    expect(o.rows[1]!.via).toBe('a');
    expect(o.unconnected).toEqual(['lost']);
  });

  it('saveable strips answers that have no target yet (they stay local)', () => {
    const g = { ...f, nodes: [{ ...f.nodes[0]!, options: [...f.nodes[0]!.options!, { label: 'new', to: '' }] }, ...f.nodes.slice(1)] };
    expect(saveable(g).nodes[0]!.options).toHaveLength(2);
  });
});
