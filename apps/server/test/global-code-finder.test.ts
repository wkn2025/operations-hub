import { describe, expect, it } from 'vitest';
import { start, step, validateFlow, type Flow } from '@ops/shared';
import { GLOBAL_CODE_FLOW } from '../src/seed/content/global-code-finder';

// Nodes carry no article references, so SeedFlow is structurally a Flow.
const flow = GLOBAL_CODE_FLOW as unknown as Flow;
const byId = new Map(flow.nodes.map((n) => [n.id, n]));

/** Y = first option (Yes), N = second (No). Returns the final node id. */
function walk(answers: string): string {
  let s = start(flow);
  for (const a of answers) {
    s = step(flow, s, a === 'Y' ? 0 : 1);
    expect(s.error, `${answers} @ ${a}`).toBeUndefined();
  }
  return s.nodeId;
}

describe('Global Code Finder flow structure', () => {
  it('has the agreed title/link and passes validateFlow', () => {
    expect(GLOBAL_CODE_FLOW.title).toBe('Global Code Finder (DEMO)');
    expect(GLOBAL_CODE_FLOW.articleSlug).toBe('global-codes-for-invoice-processing');
    expect(GLOBAL_CODE_FLOW.startId).toBe('multi');
    const v = validateFlow(flow);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('every question is binary Yes/No, ids are unique, only r- nodes are results', () => {
    expect(new Set(flow.nodes.map((n) => n.id)).size).toBe(flow.nodes.length);
    for (const n of flow.nodes) {
      if (n.id.startsWith('r-')) {
        expect(n.kind, n.id).toBe('result');
        expect(n.text.trim().length, n.id).toBeGreaterThan(0);
      } else {
        expect(n.kind, n.id).toBe('question');
        expect(n.options?.map((o) => o.label), n.id).toEqual(['Yes', 'No']);
      }
    }
  });

  it('every node is reachable from multi', () => {
    const seen = new Set<string>(['multi']);
    const todo = ['multi'];
    while (todo.length) for (const o of byId.get(todo.pop()!)?.options ?? []) if (!seen.has(o.to)) { seen.add(o.to); todo.push(o.to); }
    expect(flow.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id)).toEqual([]);
  });
});

// [scenario (reference section 5 row, then remaining leaves), answers (Y/N), expected result id]
const scenarios: [string, string, string][] = [
  ['ER facility + CT + medications + sutures', 'NYYY', 'r-er'],
  ['ER observation, no admission', 'NYYY', 'r-er'],
  ['ER facility bill (first of two invoices)', 'NYYY', 'r-er'],
  ['separate inpatient hospital bill after ER', 'NYYNNY', 'r-inpatient'],
  ['separate ER physician professional bill', 'NYNYNNNN', 'r-outpt'],
  ['inpatient room, ICU, tests; no surgery', 'NYYNNY', 'r-inpatient'],
  ['hospital invoice with surgery and 3 inpatient days', 'NYYNY', 'r-forfait'],
  ['facility bill for minor outpatient surgery', 'NYYNY', 'r-forfait'],
  ['facility bill for vaginal delivery or C-section', 'NYYNY', 'r-forfait'],
  ['separately billed inpatient surgeon fee', 'NYNYNNNY', 'r-b00'],
  ['separately billed outpatient surgeon fee', 'NYNYNNNN', 'r-outpt'],
  ['separately billed anesthesiologist fee', 'NYNYY', 'r-anes'],
  ['ophthalmologist consult with routine eye exam', 'NYNNYNNNY', 'r-spec'],
  ['cataract surgery facility bill', 'NYYNY', 'r-forfait'],
  ['dentist outpatient procedure', 'NYNNYY', 'r-dentist'],
  ['dental emergency hospital ER facility bill', 'NYYY', 'r-er'],
  ['general urgent care / walk-in evaluation', 'NYNNYNNNN', 'r-a01'],
  ['US routine check-up', 'NYNNYNNNN', 'r-a01'],
  ['doctor visit + lab + ointment, mainly consultation', 'NYNNYNNNN', 'r-a01'],
  ['same, with a specialist', 'NYNNYNNNY', 'r-spec'],
  ['clinic visit solely for expensive medication injection', 'NYNNNNYNN', 'r-medicines'],
  ['chemotherapy infusion', 'NYNNNNYNY', 'r-chemo'],
  ['vaccination visit', 'NYNNNNYY', 'r-vac'],
  ['independent lab test with specimen collection fee', 'NYNNNYNNNNY', 'r-analysis'],
  ['lab analysis of surgical specimen, not biopsy', 'NYNYNNYNN', 'r-analysis'],
  ['separate pathology interpretation of biopsy', 'NYNYNNYNY', 'r-biopsy'],
  ['standalone biopsy', 'NYNNNYNNNY', 'r-biopsy'],
  ['colonoscopy with biopsy', 'NYNNNYNYNN', 'r-scopies'],
  ['gastroscopy with biopsy', 'NYNNNYNYY', 'r-gastro'],
  ['cystoscopy (Analysis, flagged)', 'NYNNNYNYNY', 'r-analysis-cysto'],
  ['MRI read billed by radiologist, no scan charge', 'NYNYNNYYNYY', 'r-mri'],
  ['MRI $1,500 + CT $800, neither principal (most expensive: MRI)', 'YNYYNNNYYNYY', 'r-mri'],
  ['CT $900 + Analysis $150, neither principal (most expensive: CT)', 'YNYYNNNYYNYNY', 'r-ct'],
  ['consultation $200 + MRI $1,500, consultation is primary', 'YYYNNYNNNN', 'r-a01'],
  ['wheelchair $600 + crutches $100 (most expensive: wheelchair)', 'YNYNNNYYY', 'r-wheelchair'],
  ['wheelchair $100 = crutches $100, no principal', 'YNN', 'r-free'],
  ['standalone dressing or sutures outside ER', 'NYNNNNNY', 'r-wound'],
  ['home physician visit', 'NYNNYNNY', 'r-home'],
  ['video follow-up visit', 'NYNNYNY', 'r-tele'],
  ['psychiatry specialist consultation', 'NYNNYNNNY', 'r-spec'],
  ['psychologist therapy session', 'NYNNNNNNYYN', 'r-psycho'],
  ['psychiatric inpatient facility accommodation', 'NYYNNY', 'r-inpatient'],
  ['nursing service bill', 'NYNYNY', 'r-medfees'],
  ['separately billed medical certificate', 'NYNNYNNNN', 'r-a01'],
  ['fee solely to obtain a medical report', 'NNY', 'r-admin'],
  ['separate US surcharge or Brazil tax', 'NNY', 'r-admin'],
  ['unknown service without matching code', 'NNNNN', 'r-review'],
  // beyond section 5: remaining leaves
  ['air ambulance', 'NNNYY', 'r-air'],
  ['taxi', 'NNNYNY', 'r-taxi'],
  ['ground ambulance', 'NNNYNN', 'r-ambulance'],
  ['crutches', 'NNNNYYN', 'r-crutches'],
  ['materials (eyeglasses)', 'NNNNYN', 'r-materials'],
  ['facility bill, neither ER, surgery nor admission', 'NYYNNN', 'r-review'],
  ['ultrasound (provisional)', 'NYNNNYYY', 'r-us'],
  ['CT scan', 'NYNNNYYNYNY', 'r-ct'],
  ['PET scan', 'NYNNNYYNYNN', 'r-pet'],
  ['mammogram', 'NYNNNYYNNYY', 'r-mam'],
  ['bone densitometry', 'NYNNNYYNNYN', 'r-bone'],
  ['plain X-ray', 'NYNNNYYNNNY', 'r-xray'],
  ['Holter', 'NYNNNYNNYYY', 'r-holter'],
  ['ECG (provisional)', 'NYNNNYNNYYNY', 'r-ecg'],
  ['other cardiology test', 'NYNNNYNNYYNN', 'r-cardtest'],
  ['EEG', 'NYNNNYNNYNY', 'r-eeg'],
  ['sleep study', 'NYNNNYNNYNNY', 'r-sleep'],
  ['lung function (provisional)', 'NYNNNYNNYNNNY', 'r-spiro'],
  ['hearing test', 'NYNNNYNNYNNNNY', 'r-audio'],
  ['EMG goes to manual review', 'NYNNNYNNNNN', 'r-review'],
  ['physiotherapy', 'NYNNNNNNYYY', 'r-physio'],
  ['occupational therapy', 'NYNNNNNNYNY', 'r-ot'],
  ['speech therapy', 'NYNNNNNNYNN', 'r-speech'],
  ['radiotherapy', 'NYNNNNNNNYY', 'r-radio'],
  ['dialysis', 'NYNNNNNNNYN', 'r-dialysis'],
  ['acupuncture', 'NYNNNNNNNNYY', 'r-acu'],
  ['chiropractic', 'NYNNNNNNNNYN', 'r-chiro'],
  ['blood transfusion / oxygen therapy: manual review', 'NYNNNNNNNNN', 'r-review'],
];

describe('Global Code Finder scenarios', () => {
  it.each(scenarios)('%s', (_name, answers, expected) => {
    expect(walk(answers)).toBe(expected);
  });
});
