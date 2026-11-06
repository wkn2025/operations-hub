import { describe, expect, it } from 'vitest';
import { back, goTo, restart, start, step, validateFlow, EDI_EXAMPLE, INCOMPLETE_CODES, MAX_STEPS, type Flow } from '../src/flow';

const q = (id: string, ...to: string[]) => ({ id, kind: 'question' as const, text: `Question ${id}?`, options: to.map((t, i) => ({ label: `Option ${i + 1}`, to: t })) });
const res = (id: string) => ({ id, kind: 'result' as const, text: `Result ${id}` });
const flow = (nodes: Flow['nodes'], startId = nodes[0]?.id ?? ''): Flow => ({ title: 'T', startId, nodes });
const errs = (f: Flow) => validateFlow(f).errors.join(' | ');

describe('validateFlow', () => {
  it('accepts the EDI claim example', () => {
    const r = validateFlow(EDI_EXAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('rejects missing and unknown start', () => {
    expect(errs(flow([res('a')], ''))).toMatch(/start/i);
    expect(errs(flow([res('a')], 'zzz'))).toMatch(/start.*zzz/i);
  });
  it('rejects duplicate ids and unknown targets', () => {
    expect(errs(flow([q('a', 'b', 'b'), res('b'), res('b')]))).toMatch(/duplicate/i);
    expect(errs(flow([q('a', 'b', 'nope'), res('b')]))).toMatch(/nope/);
  });
  it('rejects questions with fewer than 2 options, empty labels and dead ends', () => {
    expect(errs(flow([q('a', 'b'), res('b')]))).toMatch(/at least 2/i);
    expect(errs(flow([{ ...q('a', 'b', 'b'), options: [{ label: ' ', to: 'b' }, { label: 'x', to: 'b' }] }, res('b')]))).toMatch(/empty label/i);
    expect(errs(flow([{ id: 'a', kind: 'question', text: 'x' }, res('b')]))).toMatch(/dead end/i);
  });
  it('an answer that does not lead anywhere yet is an "incomplete" error (draft may keep it), not an unknown target', () => {
    const v = validateFlow(flow([q('a', 'b', ''), res('b')]));
    expect(v.issues.map((i) => i.code)).toEqual(['open_answer']);
    expect(INCOMPLETE_CODES).toContain('open_answer');
  });
  it('rejects options on results/articles and articles without articleId', () => {
    expect(errs(flow([{ ...res('a'), options: [{ label: 'x', to: 'a' }] }]))).toMatch(/must not have options/i);
    expect(errs(flow([{ id: 'a', kind: 'article', text: 'x' }]))).toMatch(/linked article/i);
  });
  it('flags unreachable nodes as warnings only', () => {
    const r = validateFlow(flow([q('a', 'b', 'b'), res('b'), res('orphan')]));
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/orphan.*not reachable/i);
  });
  it('rejects a cycle with no exit but allows one with an exit', () => {
    expect(errs(flow([q('a', 'b', 'b'), q('b', 'a', 'a')]))).toMatch(/no way out/i);
    const ok = flow([q('a', 'b', 'r'), q('b', 'a', 'r'), res('r')]);
    expect(validateFlow(ok).ok).toBe(true);
  });
  it('enforces limits', () => {
    const many = Array.from({ length: 201 }, (_, i) => res(`n${i}`));
    expect(errs(flow(many))).toMatch(/at most 200/);
    expect(errs(flow([{ ...res('a'), text: 'x'.repeat(401) }]))).toMatch(/text/i);
    expect(errs(flow([{ ...res('a'), text: '' }]))).toMatch(/text/i);
  });
  it('is pure and tolerates garbage', () => {
    expect(validateFlow({ title: 'x', startId: 'a', nodes: null as never }).ok).toBe(false);
  });
});

describe('runner', () => {
  const f = flow([q('a', 'b', 'c'), q('b', 'a', 'c'), res('c')]);
  it('steps, goes back, goes to a trail position and restarts', () => {
    let s = start(f);
    expect(s).toEqual({ nodeId: 'a', trail: [], choices: [] });
    s = step(f, s, 0); expect(s).toEqual({ nodeId: 'b', trail: ['a'], choices: [0] });
    s = step(f, s, 1); expect(s).toEqual({ nodeId: 'c', trail: ['a', 'b'], choices: [0, 1] });
    expect(back(s)).toEqual({ nodeId: 'b', trail: ['a'], choices: [0] });
    expect(goTo(s, 0)).toEqual({ nodeId: 'a', trail: [], choices: [] });
    expect(back(start(f))).toEqual(start(f));
    expect(restart(f)).toEqual(start(f));
  });
  it('records which answer was chosen even when two answers lead to the same node', () => {
    const twin = flow([q('a', 'r', 'r'), res('r')]);
    expect(step(twin, start(twin), 1).choices).toEqual([1]);
  });
  it('unknown node, bad option and results give an error state, never a crash', () => {
    expect(step(f, { nodeId: 'ghost', trail: [], choices: [] }, 0).error).toBe('unknown_node');
    expect(step(f, start(f), 9).error).toBe('bad_option');
    expect(step(f, { nodeId: 'c', trail: [], choices: [] }, 0).error).toBe('bad_option');
    expect(start(flow([], 'x')).error).toBe('unknown_node');
  });
  it('a loop is cut after MAX_STEPS', () => {
    const loop = flow([q('a', 'b', 'r'), q('b', 'a', 'r'), res('r')]);
    let s = start(loop);
    for (let i = 0; i < MAX_STEPS + 5 && !s.error; i++) s = step(loop, s, 0);
    expect(s.error).toBe('too_many_steps');
    expect(s.trail.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(back(s).error).toBeUndefined();
  });
});
