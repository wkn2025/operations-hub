import { describe, expect, it } from 'vitest';
import { FLOW_LIMITS, start, step, validateFlow, type Flow } from '@ops/shared';
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

  it('asks "dental?" right after svc Yes; the consultation-only dentist question is gone (user ruling 2026-11-05)', () => {
    const to = (id: string) => byId.get(id)!.options!.map((o) => o.to);
    expect(to('svc')).toEqual(['dental', 'adm']);
    expect(byId.get('dental')!.text).toBe('Is it dental (dentist, dental emergency, prosthesis, orthodontics)?');
    expect(to('dental')).toEqual(['r-dentist', 'fac']);
    expect(to('cons')).toEqual(['tele', 'test']);
    expect(byId.has('dent')).toBe(false);
  });
});

// [scenario (reference section 5 row, then remaining leaves), answers (Y/N), expected result id]
const scenarios: [string, string, string][] = [
  ['ER facility + CT + medications + sutures', 'NYNYY', 'r-er'],
  ['ER facility + CT + medications + sutures, read as a bundle with a main purpose', 'YYYNYY', 'r-er'],
  ['ER observation, no admission', 'NYNYY', 'r-er'],
  ['ER facility bill (first of two invoices)', 'NYNYY', 'r-er'],
  ['separate inpatient hospital bill after ER', 'NYNYNNY', 'r-inpatient'],
  ['separate ER physician professional bill (A00)', 'NYNNYNNNN', 'r-outpt'],
  ['inpatient room, ICU, tests; no surgery', 'NYNYNNY', 'r-inpatient'],
  ['hospital invoice with surgery and 3 inpatient days', 'NYNYNY', 'r-forfait'],
  ['surgery + inpatient days, read as a bundle with a main purpose', 'YYYNYNY', 'r-forfait'],
  ['facility bill for minor outpatient surgery', 'NYNYNY', 'r-forfait'],
  ['facility bill for vaginal delivery or C-section', 'NYNYNY', 'r-forfait'],
  ['separately billed inpatient surgeon fee', 'NYNNYNNNY', 'r-b00'],
  ['separately billed outpatient surgeon fee (A00)', 'NYNNYNNNN', 'r-outpt'],
  ['separately billed anesthesiologist fee', 'NYNNYY', 'r-anes'],
  ['ophthalmologist consult with routine eye exam', 'NYNNNYNNY', 'r-spec'],
  ['cataract surgery facility bill', 'NYNYNY', 'r-forfait'],
  ['dentist outpatient procedure', 'NYY', 'r-dentist'],
  ['dental emergency hospital ER facility bill (M00, user ruling)', 'NYY', 'r-dentist'],
  ['dental prosthesis', 'NYY', 'r-dentist'],
  ['orthodontics', 'NYY', 'r-dentist'],
  ['general urgent care / walk-in evaluation', 'NYNNNYNNN', 'r-a01'],
  ['US routine check-up', 'NYNNNYNNN', 'r-a01'],
  ['doctor visit + lab + ointment, mainly consultation', 'NYNNNYNNN', 'r-a01'],
  ['doctor visit + lab + ointment, read as a bundle with a main purpose', 'YYYNNNYNNN', 'r-a01'],
  ['same, with a specialist', 'NYNNNYNNY', 'r-spec'],
  ['clinic visit solely for expensive medication injection', 'NYNNNNNYNN', 'r-medicines'],
  ['chemotherapy infusion', 'NYNNNNNYNY', 'r-chemo'],
  ['vaccination visit', 'NYNNNNNYY', 'r-vac'],
  ['independent lab test with specimen collection fee', 'NYNNNNYNNNNY', 'r-analysis'],
  ['colposcopy (Analysis)', 'NYNNNNYNNNNY', 'r-analysis'],
  ['urodynamic test (Analysis)', 'NYNNNNYNNNNY', 'r-analysis'],
  ['lab analysis of surgical specimen, not biopsy', 'NYNNYNNYNN', 'r-analysis'],
  ['separate pathology interpretation of biopsy', 'NYNNYNNYNY', 'r-biopsy'],
  ['standalone biopsy', 'NYNNNNYNNNY', 'r-biopsy'],
  ['colonoscopy with biopsy', 'NYNNNNYNYNN', 'r-scopies'],
  ['gastroscopy with biopsy', 'NYNNNNYNYY', 'r-gastro'],
  ['cystoscopy (Analysis, flagged)', 'NYNNNNYNYNY', 'r-analysis-cysto'],
  ['MRI read billed by radiologist, no scan charge', 'NYNNYNNYYNYY', 'r-mri'],
  ['MRI $1,500 + CT $800, neither principal (most expensive: MRI)', 'YNYYNNNNYYNYY', 'r-mri'],
  ['CT $900 + Analysis $150, neither principal (most expensive: CT)', 'YNYYNNNNYYNYNY', 'r-ct'],
  ['consultation $200 + MRI $1,500, consultation is primary', 'YYYNNNYNNN', 'r-a01'],
  ['wheelchair $600 + crutches $100 (most expensive: wheelchair)', 'YNYNNNYYY', 'r-wheelchair'],
  ['wheelchair $100 = crutches $100, no principal', 'YNN', 'r-free'],
  ['standalone dressing or sutures outside ER', 'NYNNNNNNY', 'r-wound'],
  ['home physician visit', 'NYNNNYNY', 'r-home'],
  ['video follow-up visit', 'NYNNNYY', 'r-tele'],
  ['psychiatry specialist consultation', 'NYNNNYNNY', 'r-spec'],
  ['psychologist therapy session', 'NYNNNNNNNYYN', 'r-psycho'],
  ['psychiatric inpatient facility accommodation', 'NYNYNNY', 'r-inpatient'],
  ['nursing service bill', 'NYNNYNY', 'r-medfees'],
  ['separately billed medical certificate', 'NYNNNYNNN', 'r-a01'],
  ['fee solely to obtain a medical report', 'NNY', 'r-admin'],
  ['separate US surcharge or Brazil tax', 'NNY', 'r-admin'],
  ['unknown service without matching code', 'NNNNN', 'r-review'],
  // beyond section 5: remaining leaves
  ['air ambulance', 'NNNYY', 'r-air'],
  ['taxi', 'NNNYNY', 'r-taxi'],
  ['ground ambulance', 'NNNYNN', 'r-ambulance'],
  ['crutches', 'NNNNYYN', 'r-crutches'],
  ['materials (eyeglasses)', 'NNNNYN', 'r-materials'],
  ['facility bill, neither ER, surgery nor admission', 'NYNYNNN', 'r-review'],
  ['ultrasound (provisional)', 'NYNNNNYYY', 'r-us'],
  ['CT scan', 'NYNNNNYYNYNY', 'r-ct'],
  ['PET scan', 'NYNNNNYYNYNN', 'r-pet'],
  ['mammogram', 'NYNNNNYYNNYY', 'r-mam'],
  ['bone densitometry', 'NYNNNNYYNNYN', 'r-bone'],
  ['plain X-ray', 'NYNNNNYYNNNY', 'r-xray'],
  ['Holter', 'NYNNNNYNNYYY', 'r-holter'],
  ['ECG (provisional)', 'NYNNNNYNNYYNY', 'r-ecg'],
  ['other cardiology test', 'NYNNNNYNNYYNN', 'r-cardtest'],
  ['EEG', 'NYNNNNYNNYNY', 'r-eeg'],
  ['sleep study', 'NYNNNNYNNYNNY', 'r-sleep'],
  ['lung function (provisional)', 'NYNNNNYNNYNNNY', 'r-spiro'],
  ['hearing test', 'NYNNNNYNNYNNNNY', 'r-audio'],
  ['EMG goes to manual review', 'NYNNNNYNNNNN', 'r-review'],
  ['physiotherapy', 'NYNNNNNNNYYY', 'r-physio'],
  ['occupational therapy', 'NYNNNNNNNYNY', 'r-ot'],
  ['speech therapy', 'NYNNNNNNNYNN', 'r-speech'],
  ['radiotherapy', 'NYNNNNNNNNYY', 'r-radio'],
  ['dialysis', 'NYNNNNNNNNYN', 'r-dialysis'],
  ['acupuncture', 'NYNNNNNNNNNYY', 'r-acu'],
  ['chiropractic', 'NYNNNNNNNNNYN', 'r-chiro'],
  ['blood transfusion / oxygen therapy: manual review', 'NYNNNNNNNNNN', 'r-review'],
];

