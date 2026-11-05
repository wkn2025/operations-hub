import type { SeedFlow, SeedFlowNode } from './flows'; // type-only: no import cycle with flows.ts

/**
 * Global Code Finder: one binary (Yes/No) question per screen, one Global Code per invoice.
 * Tree = docs/superpowers/specs/2026-11-05-global-code-finder-design.md. Only A01, B01, B00 and C12 have known numbers;
 * every other code is "code TBC" until the master list is supplied. Never invent a number.
 */
const q = (id: string, text: string, yesTo: string, noTo: string, detail?: string): SeedFlowNode => ({
  id, kind: 'question', text, ...(detail ? { detail } : {}),
  options: [{ label: 'Yes', to: yesTo }, { label: 'No', to: noTo }],
});
type Sev = 'success' | 'warning' | 'info';
const r = (id: string, text: string, detail: string, severity: Sev = 'success'): SeedFlowNode => ({ id, kind: 'result', severity, text, detail });
/** Result for a code whose number is not yet known. */
const tbc = (id: string, name: string, severity: Sev = 'success'): SeedFlowNode => r(id, `${name} · code TBC`, `Global Code: ${name}.`, severity);

const THIS_SERVICE = 'Answer the next questions for that service only.';

export const GLOBAL_CODE_FLOW: SeedFlow = {
  title: 'Global Code Finder (DEMO)',
  articleSlug: 'global-codes-for-invoice-processing',
  startId: 'multi',
  nodes: [
    // Entry / several services
    q('multi', 'Does this invoice include more than one kind of service?', 'main', 'svc', 'DEMO flow. This finder picks one Global Code for one invoice. It classifies the invoice only; it does not decide coverage or medical necessity.'),
    q('main', 'Is one of them the main reason for the invoice?', 'svc', 'top', THIS_SERVICE),
    q('top', 'Is one of them clearly the most expensive?', 'svc', 'r-free', THIS_SERVICE),
    r('r-free', 'Free Choice: pick any of the tied codes', 'No main service and no clear highest value. The highest-value service wins; on an exact tie any of the tied codes may be chosen. Never pick one silently.', 'info'),

    // Service or item
    q('svc', 'Is this a medical service for the patient?', 'fac', 'adm'),
    q('adm', 'Is it only a fee or tax, with no care or items?', 'r-admin', 'trans'),
    q('trans', 'Is it for transport?', 'air', 'equip'),
    q('air', 'Is it by air?', 'r-air', 'taxi'),
    q('taxi', 'Is it a taxi?', 'r-taxi', 'r-ambulance'),
    q('equip', 'Is it equipment or supplies?', 'chair', 'r-review'),
    q('chair', 'Is it a wheelchair or crutches?', 'chair2', 'r-materials'),
    q('chair2', 'Is it a wheelchair?', 'r-wheelchair', 'r-crutches'),

    // Facility bill
    q('fac', "Is this a hospital or facility bill, not a doctor's own fee?", 'er', 'sep'),
    q('er', 'Is it for the hospital emergency room (observation without admission counts)?', 'r-er', 'surg'),
    q('surg', 'Does this bill include a surgery or a delivery?', 'r-forfait', 'admit'),
    q('admit', 'Was the patient admitted (room, ICU)?', 'r-inpatient', 'r-review'),

    // Separate professional fee
    q('sep', 'Is it a separate fee from a doctor, nurse or anesthesiologist, billed apart from a facility bill?', 'anes', 'cons'),
    q('anes', 'Is it from the anesthesiologist?', 'r-anes', 'nurse'),
    q('nurse', 'Is it for nursing services?', 'r-medfees', 'read'),
    q('read', 'Is it only a radiologist or pathologist reading an image or sample?', 'readkind', 'inpt'),
    q('readkind', 'Is it reading an image or scan?', 'img', 'bxread'),
    q('bxread', 'Is the sample described as a biopsy?', 'r-biopsy', 'r-analysis'),
    q('inpt', 'Did the doctor treat or operate while the patient was admitted?', 'r-b00', 'r-outpt'),

    // Consultation
    q('cons', 'Is the main purpose to see a doctor?', 'dent', 'test'),
    q('dent', 'Is it with a dentist?', 'r-dentist', 'tele'),
    q('tele', 'Was it by video or phone?', 'r-tele', 'home'),
    q('home', 'Was it a house call?', 'r-home', 'spec'),
    q('spec', 'Is the doctor a specialist (eye, heart, skin, psychiatry, dietitian…)?', 'r-spec', 'r-a01'),

    // Test or scan
    q('test', 'Is the main purpose a test or scan?', 'imgq', 'med'),
    q('imgq', 'Is it an imaging scan?', 'img', 'scope'),
    q('img', 'Is it an ultrasound?', 'r-us', 'mag'),
    q('mag', 'Is it a scanner with magnets or a ring (MRI, CT, PET)?', 'mri', 'bb'),
    q('mri', 'Is it an MRI?', 'r-mri', 'ct'),
    q('ct', 'Is it a CT?', 'r-ct', 'r-pet'),
    q('bb', 'Is it a breast or bone scan?', 'mam', 'xr'),
    q('mam', 'Is it a mammogram?', 'r-mam', 'r-bone'),
    q('xr', 'Is it a plain X-ray?', 'r-xray', 'r-review'),
    q('scope', 'Is it a scope (a camera inside the body)?', 'gastro', 'org'),
    q('gastro', 'Is it a gastroscopy (stomach)?', 'r-gastro', 'cysto'),
    q('cysto', 'Is it a cystoscopy (bladder)?', 'r-analysis-cysto', 'r-scopies'),
    q('org', 'Is it a heart, brain, lung, sleep or hearing test?', 'heart', 'bx'),
    q('heart', 'Is it a heart test?', 'holter', 'brain'),
    q('holter', 'Is it a Holter (wearable 24 h monitor)?', 'r-holter', 'ecg'),
    q('ecg', 'Is it an electrocardiogram tracing?', 'r-ecg', 'r-cardtest'),
    q('brain', 'Is it an EEG (brain)?', 'r-eeg', 'lung'),
    q('lung', 'Is it a sleep study?', 'r-sleep', 'lung2'),
    q('lung2', 'Is it a lung function test?', 'r-spiro', 'aud'),
    q('aud', 'Is it a hearing test?', 'r-audio', 'r-review'),
    q('bx', 'Is it a biopsy (tissue sample)?', 'r-biopsy', 'lab'),
    q('lab', 'Is it a lab analysis of a sample (blood, urine, Pap smear…)?', 'r-analysis', 'r-review'),

    // Medicine or treatment
    q('med', 'Is the main purpose to give or buy a medicine (pharmacy, injection, infusion, vaccine)?', 'vac', 'wound'),
    q('vac', 'Is it a vaccination?', 'r-vac', 'chemo'),
    q('chemo', 'Is it chemotherapy?', 'r-chemo', 'r-medicines'),
    q('wound', 'Is it a wound dressing, stitches, stitch removal or abscess drainage?', 'r-wound', 'talk'),
    q('talk', 'Is it physio, psychotherapy, occupational or speech therapy?', 'pp', 'other'),
    q('pp', 'Is it physiotherapy or psychotherapy?', 'physio', 'occ'),
    q('physio', 'Is it physiotherapy?', 'r-physio', 'r-psycho'),
    q('occ', 'Is it occupational therapy?', 'r-ot', 'r-speech'),
    q('other', 'Is it radiotherapy or dialysis?', 'radio', 'acu'),
    q('radio', 'Is it radiotherapy?', 'r-radio', 'r-dialysis'),
    q('acu', 'Is it acupuncture or chiropractic?', 'acu2', 'r-review'),
    q('acu2', 'Is it acupuncture?', 'r-acu', 'r-chiro'),

    // Results (Task 2 writes the full reason + rule for each detail)
    r('r-a01', 'A01 · Consultation', 'Global Code: Consultation.'),
    r('r-er', 'B01 · ER', 'Global Code: ER.'),
    r('r-b00', 'B00 · Inpatient Physician Fees', 'Global Code: Inpatient Physician Fees.'),
    r('r-inpatient', 'C12 · Inpatient Treatment', 'Global Code: Inpatient Treatment (Hospitalization).'),
    tbc('r-forfait', 'Forfait'),
    tbc('r-outpt', 'Outpatient Physician Fees'),
    tbc('r-anes', 'Anesthesiologist'),
    tbc('r-medfees', 'Med Fees'),
    tbc('r-dentist', 'Dentist'),
    tbc('r-tele', 'Telemedicine'),
    tbc('r-home', 'Homevisit'),
    tbc('r-spec', 'Specialist Consultation'),
    r('r-us', 'Ultrasonography · code TBC', 'Provisional: Ultrasonography. The alternative is Ecography; the rule to choose between them is not yet defined. Confirm with your team lead.', 'warning'),
    tbc('r-mri', 'MRI'),
    tbc('r-ct', 'CT Scan'),
    tbc('r-pet', 'PET Scan'),
    tbc('r-mam', 'Mammography'),
    tbc('r-bone', 'Bone Densitometry'),
    tbc('r-xray', 'X-ray'),
    tbc('r-gastro', 'Gastroscopy'),
    tbc('r-analysis-cysto', 'Analysis'),
    tbc('r-scopies', 'Scopies'),
    tbc('r-analysis', 'Analysis'),
    tbc('r-biopsy', 'Biopsy'),
    tbc('r-holter', 'Holter'),
    r('r-ecg', 'ECG · code TBC', 'Provisional: ECG. The alternative is EKG; the rule to choose between them is not yet defined. Confirm with your team lead.', 'warning'),
    tbc('r-cardtest', 'Cardiological Test'),
    tbc('r-eeg', 'EEG'),
    tbc('r-sleep', 'Sleep Study'),
    r('r-spiro', 'Spirometry / Pulmonary Function Test · code TBC', 'Provisional: one entry for both names. The master list may hold two codes; the rule is not yet defined. Use whichever matches the invoice wording and confirm with your team lead.', 'warning'),
    tbc('r-audio', 'Audiometry'),
    tbc('r-vac', 'Vaccination'),
    tbc('r-chemo', 'Chemotherapy'),
    tbc('r-medicines', 'Medicines'),
    tbc('r-wound', 'Wound Dressing'),
    tbc('r-physio', 'Physiotherapy'),
    tbc('r-psycho', 'Psychotherapy'),
    tbc('r-ot', 'Occupational Therapy'),
    tbc('r-speech', 'Speech Therapy'),
    tbc('r-radio', 'Radiotherapy'),
    tbc('r-dialysis', 'Dialysis'),
    tbc('r-acu', 'Acupuncture'),
    tbc('r-chiro', 'Chiropractic'),
    tbc('r-admin', 'Administrative Fees'),
    tbc('r-air', 'Air Ambulance'),
    tbc('r-taxi', 'Taxi'),
    tbc('r-ambulance', 'Ambulance'),
    tbc('r-wheelchair', 'Wheelchair'),
    tbc('r-crutches', 'Crutches'),
    tbc('r-materials', 'Materials'),
    r('r-review', 'Needs manual review', 'No matching code, and there is no generic fallback. Send it to your team lead.', 'warning'),
  ],
};
