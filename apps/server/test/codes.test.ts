import { describe, it, expect, beforeAll } from 'vitest';
import { setup, type Ctx } from './helpers';
import { splitCodes } from '../src/services/codes';

describe('splitCodes', () => {
  it('accepts the five separators: space, comma, comma+space, dash, dash with spaces', () => {
    const want = ['S3301', '99214', 'A4565'];
    for (const q of ['S33.01 99214 A4565', 'S33.01,99214,A4565', 'S33.01, 99214, A4565', 'S33.01-99214-A4565', 'S33.01 - 99214 - A4565'])
      expect(splitCodes(q), q).toEqual(want);
  });
  it('mixed separators, case, dots, repeats and blanks', () => {
    expect(splitCodes('  s33.01 ,, s3301\n99214 -  - a4565  ')).toEqual(['S3301', '99214', 'A4565']);
    expect(splitCodes('')).toEqual([]);
  });
});

describe('GET /api/codes', () => {
  let c: Ctx;
  beforeAll(async () => { c = await setup(); });
  const look = (q: string) => c.req(c.viewer, 'GET', `/api/codes?q=${encodeURIComponent(q)}`);

  it('anonymous users read nothing', async () => {
    expect((await c.req(undefined, 'GET', '/api/codes?q=99214')).status).toBe(401);
  });

  it('finds ICD-10-CM with or without the dot, CPT and HCPCS, in the order typed', async () => {
    const r = await look('s33.0xxa, 99214 - A4565 S330XXA');
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: any) => x.query)).toEqual(['S330XXA', '99214', 'A4565']);
    const [icd, cpt, hcpcs] = r.body.results.map((x: any) => x.matches);
    expect(icd).toEqual([{ system: 'ICD-10-CM', code: 'S33.0XXA', billable: true, description: expect.stringMatching(/lumbar intervertebral disc, initial encounter/i) }]);
    expect(cpt).toEqual([{ system: 'CPT', code: '99214', billable: true, description: 'Office visit' }]);
    expect(hcpcs).toEqual([{ system: 'HCPCS', code: 'A4565', billable: true, description: 'Arm sling' }]);
  });

  it('billable ICD codes are flagged; category headers are not', async () => {
    const [head, leaf] = (await look('S33 A000')).body.results;
    expect(head.matches[0]).toMatchObject({ code: 'S33', billable: false });
    expect(leaf.matches[0]).toMatchObject({ code: 'A00.0', billable: true, description: expect.stringMatching(/cholera/i) });
  });

  it('unknown codes come back with no matches; too many codes is a 400', async () => {
    expect((await look('ZZZ99 <b>')).body.results).toEqual([{ query: 'ZZZ99', matches: [] }, { query: '<B>', matches: [] }]);
    expect((await look(Array.from({ length: 101 }, (_, i) => `A${i}`).join(' '))).status).toBe(400);
  });
});
