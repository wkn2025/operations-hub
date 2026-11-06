import { describe, expect, it } from 'vitest';
import type { Flow } from '@ops/shared';
import { chooseNext, nextTask, progress } from './guide';

const base = (nodes: Flow['nodes'], title = 'Printer broken'): Flow => ({ title, startId: 'q1', nodes });

describe('guided builder: next task', () => {
  it('asks for the title, then the first question, then its answers', () => {
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: '' }], ''))).toEqual({ kind: 'title' });
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: '' }]))).toMatchObject({ kind: 'question', nodeId: 'q1' });
    expect(nextTask(base([{ id: 'q1', kind: 'question', text: 'On?', options: [] }]))).toMatchObject({ kind: 'answers', nodeId: 'q1' });
  });

  it('walks one path to its end before the next answer (depth first), with the path so far', () => {
    const f = base([
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'q2' }, { label: 'No', to: '' }] },
      { id: 'q2', kind: 'question', text: 'Paper?', options: [{ label: 'Yes', to: '' }, { label: 'No', to: '' }] },
    ]);
    expect(nextTask(f)).toEqual({ kind: 'branch', nodeId: 'q2', option: 0, path: [{ nodeId: 'q1', answer: 'Yes' }, { nodeId: 'q2', answer: 'Yes' }] });
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
});
