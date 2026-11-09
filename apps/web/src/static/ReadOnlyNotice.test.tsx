import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyNotice } from './ReadOnlyNotice';
import { READ_ONLY_EVENT } from './demo';

afterEach(() => vi.useRealTimers());

describe('ReadOnlyNotice', () => {
  it('says a refused change is not saved, then goes away', () => {
    vi.useFakeTimers();
    render(<ReadOnlyNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    act(() => { window.dispatchEvent(new Event(READ_ONLY_EVENT)); });
    expect(screen.getByRole('status')).toHaveTextContent('Read-only demo: only guided flows can be changed here.');
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