describe('Global Code Finder scenarios', () => {
  it.each(scenarios)('%s', (_name, answers, expected) => {
    expect(walk(answers)).toBe(expected);
  });
});

const results = flow.nodes.filter((n) => n.kind === 'result');
const node = (id: string) => byId.get(id)!;
const det = (id: string) => node(id).detail ?? '';

describe('Global Code Finder wording', () => {
  it('every node text/detail is within FLOW_LIMITS', () => {
    for (const n of flow.nodes) {
      expect(n.text.length, n.id).toBeLessThanOrEqual(FLOW_LIMITS.text);
      expect((n.detail ?? '').length, n.id).toBeLessThanOrEqual(FLOW_LIMITS.detail);
    }
  });

  it('every result has a reason with one example', () => {
    for (const n of results) {
      expect(det(n.id).trim().length, n.id).toBeGreaterThan(0);
      expect(det(n.id), n.id).toMatch(/Example:/);
    }
  });

  it('only A00, A01, B00, B01, C12 and M00 appear as code numbers', () => {
    for (const n of flow.nodes)
      for (const m of `${n.text} ${n.detail ?? ''}`.match(/\b[A-Z]\d{2}\b/g) ?? [])
        expect(['A00', 'A01', 'B00', 'B01', 'C12', 'M00'], `${n.id}: ${m}`).toContain(m);
    expect(node('r-outpt').text.startsWith('A00 ·')).toBe(true);
    expect(node('r-outpt').text).toBe('A00 · Outpatient Physician Fees');
    expect(node('r-dentist').text.startsWith('M00 ·')).toBe(true);
    expect(node('r-dentist').text).toBe('M00 · Dentist');
    expect(node('r-a01').text.startsWith('A01 ·')).toBe(true);
    expect(node('r-er').text.startsWith('B01 ·')).toBe(true);
    expect(node('r-b00').text.startsWith('B00 ·')).toBe(true);
    expect(node('r-inpatient').text.startsWith('C12 ·')).toBe(true);
  });

  it('provisional rules are warnings that name their alternative', () => {
    expect(node('r-us').text.startsWith('Ultrasonography')).toBe(true);
    expect(det('r-us')).toMatch(/Ecography/);
    expect(node('r-ecg').text.startsWith('ECG')).toBe(true);
    expect(det('r-ecg')).toMatch(/EKG/);
    expect(node('r-spiro').text).toBe('Spirometry / Pulmonary Function Test · code TBC');
    for (const id of ['r-us', 'r-ecg', 'r-spiro']) {
      expect(node(id).severity, id).toBe('warning');
      expect(det(id), id).toMatch(/not yet defined/);
    }
  });

  it('severity: review warning, free choice info, all other codes success', () => {
    const special: Record<string, string> = { 'r-us': 'warning', 'r-ecg': 'warning', 'r-spiro': 'warning', 'r-review': 'warning', 'r-free': 'info' };
    for (const n of results) expect(n.severity, n.id).toBe(special[n.id] ?? 'success');
  });

  it('key results explain their rule', () => {
    expect(det('r-a01')).toMatch(/US routine check-up/);
    expect(det('r-a01')).toMatch(/medical certificate/);
    expect(det('r-analysis-cysto')).toMatch(/[Cc]ystoscopy is Analysis/);
    expect(det('r-analysis-cysto')).toMatch(/flagged for review/);
    expect(det('r-er')).toMatch(/surgery[^.]*stays ER/i);
    expect(det('r-er')).not.toMatch(/Forfait/);
    expect(det('r-er')).toMatch(/tests.*dressings|dressings.*tests/);
    expect(det('r-er')).toMatch(/stay ER/);
    expect(det('r-review')).toMatch(/no generic fallback/);
    expect(det('r-review')).toMatch(/team lead/);
    for (const w of ['EMG', 'blood transfusion', 'oxygen therapy']) expect(det('r-review')).toMatch(w);
  });

  it('A00 covers outpatient surgeon and separate ER doctor fees; M00 covers anything dental, even at the ER', () => {
    expect(det('r-outpt')).toMatch(/outpatient surgeon/);
    expect(det('r-outpt')).toMatch(/separate ER doctor/);
    expect(det('r-b00')).toMatch(/admitted/);
    expect(det('r-dentist')).toMatch(/[Aa]nything dental/);
    expect(det('r-dentist')).toMatch(/dental emergency at a hospital ER/);
    expect(det('r-dentist')).toMatch(/prosthes/);
    expect(det('r-dentist')).toMatch(/orthodontics/);
    expect(det('r-dentist').match(/Example:/g)).toHaveLength(1);
    expect(det('r-er')).not.toMatch(/dental/i);
  });

  it('details stay short and use reference wording', () => {
    const sentencesBeforeExample = (id: string) => det(id).split('Example:')[0].trim().split(/(?<=\.)\s+/).length;
    for (const id of ['r-er', 'r-a01']) expect(sentencesBeforeExample(id), id).toBeLessThanOrEqual(3);
    expect(det('r-cardtest')).not.toMatch(/stress/);
    expect(det('r-cardtest')).toMatch(/Example: a heart test that is not an ECG, EKG or Holter/);
    expect(det('r-medfees')).toMatch(/Example: nursing service bill/);
    expect(det('r-medfees')).not.toMatch(/home/);
    for (const id of ['r-bone', 'r-sleep']) {
      expect(det(id), id).toMatch(/confirm the exact name with your team lead/);
      expect(det(id), id).not.toMatch(/master-list/);
    }
  });

  it('question details guide bundled invoices and edge cases', () => {
    expect(det('multi').startsWith('DEMO flow.')).toBe(true);
    expect(det('multi')).toMatch(/does not decide coverage or medical necessity/);
    for (const id of ['multi', 'main']) {
      expect(det(id), id).toMatch(/ER visit/);
      expect(det(id), id).toMatch(/surgery/);
      expect(det(id), id).toMatch(/highest value/);
    }
    expect(det('multi')).toMatch(/one visit or stay/);
    expect(det('multi')).toMatch(/answer Yes here and Yes to "main reason"/);
    expect(det('main')).toMatch(/one visit or stay/);
    expect(det('svc')).toMatch(/transport/);
    expect(det('svc')).toMatch(/fee only/);
    for (const id of ['scope', 'lab']) {
      expect(det(id), id).toMatch(/[Cc]olposcopy/);
      expect(det(id), id).toMatch(/urodynamic/);
    }
    expect(det('scope')).toMatch(/Analysis/);
  });
});
