import type { SeedFlow, SeedFlowNode } from './flows'; // type-only: no import cycle with flows.ts

/**
 * Global Code Finder: one binary (Yes/No) question per screen, one Global Code per invoice.
 * Tree = docs/superpowers/specs/2026-11-05-global-code-finder-design.md. Only A00, A01, B00, B01, C12 and M00 have known numbers;
 * every other code is "code TBC" until the master list is supplied. Never invent a number.
 */
const q = (id: string, text: string, yesTo: string, noTo: string, detail?: string): SeedFlowNode => ({
  id, kind: 'question', text, ...(detail ? { detail } : {}),
  options: [{ label: 'Yes', to: yesTo }, { label: 'No', to: noTo }],
});
type Sev = 'success' | 'warning' | 'info';
const r = (id: string, text: string, detail: string, severity: Sev = 'success'): SeedFlowNode => ({ id, kind: 'result', severity, text, detail });
/** Result for a code whose number is not yet known. */
const tbc = (id: string, name: string, detail: string, severity: Sev = 'success'): SeedFlowNode => r(id, `${name} · code TBC`, detail, severity);

const THIS_SERVICE = 'Answer the next questions for that service only.';

export const GLOBAL_CODE_FLOW: SeedFlow = {
  title: 'Global Code Finder (DEMO)',
  articleSlug: 'global-codes-for-invoice-processing',
  startId: 'multi',
  nodes: [
    // Entry / several services
    q('multi', 'Does this invoice include more than one kind of service?', 'main', 'svc', 'DEMO flow. This finder picks one Global Code for one invoice. It classifies the invoice only; it does not decide coverage or medical necessity. If the items all belong to one visit or stay (an ER visit with its tests, a surgery stay, a consultation with its own tests), answer Yes here and Yes to "main reason". Use highest value only when there is no main purpose.'),
    q('main', 'Is one of them the main reason for the invoice?', 'svc', 'top', `Answer Yes when the items all belong to one visit or stay: an ER visit with its tests and medicines, a surgery stay, or a consultation with its own tests. Then classify that purpose. Use highest value only when there is no main purpose. ${THIS_SERVICE}`),
    q('top', 'Is one of them clearly the most expensive?', 'svc', 'r-free', THIS_SERVICE),
    r('r-free', 'Free Choice: pick any of the tied codes', 'No main service and no clear highest value. The highest-value service wins; on an exact tie any of the tied codes may be chosen. Never pick one silently. Example: wheelchair $100 and crutches $100: choose Wheelchair or Crutches.', 'info'),

    // Service or item
    q('svc', 'Is this a medical service for the patient?', 'dental', 'adm', 'Answer No for transport, equipment or supplies, or a fee only.'),
    q('dental', 'Is it dental (dentist, dental emergency, prosthesis, orthodontics)?', 'r-dentist', 'fac'),
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
    q('admit', 'Was the patient admitted (room, ICU)?', 'r-inpatient', 'cons', 'If not, answer No: a hospital outpatient bill (imaging, chemotherapy day unit, dialysis, physio, clinic consultation) continues to the service questions.'),

    // Separate professional fee
    q('sep', 'Is it a separate fee from a doctor, nurse or anesthesiologist, billed apart from a facility bill?', 'anes', 'nursebill'),
    q('anes', 'Is it from the anesthesiologist?', 'r-anes', 'nurse'),
    q('nurse', 'Is it for nursing services?', 'r-medfees', 'read'),
    q('read', 'Is it only a radiologist or pathologist reading an image or sample?', 'readkind', 'inpt'),
    q('readkind', 'Is it reading an image or scan?', 'img', 'bxread'),
    q('bxread', 'Is the sample described as a biopsy?', 'r-biopsy', 'r-analysis'),
    q('nursebill', 'Is it a nursing bill (for example home nursing)?', 'r-medfees', 'cons'),
    q('inpt', 'Did the doctor treat or operate while the patient was admitted?', 'r-b00', 'r-outpt'),

    // Consultation
    q('cons', 'Is the main purpose a consultation with a doctor or other health professional (dietitian, podiatrist, optometrist…)?', 'tele', 'test', 'Therapy sessions (physio, psychotherapy, occupational or speech therapy, acupuncture, chiropractic) answer No.'),
    q('tele', 'Was it by video or phone?', 'r-tele', 'home'),
    q('home', 'Was it a house call?', 'r-home', 'spec'),
    q('spec', 'Is it a specialist (eye, heart, skin, psychiatry, dietitian, podiatrist, optometrist…)?', 'r-spec', 'r-a01'),

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
    q('scope', 'Is it a scope (a camera inside the body)?', 'gastro', 'org', 'Colposcopy and urodynamic tests: answer No. They are Analysis.'),
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
    q('lab', 'Is it a lab analysis of a sample (blood, urine, Pap smear…)?', 'r-analysis', 'r-review', 'Colposcopy and urodynamic tests also count: answer Yes.'),

    // Medicine or treatment
    q('med', 'Is the main purpose to give or buy a medicine (pharmacy, injection, infusion, vaccine)?', 'vac', 'wound', 'Blood transfusion and oxygen therapy: answer No (no code yet; they go to manual review).'),
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

    // Results: reason + rule applied + one example (reference sections 4-5)
    r('r-a01', 'A01 · Consultation', 'General consultation, follow-up, urgent care or walk-in visit; tests or creams from the visit do not change the code. A US routine check-up is Consultation (current US rule). A medical certificate billed on its own is Consultation, not Administrative Fees. Example: walk-in clinic visit with a blood test and an ointment.'),
    r('r-er', 'B01 · ER', 'Hospital emergency room facility bill, including observation without admission. Included tests, medicines, stitches and dressings stay ER. An ER bill that also includes a surgery stays ER (current ruling, flagged for team lead review). Example: ER visit with CT, medicines and sutures.'),
    r('r-b00', 'B00 · Inpatient Physician Fees', 'Separate doctor\'s fee for care while the patient was admitted, including the surgeon\'s own fee. A professional fee is never Forfait. Example: surgeon\'s separate fee for an inpatient operation.'),
    r('r-inpatient', 'C12 · Inpatient Treatment', 'Facility bill for an admitted stay: room and board, ICU, tests, psychiatric hospital stay. No surgery or delivery on this bill. Example: 4 days in ICU with tests, no surgery.'),
    tbc('r-forfait', 'Forfait', 'Facility bill with any surgery, minor or major, inpatient or outpatient, or a delivery (vaginal or C-section). Surgery and hospital days on the same bill are all Forfait. Example: cataract surgery facility bill.'),
    r('r-outpt', 'A00 · Outpatient Physician Fees', 'Separate doctor\'s fee for outpatient care, including a separately billed outpatient surgeon fee and a separate ER doctor fee. B00 is only for doctors treating or operating during an admission. More specific codes (Anesthesiologist, imaging reads) come first. Example: separate ER doctor\'s bill.'),
    tbc('r-anes', 'Anesthesiologist', 'The anesthesiologist\'s separate fee, inpatient or outpatient. Example: anesthesiologist\'s own bill for a knee operation.'),
    tbc('r-medfees', 'Med Fees', 'Nursing service fees. Do not use a physician fee code for nursing. Example: nursing service bill.'),
    r('r-dentist', 'M00 · Dentist', 'Anything dental: consults, extractions, root canals, prostheses and orthodontics, including a dental emergency at a hospital ER (M00, not ER). Example: tooth extraction at a dental clinic.'),
    tbc('r-tele', 'Telemedicine', 'Consultation by video or phone, including remote follow-ups. The mode decides the code. Example: video follow-up with the doctor.'),
    tbc('r-home', 'Homevisit', 'Doctor\'s house call. The place decides the code. Example: doctor visits the patient at home.'),
    tbc('r-spec', 'Specialist Consultation', 'Consultation with any specialist, including follow-ups: eye, heart, skin, psychiatry, dietitian, podiatrist, optometrist. Tests in the same visit do not change the code. Example: ophthalmologist consult with a routine eye exam.'),
    r('r-us', 'Ultrasonography · code TBC', 'Provisional: Ultrasonography. The alternative code is Ecography; the rule to choose between them is not yet defined. Confirm with your team lead. Example: abdominal or prenatal ultrasound.', 'warning'),
    tbc('r-mri', 'MRI', 'MRI scan, or a radiologist\'s separate bill for reading an MRI. Two independent scans with no main purpose: the higher-value scan wins. Example: radiologist bills only the MRI reading.'),
    tbc('r-ct', 'CT Scan', 'CT scan, or a separate bill for reading a CT. Two independent services with no main purpose: the higher-value one wins. Example: CT $900 and lab $150, no main purpose.'),
    tbc('r-pet', 'PET Scan', 'PET scan (positron emission tomography). Example: PET scan at an imaging center.'),
    tbc('r-mam', 'Mammography', 'Mammogram. Example: screening mammogram.'),
    tbc('r-bone', 'Bone Densitometry', 'Bone density scan (DEXA); confirm the exact name with your team lead. Example: DEXA scan.'),
    tbc('r-xray', 'X-ray', 'Plain X-ray, or a separate bill for reading it. Example: chest X-ray.'),
    tbc('r-gastro', 'Gastroscopy', 'Gastroscopy, including a biopsy on the same invoice. Gastroscopy overrides Scopies. Example: gastroscopy with biopsy.'),
    tbc('r-analysis-cysto', 'Analysis', 'Cystoscopy is Analysis, not Scopies. This is the current internal rule and is flagged for review. Example: cystoscopy at a urology clinic.'),
    tbc('r-scopies', 'Scopies', 'Colonoscopy and other scopes, including a biopsy on the same invoice. Gastroscopy and cystoscopy have their own answers. Example: colonoscopy with biopsy.'),
    tbc('r-analysis', 'Analysis', 'Lab analysis: blood, urine, stool, cultures, pregnancy and allergy tests, Pap smear, colposcopy, urodynamic tests. A specimen collection fee stays Analysis. A surgical specimen not described as a biopsy is Analysis. Example: blood test with a collection fee.'),
    tbc('r-biopsy', 'Biopsy', 'Standalone biopsy, or a separate pathology bill for a biopsy sample. A biopsy inside a colonoscopy or gastroscopy takes that scope\'s code. Example: pathologist\'s bill for a biopsy sample.'),
    tbc('r-holter', 'Holter', 'Holter monitoring (wearable 24 h heart monitor). Example: 24 h Holter recording.'),
    r('r-ecg', 'ECG · code TBC', 'Provisional: ECG. The alternative code is EKG; the rule to choose between them is not yet defined. Confirm with your team lead. Example: resting electrocardiogram tracing.', 'warning'),
    tbc('r-cardtest', 'Cardiological Test', 'Other heart tests. Example: a heart test that is not an ECG, EKG or Holter.'),
    tbc('r-eeg', 'EEG', 'Electroencephalogram (brain test). Example: EEG at a neurology clinic.'),
    tbc('r-sleep', 'Sleep Study', 'Sleep study (polysomnography); confirm the exact name with your team lead. Example: overnight sleep study.'),
    r('r-spiro', 'Spirometry / Pulmonary Function Test · code TBC', 'Provisional: one entry for both names. The master list may hold two codes (Spirometry and Pulmonary Function Test); the rule is not yet defined. Use whichever matches the invoice wording and confirm with your team lead. Example: spirometry at a lung clinic.', 'warning'),
    tbc('r-audio', 'Audiometry', 'Hearing test (audiometry). Example: audiogram at an ENT clinic.'),
    tbc('r-vac', 'Vaccination', 'Vaccination as the main service. Overrides Medicines. Example: vaccination visit.'),
    tbc('r-chemo', 'Chemotherapy', 'Chemotherapy session or chemotherapy infusion. Overrides Medicines. Example: chemotherapy infusion.'),
    tbc('r-medicines', 'Medicines', 'Pharmacy bill, or a visit only to give a medicine (not chemotherapy, not a vaccine), even an expensive one. Not for medicines that come with a consultation. Example: clinic visit only for an expensive injection.'),
    tbc('r-wound', 'Wound Dressing', 'Dressing, stitches, stitch removal or abscess drainage outside a hospital ER. Inside an ER facility bill it stays ER. Example: stitches at a walk-in clinic.'),
    tbc('r-physio', 'Physiotherapy', 'Physical therapy sessions. Example: physiotherapy sessions for a knee.'),
    tbc('r-psycho', 'Psychotherapy', 'Therapy sessions with a psychologist or therapist. A psychiatrist\'s medical consult is Specialist Consultation instead. Example: psychologist therapy session.'),
    tbc('r-ot', 'Occupational Therapy', 'Occupational therapy. Example: occupational therapy session.'),
    tbc('r-speech', 'Speech Therapy', 'Speech and language therapy. Example: speech therapy session.'),
    tbc('r-radio', 'Radiotherapy', 'Radiation therapy session. Example: radiotherapy session.'),
    tbc('r-dialysis', 'Dialysis', 'Kidney dialysis. Example: dialysis session.'),
    tbc('r-acu', 'Acupuncture', 'Acupuncture. Example: acupuncture session.'),
    tbc('r-chiro', 'Chiropractic', 'Chiropractic treatment. Example: chiropractor session.'),
    tbc('r-admin', 'Administrative Fees', 'A separate invoice that is only a fee or tax: US surcharges, Brazilian taxes, fees to obtain a medical report. A medical certificate is Consultation instead. Example: fee to obtain a medical report.'),
    tbc('r-air', 'Air Ambulance', 'Air medical transport. Example: air ambulance transfer.'),
    tbc('r-taxi', 'Taxi', 'Taxi for medically related transport. Example: taxi to a hospital appointment.'),
    tbc('r-ambulance', 'Ambulance', 'Ground ambulance transport. Example: ambulance to the hospital.'),
    tbc('r-wheelchair', 'Wheelchair', 'Wheelchair. It has its own code; it is not Materials. With crutches on one invoice, the higher value wins. Example: wheelchair $600 and crutches $100.'),
    tbc('r-crutches', 'Crutches', 'Crutches. They have their own code; they are not Materials. Example: crutches bought on their own.'),
    tbc('r-materials', 'Materials', 'Equipment or supplies with no own code: prosthetics, orthotics, hearing aids, home oxygen equipment, eyeglasses, contact lenses. Example: eyeglasses.'),
    r('r-review', 'Needs manual review', 'No matching code, and there is no generic fallback. Do not guess a category. Send it to your team lead. Example: EMG, blood transfusion or oxygen therapy (codes not yet mapped).', 'warning'),
  ],
};
