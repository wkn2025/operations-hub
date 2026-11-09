import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { splitCodes } from '@ops/shared';

/** Diagnosis & service code lookup. Data ships in apps/server/reference (sources in its README); read once, kept in memory. */
export type CodeSystem = 'ICD-10-CM' | 'CPT' | 'HCPCS';
export interface CodeMatch { system: CodeSystem; code: string; billable: boolean; description: string }

export const MAX_CODES = 100;

export { splitCodes };

let index: Map<string, CodeMatch[]> | undefined;
function load() {
  const m = new Map<string, CodeMatch[]>();
  const add = (key: string, x: CodeMatch) => m.set(key, [...(m.get(key) ?? []), x]);
  const file = (name: string) => readFileSync(new URL(`../../reference/${name}`, import.meta.url));
  // ICD-10-CM order file: code \t 1 billable / 0 header \t long description; shown with the dot after the category
  for (const line of gunzipSync(file('icd10cm-2027.tsv.gz')).toString('utf8').split(/\r?\n/)) {
    const [code, flag, description] = line.split('\t');
    if (code && description) add(code, { system: 'ICD-10-CM', code: code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code, billable: flag === '1', description });
  }
  // CPT / HCPCS: code \t system \t plain description
  for (const line of file('cpt-hcpcs.tsv').toString('utf8').split(/\r?\n/)) { // checkouts may turn LF into CRLF
    const [code, system, description] = line.split('\t');
    if (code && description) add(code, { system: system as CodeSystem, code, billable: true, description });
  }
  return m;
}

export const lookupCodes = (q: string) => {
  index ??= load();
  return splitCodes(q).map((query) => ({ query, matches: index!.get(query) ?? [] }));
};
