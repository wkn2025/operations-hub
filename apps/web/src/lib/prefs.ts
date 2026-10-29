import { useCallback, useState } from 'react';

/** UI preferences only (sidebar state, recent searches). Never knowledge data. Storage failures fall back to memory. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}

export function writePref<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

export function usePref<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => readPref(key, fallback));
  const set = useCallback((next: T | ((p: T) => T)) => {
    setV((prev) => {
      const val = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writePref(key, val);
      return val;
    });
  }, [key]);
  return [v, set];
}
