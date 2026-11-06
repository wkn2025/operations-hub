import { describe, expect, it } from 'vitest';
import type { Flow } from '@ops/shared';
import { chooseNext, layout, nextTask, progress, undoChoice } from './guide';

const base = (nodes: Flow['nodes'], title = 'Printer broken'): Flow => ({ title, startId: 'q1', nodes });

describe('guided builder: next task', () => {
  it('asks for the title, then the first question, then its answers', () => {
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: '' }], ''))).toEqual({ kind: 'title' });
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: '' }]))).toMatchObject({ kind: 'question', nodeId: 'q1' });
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: 'On?', options: [] }]))).toMatchObject({ kind: 'answers', nodeId: 'q1' });
  });

  it('follows the first answer down, then goes back to the highest open answer (top-down), with the path so far', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q2' }, { label: 'No', to: '' }] },
      { id: 'q2', kind: 'question', text: 'Paper?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: '' }] },
      { id: 'r1', kind: 'result', text: 'Print' },
    ]);
    expect(nextTask(f)).toEqual({ kind: 'branch', nodeId: 'q1', option: 1, path: [{ nodeId: 'q1', answer: 'No' }] });
    const fresh = { ...f, nodes: [...f.nodes.map((n) => (n.id === 'q1' ? { ...n, options: [n.options![0]!, { label: 'No', to: 'q3' }] } : n)), { id: 'q3', kind: 'question' as const, text: '' }] };
    expect(nextTask(fresh)).toMatchObject({ kind: 'question', nodeId: 'q3' }); // a step just added is filled in straight away
    const q3asked = { ...fresh, nodes: fresh.nodes.map((n) => (n.id === 'q3' ? { ...n, text: 'Plugged in?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] } : n)) };
    expect(nextTask(q3asked)).toMatchObject({ kind: 'branch', nodeId: 'q3', option: 0 }); // a new question: follow its first answer down first
    const deep = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q2' }, { label: 'No', to: 'r1' }] },
      { id: 'q2', kind: 'question', text: 'Paper?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] },
      { id: 'r1', kind: 'result', text: 'Switch on' },
    ]);
    expect(nextTask(deep)).toEqual({ kind: 'branch', nodeId: 'q2', option: 0, path: [{ nodeId: 'q1', answer: 'Yes' }, { nodeId: 'q2', answer: 'Yes' }] });
  });

  it('asks to fill a new ending, then is done when every path ends', () => {
    const open = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'a1' }] },
      { id: 'r1', kind: 'result', text: '' },
      { id: 'a1', kind: 'article', text: '' },
    ]);
    expect(nextTask(open)).toMatchObject({ kind: 'result', nodeId: 'r1' });
    const r1done = { ...open, nodes: open.nodes.map((n) => (n.id === 'r1' ? { ...n, text: 'Print a test page' } : n)) };
    expect(nextTask(r1done)).toMatchObject({ kind: 'article', nodeId: 'a1' });
    const all = { ...r1done, nodes: r1done.nodes.map((n) => (n.id === 'a1' ? { ...n, text: 'Read this', articleId: 'x' } : n)) };
    expect(nextTask(all)).toEqual({ kind: 'done' });
  });

  it('survives loops', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q1' }, { label: 'No', to: 'r1' }] },
      { id: 'r1', kind: 'result', text: 'Done' },
    ]);
    expect(nextTask(f)).toEqual({ kind: 'done' });
  });
});

describe('guided builder: several new questions at once (after a reload)', () => {
  it('starts with the highest one, left first', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q2' }, { label: 'No', to: 'q3' }] },
      { id: 'q2', kind: 'question', text: 'Paper?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] },
      { id: 'q3', kind: 'question', text: 'Plugged?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] },
    ]);
    expect(nextTask(f)).toMatchObject({ kind: 'branch', nodeId: 'q2', option: 0 });
  });
});

describe('guided builder: choosing what happens next', () => {
  it('creates the chosen step and points the answer at it', () => {
    const f = base([{ id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] }]);
    const r = chooseNext(f, 'q1', 1, 'result');
    expect(r.flow.nodes.find((n) => n.id === r.id)).toMatchObject({ kind: 'result', text: '', severity: 'success' });
    expect(r.flow.nodes[0]!.options![1]!.to).toBe(r.id);
  });
});

describe('guided builder: progress', () => {
  it('counts finished endings and open paths', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: '' }, { label: 'Maybe', to: 'r2' }] },
      { id: 'r1', kind: 'result', text: 'Fine' },
      { id: 'r2', kind: 'result', text: '' },
    ]);
    expect(progress(f)).toEqual({ done: 1, open: 2 });
  });
  it('a brand-new flow is not "finished", and steps nobody can reach do not count', () => {
    expect(progress(base([{ id: 'q1', kind: 'question', text: '' }]))).toEqual({ done: 0, open: 1 });
    expect(progress(base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'r1' }] },
      { id: 'r1', kind: 'result', text: 'Fine' }, { id: 'zz', kind: 'result', text: '' },
    ]))).toEqual({ done: 1, open: 0 });
  });
});

describe('guided builder: fixing mistakes', () => {
  it('an answer with an empty label sends the author back to the answers', () => {
    const f = base([{ id: 'q1', kind: 'question', text: 'On?', options: [{ label: ' ', to: '' }, { label: 'No', to: '' }] }]);
    expect(nextTask(f)).toMatchObject({ kind: 'answers', nodeId: 'q1' });
  });
  it('"choose something else" removes the new step and reopens the answer', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'a1' }, { label: 'No', to: '' }] },
      { id: 'a1', kind: 'article', text: '' },
    ]);
    const g = undoChoice(f, 'a1');
    expect(g.nodes.map((n) => n.id)).toEqual(['q1']);
    expect(nextTask(g)).toMatchObject({ kind: 'branch', nodeId: 'q1', option: 0 });
  });
});

describe('guided builder: the live map', () => {
  it('lays the flow out: col = steps from the start, row = centre across (open "?" and "back to" slots are half width), parents centred', () => {
    const m = layout(base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q2' }, { label: 'No', to: '' }] },
      { id: 'q2', kind: 'question', text: 'Paper?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'q1' }] },
      { id: 'r1', kind: 'result', text: 'Print' },
    ]));
    const at = (k: string) => m.boxes.find((b) => b.key === k)!;
    expect(m.boxes.map((b) => [b.kind, b.col, b.row])).toEqual([
      ['question', 0, 1.3125], ['question', 1, 0.875], ['result', 2, 0.5], ['repeat', 2, 1.25], ['open', 1, 1.75],
    ]);
    expect(at(m.boxes[4]!.key)).toMatchObject({ kind: 'open', from: { nodeId: 'q1', option: 1 } });
    expect(m.edges.map((e) => e.label)).toEqual(['Yes', 'Yes', 'No', 'No']);
    expect([m.cols, m.rows]).toEqual([3, 2]); // rows = total width in step units
  });
});
