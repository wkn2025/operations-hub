import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import type { PmNode } from '@ops/shared';
import { SEED_ARTICLES } from '../../../../server/src/seed/content/articles';
import { editorExtensions } from './extensions';

/** Seed placeholders (seedRef/seedFile) become real attrs at seed time; mimic that here. */
const resolve = (n: PmNode): PmNode => {
  let attrs = n.attrs;
  if (attrs && 'seedRef' in attrs) { const { seedRef, ...rest } = attrs; attrs = { ...rest, articleId: `id-${seedRef}` }; }
  if (attrs && 'seedFile' in attrs) { const { seedFile, ...rest } = attrs; attrs = { ...rest, src: `/api/files/${seedFile}` }; }
  return { ...n, ...(attrs ? { attrs } : {}), ...(n.content ? { content: n.content.map(resolve) } : {}) };
};

describe('seeded DEMO content', () => {
  it('every seed article parses and validates against the editor schema', () => {
    const schema = getSchema(editorExtensions());
    for (const a of SEED_ARTICLES) {
      expect(() => Node.fromJSON(schema, { type: 'doc', content: a.content.map(resolve) }).check(), a.title).not.toThrow();
    }
  });
});
