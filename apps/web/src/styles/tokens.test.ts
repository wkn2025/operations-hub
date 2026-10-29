import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// WCAG AA (4.5:1) for small muted text on the lightest surfaces it sits on.
const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const hex = (name: string): string => {
  const v = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
  if (!v) throw new Error(`token ${name} missing`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref ? hex(ref[1]) : v;
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('tokens contrast', () => {
  it('muted text is at least 4.5:1 on white, neutral-50 and neutral-100', () => {
    for (const bg of ['neutral-50', 'neutral-100']) expect(ratio('color-text-muted', bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('color-text-muted', 'color-background')).toBeGreaterThanOrEqual(4.5);
  });
});
