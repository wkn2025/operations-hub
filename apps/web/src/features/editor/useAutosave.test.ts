import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../api/client';
import { useAutosave } from './useAutosave';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('useAutosave', () => {
  it('debounces changes and saves the latest doc once', async () => {
    const save = vi.fn(async () => ({ revision: 2 }));
    const { result } = renderHook(() => useAutosave(save, 1500, 1));
    act(() => result.current.change('a'));
    await tick(500);
    act(() => result.current.change('ab'));
    await tick(1000);
    act(() => result.current.change('abc'));
    await tick(1499);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(true);
    await tick(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc', 1, expect.anything());
    expect(result.current.status).toBe('saved');
    expect(result.current.dirty).toBe(false);
  });

  it('sends the revision returned by the previous save as baseRevision', async () => {
    let rev = 4;
    const save = vi.fn(async (_d: number, _rev: number) => ({ revision: ++rev }));
    const { result } = renderHook(() => useAutosave(save, 100, 4));
    act(() => result.current.change(1)); await tick(100);
    act(() => result.current.change(2)); await tick(100);
    expect(save.mock.calls.map((c) => c[1])).toEqual([4, 5]);
    expect(result.current.revision).toBe(6);
  });

  it('a change made while a save is in flight is saved afterwards with the new revision', async () => {
    let resolve!: (v: { revision: number }) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolve = r; }))
      .mockImplementationOnce(async () => ({ revision: 3 }));
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('one')); await tick(100);
    expect(result.current.status).toBe('saving');
    act(() => result.current.change('two'));
    await act(async () => { resolve({ revision: 2 }); });
    expect(result.current.dirty).toBe(true); // 'two' not saved yet
    await tick(100);
    expect(save).toHaveBeenLastCalledWith('two', 2, expect.anything());
    expect(result.current.status).toBe('saved');
  });

  it('surfaces conflict on 409 and stops saving', async () => {
    const save = vi.fn(async () => { throw new HttpError(409, { error: 'conflict', current: { revision: 9 } }); });
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    expect(result.current.status).toBe('conflict');
    expect(result.current.conflictRevision).toBe(9);
    act(() => result.current.change('y'));
    await tick(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(true);
  });

  it('keeps edits on network error and retries with backoff', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new HttpError(503, null))
      .mockResolvedValue({ revision: 2 });
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    expect(result.current.status).toBe('error');
    expect(result.current.dirty).toBe(true);
    await tick(2000); // 1st retry after 2s
    expect(save).toHaveBeenCalledTimes(2);
    await tick(3999);
    expect(save).toHaveBeenCalledTimes(2); // 2nd retry after 4s
    await tick(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith('x', 1, expect.anything());
    expect(result.current.status).toBe('saved');
    expect(result.current.dirty).toBe(false);
  });

  it('flush saves immediately', async () => {
    const save = vi.fn(async () => ({ revision: 2 }));
    const { result } = renderHook(() => useAutosave(save, 1500, 1));
    act(() => result.current.change('now'));
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledWith('now', 1, expect.anything());
    expect(result.current.status).toBe('saved');
  });

  it('warns before unload only while there are unsaved changes, and flushes on unmount', async () => {
    const save = vi.fn(async () => ({ revision: 2 }));
    const { result, unmount } = renderHook(() => useAutosave(save, 1500, 1));
    const ev = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(ev()).toBe(false);
    act(() => result.current.change('x'));
    expect(ev()).toBe(true);
    unmount();
    expect(save).toHaveBeenCalledWith('x', 1, expect.anything());
  });

  it('reset adopts a new revision and clears conflict', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new HttpError(409, { current: { revision: 7 } }))
      .mockResolvedValue({ revision: 8 });
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    act(() => result.current.reset(7));
    expect(result.current.status).toBe('idle');
    expect(result.current.dirty).toBe(false);
    act(() => result.current.change('y')); await tick(100);
    expect(save).toHaveBeenLastCalledWith('y', 7, expect.anything());
  });
});

describe('useAutosave: permanent errors, explicit saves, keepalive', () => {
  it('4xx (other than 408/429) is terminal: no automatic retry, edits kept, manual retry works', async () => {
    const save = vi.fn().mockRejectedValueOnce(new HttpError(400, { error: 'invalid' })).mockResolvedValue({ revision: 2 });
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    expect(result.current.status).toBe('error');
    expect(result.current.errorKind).toBe('rejected');
    await tick(120_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(true);
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it.each([408, 429, 500])('%i is retried with backoff', async (code) => {
    const save = vi.fn().mockRejectedValueOnce(new HttpError(code, null)).mockResolvedValue({ revision: 2 });
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    expect(result.current.errorKind).toBe('retrying');
    await tick(2000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('debounced saves are autosaves; flush({explicit:true}) marks a checkpoint and saves even when clean', async () => {
    const save = vi.fn(async () => ({ revision: 2 }));
    const { result } = renderHook(() => useAutosave(save, 100, 1));
    act(() => result.current.change('x')); await tick(100);
    expect(save).toHaveBeenLastCalledWith('x', 1, { explicit: false, keepalive: false });
    await act(async () => { await result.current.flush({ explicit: true }); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('x', 2, { explicit: true, keepalive: false });
  });

  it('the beforeunload flush uses keepalive', async () => {
    const save = vi.fn(async () => ({ revision: 2 }));
    const { result } = renderHook(() => useAutosave(save, 1500, 1));
    act(() => result.current.change('x'));
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(save).toHaveBeenCalledWith('x', 1, { explicit: false, keepalive: true });
  });
});
