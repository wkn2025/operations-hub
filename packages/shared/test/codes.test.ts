import { describe, expect, it } from 'vitest';
import { splitCodes } from '../src';

describe('splitCodes', () => {
  it('splits on spaces, commas and all dash kinds, drops dots, upper-cases and dedupes in typed order', () => {
    expect(splitCodes('s33.0xxa, 99214 - A4565 – z01.02—s330XXA')).toEqual(['S330XXA', '99214', 'A4565', 'Z0102']);
  });
});
