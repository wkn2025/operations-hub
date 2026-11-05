import { describe, expect, it } from 'vitest';
import { start, step, type Flow } from '@ops/shared';
import { GLOBAL_CODE_FLOW } from '../src/seed/content/global-code-finder';

/**
 * Realistic invoices (started with 50) walked through the Global Code Finder by a simulated staff member.
 * `expected` was written from the reference rules (GLOBAL_CODE_FINDER_IMPLEMENTATION.md §2/§4/§5/§7)
 * plus the user rulings in docs/superpowers/specs/2026-11-05-global-code-finder-design.md,
 * never from the flow's output. The simulator answers each question from the invoice facts only.
 */
const flow = GLOBAL_CODE_FLOW as unknown as Flow;
const byId = new Map(flow.nodes.map((n) => [n.id, n]));

type Service =
  // facility charges
  | 'er-facility' | 'er-observation' | 'surgery-facility' | 'delivery-facility' | 'inpatient-room' | 'icu'
  // professional fees billed apart from a facility bill
  | 'surgeon-fee-inpatient' | 'surgeon-fee-outpatient' | 'er-doctor-fee' | 'inpatient-physician-visit'
  | 'anesthesiologist-fee' | 'nursing-home' | 'nursing-in-hospital' | 'radiologist-read-mri' | 'pathologist-read-biopsy' | 'pathologist-read-specimen'
  // seeing a clinician
  | 'consultation-gp' | 'consultation-specialist' | 'urgent-care' | 'checkup-us' | 'medical-certificate'
  | 'telemedicine' | 'house-call' | 'dietitian'
  // dental
  | 'dental-treatment' | 'dental-orthodontics' | 'dental-emergency'
  // tests and scans
  | 'mri' | 'ct' | 'pet' | 'ultrasound' | 'mammogram' | 'bone-density' | 'xray' | 'eye-exam'
  | 'gastroscopy' | 'colonoscopy' | 'cystoscopy' | 'colposcopy'
  | 'holter' | 'ecg' | 'cardio-other' | 'eeg' | 'sleep-study' | 'spirometry' | 'audiometry' | 'emg' | 'biopsy' | 'lab'
  // medicines and treatment
  | 'vaccine' | 'chemo' | 'injection' | 'pharmacy' | 'wound-care'
  | 'physio' | 'psychotherapy' | 'occupational-therapy' | 'speech-therapy'
  | 'radiotherapy' | 'dialysis' | 'acupuncture' | 'chiropractic' | 'transfusion' | 'oxygen'
  // non-medical
  | 'admin-fee' | 'tax' | 'medical-report-fee' | 'air-ambulance' | 'taxi' | 'ambulance' | 'wheelchair' | 'crutches' | 'materials';

interface Line { desc: string; amount: number; service: Service }
interface Invoice {
  id: string;
  provider: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'BRL' | 'CHF' | 'AED' | 'THB' | 'SGD';
  lines: Line[];
  /** Index of the line that is the invoice's main purpose (reference rule 3/6); only when there clearly is one. */
  main?: number;
  /** The invoice is a hospital facility invoice although its service kind is not a facility charge. */
  hospitalBill?: true;
  expected: string;
  why: string;
}

const tbc = (name: string) => `${name} · code TBC`;
const A00 = 'A00 · Outpatient Physician Fees';
const A01 = 'A01 · Consultation';
const B00 = 'B00 · Inpatient Physician Fees';
const B01 = 'B01 · ER';
const C12 = 'C12 · Inpatient Treatment';
const M00 = 'M00 · Dentist';
const FREE = 'Free Choice: pick any of the tied codes';
const REVIEW = 'Needs manual review';

const INVOICES: Invoice[] = [
  // ---- single service ----
  { id: 'INV-01', provider: 'Clínica Saúde Lapa, Lisbon, PT', currency: 'EUR',
    lines: [{ desc: 'General practitioner consultation', amount: 85, service: 'consultation-gp' }],
    expected: A01, why: '§4 Consultation: general medical consultation' },
  { id: 'INV-02', provider: 'Northside Family Medicine, Chicago, US', currency: 'USD',
    lines: [{ desc: 'Annual preventive physical exam', amount: 320, service: 'checkup-us' }],
    expected: A01, why: '§4 special exception / §7.3: US routine check-up is Consultation' },
  { id: 'INV-03', provider: 'Harley Street GP Practice, London, UK', currency: 'GBP',
    lines: [{ desc: 'Medical certificate (fitness to fly)', amount: 40, service: 'medical-certificate' }],
    expected: A01, why: '§5: separately billed medical certificate is Consultation, not Administrative Fees' },
  { id: 'INV-04', provider: 'Praxis Dr. Weber, Munich, DE', currency: 'EUR',
    lines: [{ desc: 'Psychiatry specialist consultation', amount: 160, service: 'consultation-specialist' }],
    expected: tbc('Specialist Consultation'), why: '§5: psychiatry consultation is Specialist Consultation, not Psychotherapy' },
  { id: 'INV-05', provider: 'TeleDoc Health, Dallas, US', currency: 'USD',
    lines: [{ desc: 'Video follow-up visit', amount: 79, service: 'telemedicine' }],
    expected: tbc('Telemedicine'), why: '§5: video follow-up is Telemedicine (mode-specific code)' },
  { id: 'INV-06', provider: 'SOS Médecins, Paris, FR', currency: 'EUR',
    lines: [{ desc: 'Night house call', amount: 180, service: 'house-call' }],
    expected: tbc('Homevisit'), why: '§5: home physician visit is Homevisit' },
  { id: 'INV-07', provider: 'OdontoCenter, São Paulo, BR', currency: 'BRL',
    lines: [{ desc: 'Root canal treatment, molar', amount: 1200, service: 'dental-treatment' },
      { desc: 'Post-treatment dental X-ray', amount: 80, service: 'dental-treatment' }],
    expected: M00, why: '§4 Dentist / ruling 2: anything dental is M00' },
  { id: 'INV-08', provider: 'Lakeshore Imaging Center, Miami, US', currency: 'USD',
    lines: [{ desc: 'MRI right knee without contrast', amount: 1450, service: 'mri' }],
    expected: tbc('MRI'), why: '§4 MRI: standalone MRI' },
  { id: 'INV-09', provider: 'Centro Diagnóstico Sur, Madrid, ES', currency: 'EUR',
    lines: [{ desc: 'Abdominal ultrasound', amount: 120, service: 'ultrasound' }],
    expected: tbc('Ultrasonography'), why: '§7.1 + provisional ruling: ultrasound defaults to Ultrasonography' },
  { id: 'INV-10', provider: 'Kings Cardiology Clinic, London, UK', currency: 'GBP',
    lines: [{ desc: 'Resting 12-lead ECG', amount: 60, service: 'ecg' }],
    expected: tbc('ECG'), why: '§7.2 + provisional ruling: electrocardiogram defaults to ECG' },
  { id: 'INV-11', provider: 'Lungenpraxis Zürich, CH', currency: 'CHF',
    lines: [{ desc: 'Spirometry with bronchodilator test', amount: 140, service: 'spirometry' }],
    expected: tbc('Spirometry / Pulmonary Function Test'), why: '§7.5 + provisional ruling: one entry Spirometry / PFT' },
  { id: 'INV-12', provider: 'Urologie am Ring, Vienna, AT', currency: 'EUR',
    lines: [{ desc: 'Diagnostic cystoscopy', amount: 480, service: 'cystoscopy' }],
    expected: tbc('Analysis'), why: '§4 / §7.4: cystoscopy is Analysis, not Scopies' },
  { id: 'INV-13', provider: 'Clinique Neuro Lyon, FR', currency: 'EUR',
    lines: [{ desc: 'Electromyography (EMG), both arms', amount: 260, service: 'emg' }],
    expected: REVIEW, why: '§7.9 / rule 8: EMG not mapped, manual review' },
  { id: 'INV-14', provider: 'Boots Pharmacy, Manchester, UK', currency: 'GBP',
    lines: [{ desc: 'Amoxicillin 500 mg x21', amount: 12, service: 'pharmacy' },
      { desc: 'Ibuprofen 400 mg x24', amount: 4, service: 'pharmacy' },
      { desc: 'Salbutamol inhaler', amount: 9, service: 'pharmacy' }],
    expected: tbc('Medicines'), why: '§4 Medicines: pharmacy invoice with one or many medications' },
  { id: 'INV-15', provider: 'Travel Health Clinic, Bangkok, TH', currency: 'THB',
    lines: [{ desc: 'Yellow fever vaccine incl. administration', amount: 2400, service: 'vaccine' }],
    expected: tbc('Vaccination'), why: '§4 Vaccination: overrides Medicines' },
  { id: 'INV-16', provider: 'Oncology Associates, Houston, US', currency: 'USD',
    lines: [{ desc: 'Paclitaxel infusion (drug)', amount: 3100, service: 'chemo' },
      { desc: 'Chemotherapy administration, first hour', amount: 420, service: 'chemo' }],
    expected: tbc('Chemotherapy'), why: '§4 / rule 4: chemotherapy overrides Medicines' },
  { id: 'INV-17', provider: 'Walk-in Centre Soho, London, UK', currency: 'GBP',
    lines: [{ desc: 'Laceration repair, 4 sutures, forearm', amount: 145, service: 'wound-care' }],
    expected: tbc('Wound Dressing'), why: '§5: standalone sutures outside ER are Wound Dressing' },
  { id: 'INV-18', provider: 'Psychologie Praxis Hamburg, DE', currency: 'EUR',
    lines: [{ desc: 'Psychotherapy session, 50 min (x4)', amount: 400, service: 'psychotherapy' }],
    expected: tbc('Psychotherapy'), why: '§5: psychologist therapy session is Psychotherapy' },
  { id: 'INV-19', provider: 'Hospital Santa Luzia, Brasília, BR', currency: 'BRL',
    lines: [{ desc: 'Fee to issue copy of medical report', amount: 150, service: 'medical-report-fee' }],
    expected: tbc('Administrative Fees'), why: '§4 / §5: fee solely to obtain a medical report' },
  { id: 'INV-20', provider: 'Prefeitura do Rio de Janeiro, BR', currency: 'BRL',
    lines: [{ desc: 'ISS municipal service tax on hospital invoice 4471', amount: 95, service: 'tax' }],
    expected: tbc('Administrative Fees'), why: '§5: separate Brazil tax' },
  { id: 'INV-21', provider: 'AirMed Evac, Orlando, US', currency: 'USD',
    lines: [{ desc: 'Fixed-wing air ambulance Cancún to Miami', amount: 28000, service: 'air-ambulance' }],
    expected: tbc('Air Ambulance'), why: '§4 D: air medical transport' },
  { id: 'INV-22', provider: 'Optique Bellecour, Lyon, FR', currency: 'EUR',
    lines: [{ desc: 'Prescription eyeglasses, frame', amount: 140, service: 'materials' },
      { desc: 'Prescription lenses, pair', amount: 210, service: 'materials' }],
    expected: tbc('Materials'), why: '§4 D Materials: eyeglasses, frames' },
  { id: 'INV-23', provider: 'CareAtHome Nursing, Dubai, AE', currency: 'AED',
    lines: [{ desc: 'Home nursing visits, post-discharge monitoring and personal care (x5)', amount: 1750, service: 'nursing-home' }],
    expected: tbc('Med Fees'), why: '§5: nursing service bill is Med Fees' },
  { id: 'INV-24', provider: 'Dr. A. Patel, Anesthesiology, Boston, US', currency: 'USD',
    lines: [{ desc: 'Anesthesia services, knee arthroscopy', amount: 980, service: 'anesthesiologist-fee' }],
    expected: tbc('Anesthesiologist'), why: '§5 / rule 5: separate anesthesiologist fee' },
  { id: 'INV-25', provider: 'Dr. M. Ruiz, Orthopedic Surgery, San Diego, US', currency: 'USD',
    lines: [{ desc: 'Surgeon fee, knee arthroscopy (ambulatory surgery center, same day)', amount: 2400, service: 'surgeon-fee-outpatient' }],
    expected: A00, why: '§5 + ruling 1: separate outpatient surgeon fee is A00' },
  { id: 'INV-26', provider: 'Dr. L. Chen, General Surgery, New York, US', currency: 'USD',
    lines: [{ desc: 'Surgeon fee, laparoscopic cholecystectomy (admitted 2 nights)', amount: 3200, service: 'surgeon-fee-inpatient' }],
    expected: B00, why: '§5 + ruling 1: separate inpatient surgeon fee is B00' },
  { id: 'INV-27', provider: 'Emergency Physicians Group, Phoenix, US', currency: 'USD',
    lines: [{ desc: 'ER physician professional fee, level 4', amount: 410, service: 'er-doctor-fee' }],
    expected: A00, why: '§5 + ruling 1: separate ER physician bill is A00' },
  { id: 'INV-28', provider: 'Radiology Partners, Atlanta, US', currency: 'USD',
    lines: [{ desc: 'Professional interpretation, MRI lumbar spine (no scan charge)', amount: 210, service: 'radiologist-read-mri' }],
    expected: tbc('MRI'), why: '§5 / rule 5: radiologist MRI read uses the imaging code' },
  { id: 'INV-29', provider: 'PathLab Dx, Denver, US', currency: 'USD',
    lines: [{ desc: 'Surgical pathology, skin biopsy specimen', amount: 180, service: 'pathologist-read-biopsy' }],
    expected: tbc('Biopsy'), why: '§5 / rule 5: separate pathology of a biopsy sample is Biopsy' },

  // ---- bundles with a clear main purpose ----
  { id: 'INV-30', provider: "St. Mary's Hospital, Miami, US", currency: 'USD', main: 0,
    lines: [{ desc: 'ER facility fee, level 4', amount: 850, service: 'er-facility' },
      { desc: 'CT head without contrast', amount: 1200, service: 'ct' },
      { desc: 'Ondansetron IV', amount: 45, service: 'pharmacy' },
      { desc: 'Simple laceration repair', amount: 180, service: 'wound-care' }],
    expected: B01, why: '§5 / rule 4: ER bundle stays ER even when the CT costs more' },
  { id: 'INV-31', provider: 'Hospital Quirónsalud, Barcelona, ES', currency: 'EUR', main: 0,
    lines: [{ desc: 'ER observation unit, 18 h, no admission', amount: 690, service: 'er-observation' },
      { desc: 'Blood panel and troponin', amount: 140, service: 'lab' },
      { desc: 'IV fluids and analgesia', amount: 60, service: 'pharmacy' }],
    expected: B01, why: '§5: ER observation without admission is ER' },
  { id: 'INV-32', provider: 'Royal Infirmary, Edinburgh, UK', currency: 'GBP', main: 0,
    lines: [{ desc: 'Emergency department attendance', amount: 1100, service: 'er-facility' },
      { desc: 'Closed reduction distal radius, procedure room', amount: 950, service: 'surgery-facility' },
      { desc: 'Wrist X-ray, 2 views', amount: 90, service: 'xray' },
      { desc: 'Cast and splint supplies', amount: 75, service: 'materials' }],
    expected: B01, why: 'Ruling: ER + surgery on one facility bill stays ER (rule 4 order)' },
  { id: 'INV-33', provider: 'Bumrungrad International Hospital, Bangkok, TH', currency: 'THB', main: 0,
    lines: [{ desc: 'Emergency room fee, dental trauma (avulsed incisor)', amount: 6500, service: 'dental-emergency' },
      { desc: 'Dental periapical X-ray', amount: 900, service: 'xray' },
      { desc: 'Analgesics', amount: 350, service: 'pharmacy' }],
    expected: M00, why: 'Ruling 2: dental emergency on a hospital ER facility bill is M00 (overrides §5 ER)' },
  { id: 'INV-34', provider: 'Mount Sinai Hospital, New York, US', currency: 'USD', main: 0,
    lines: [{ desc: 'Operating room, laparoscopic appendectomy', amount: 6500, service: 'surgery-facility' },
      { desc: 'Semi-private room, 3 days', amount: 2700, service: 'inpatient-room' },
      { desc: 'Anesthesia supplies', amount: 400, service: 'materials' },
      { desc: 'Inpatient pharmacy', amount: 220, service: 'pharmacy' }],
    expected: tbc('Forfait'), why: '§5 / rule 4: facility surgery + inpatient days is Forfait' },
  { id: 'INV-35', provider: 'Augenklinik Bern, CH', currency: 'CHF', main: 0,
    lines: [{ desc: 'Cataract surgery, day-case facility fee', amount: 2100, service: 'surgery-facility' },
      { desc: 'Intraocular lens implant', amount: 450, service: 'materials' }],
    expected: tbc('Forfait'), why: '§5: cataract surgery facility bill is Forfait' },
  { id: 'INV-36', provider: 'Hospital Israelita Albert Einstein, São Paulo, BR', currency: 'BRL', main: 0,
    lines: [{ desc: 'Cesarean delivery, obstetric suite', amount: 18500, service: 'delivery-facility' },
      { desc: 'Maternity room, 2 days', amount: 6200, service: 'inpatient-room' },
      { desc: 'Medications and IV fluids', amount: 1300, service: 'pharmacy' }],
    expected: tbc('Forfait'), why: '§5: delivery (C-section) facility bill is Forfait' },
  { id: 'INV-37', provider: 'Charité Universitätsmedizin, Berlin, DE', currency: 'EUR', main: 0,
    lines: [{ desc: 'Ward bed, pneumonia, 4 days', amount: 2400, service: 'inpatient-room' },
      { desc: 'ICU bed, 2 days', amount: 3800, service: 'icu' },
      { desc: 'Blood cultures and labs', amount: 520, service: 'lab' },
      { desc: 'IV antibiotics', amount: 610, service: 'pharmacy' }],
    expected: C12, why: '§5: inpatient room, ICU, tests, no surgery is Inpatient Treatment' },
  { id: 'INV-38', provider: 'MedFirst Clinic, Austin, US', currency: 'USD', main: 0,
    lines: [{ desc: 'Office visit, established patient', amount: 150, service: 'consultation-gp' },
      { desc: 'Strep A rapid test', amount: 60, service: 'lab' },
      { desc: 'Mupirocin ointment', amount: 18, service: 'pharmacy' }],
    expected: A01, why: '§5 / rule 3: consultation with its own tests and cream stays Consultation' },
  { id: 'INV-39', provider: 'Clínica Alemana, Santiago, CL', currency: 'USD', main: 0,
    lines: [{ desc: 'General consultation, back pain', amount: 200, service: 'consultation-gp' },
      { desc: 'MRI lumbar spine ordered during visit', amount: 1500, service: 'mri' }],
    expected: A01, why: '§5 / rule 3: consultation is primary; purpose over amount' },
  { id: 'INV-40', provider: 'Gastro Centrum Rotterdam, NL', currency: 'EUR', main: 0,
    lines: [{ desc: 'Upper GI endoscopy (gastroscopy)', amount: 900, service: 'gastroscopy' },
      { desc: 'Gastric biopsy, 2 samples', amount: 250, service: 'biopsy' }],
    expected: tbc('Gastroscopy'), why: '§5 / rule 4: gastroscopy with biopsy is Gastroscopy' },
  { id: 'INV-41', provider: 'Digestive Health Institute, Toronto, CA', currency: 'USD', main: 0,
    lines: [{ desc: 'Colonoscopy, diagnostic', amount: 1100, service: 'colonoscopy' },
      { desc: 'Polyp biopsy', amount: 300, service: 'biopsy' }],
    expected: tbc('Scopies'), why: '§5 / rule 4: colonoscopy with biopsy is Scopies' },

  // ---- several independent services, no main purpose: highest value wins ----
  { id: 'INV-42', provider: 'RadNet Imaging, Los Angeles, US', currency: 'USD',
    lines: [{ desc: 'MRI brain', amount: 1500, service: 'mri' },
      { desc: 'CT chest', amount: 800, service: 'ct' }],
    expected: tbc('MRI'), why: '§5 / rule 6: two independent scans, higher value (MRI) wins' },
  { id: 'INV-43', provider: 'Diagnostic Center Al Zahra, Dubai, AE', currency: 'AED',
    lines: [{ desc: 'CT abdomen and pelvis', amount: 900, service: 'ct' },
      { desc: 'Comprehensive metabolic panel', amount: 150, service: 'lab' }],
    expected: tbc('CT Scan'), why: '§5 / rule 6: CT $900 + Analysis $150, CT wins' },
  { id: 'INV-44', provider: 'MedSupply Direct, Tampa, US', currency: 'USD',
    lines: [{ desc: 'Standard folding wheelchair', amount: 600, service: 'wheelchair' },
      { desc: 'Aluminium crutches, pair', amount: 100, service: 'crutches' }],
    expected: tbc('Wheelchair'), why: '§5 / rule 6: wheelchair $600 + crutches $100, wheelchair wins' },
  { id: 'INV-45', provider: 'Integrative Rehab Clinic, Vancouver, CA', currency: 'USD',
    lines: [{ desc: 'Physiotherapy, 8 sessions', amount: 480, service: 'physio' },
      { desc: 'Acupuncture, 4 sessions', amount: 300, service: 'acupuncture' }],
    expected: tbc('Physiotherapy'), why: 'Rule 6: independent therapies, higher value (physio) wins' },
  { id: 'INV-46', provider: 'Policlinico Gemelli (hospital outpatient radiology), Rome, IT', currency: 'EUR', hospitalBill: true,
    lines: [{ desc: 'Chest X-ray, PA and lateral', amount: 85, service: 'xray' },
      { desc: 'Thyroid ultrasound', amount: 140, service: 'ultrasound' }],
    expected: tbc('Ultrasonography'), why: 'Rule 6 + §4 imaging: two independent scans, ultrasound higher; provisional Ultrasonography' },
  { id: 'INV-47', provider: 'Ortho & Mobility Store, Lisbon, PT', currency: 'EUR',
    lines: [{ desc: 'Wheelchair rental, 1 month', amount: 100, service: 'wheelchair' },
      { desc: 'Forearm crutches, pair', amount: 100, service: 'crutches' }],
    expected: FREE, why: '§5 / rule 7: wheelchair 100 = crutches 100, no principal: Free Choice' },
  { id: 'INV-48', provider: 'NeuroCardio Diagnostics, Geneva, CH', currency: 'CHF',
    lines: [{ desc: '24 h Holter monitoring', amount: 210, service: 'holter' },
      { desc: 'Routine EEG', amount: 210, service: 'eeg' }],
    expected: FREE, why: 'Rule 7: Holter 210 = EEG 210, independent tests, no principal: Free Choice' },

  // ---- former flow gaps (fixed by the user approved fixes 2026-11-05) ----
  { id: 'INV-49', provider: 'NutriBalance, Sydney, AU', currency: 'USD',
    lines: [{ desc: 'Dietitian consultation, initial', amount: 120, service: 'dietitian' }],
    expected: tbc('Specialist Consultation'), why: '§4 Specialist Consultation includes nutritionist/dietitian' },
  { id: 'INV-50', provider: 'Hospital da Luz, oncology day unit, Lisbon, PT', currency: 'EUR', hospitalBill: true,
    lines: [{ desc: 'Docetaxel (drug)', amount: 1900, service: 'chemo' },
      { desc: 'Day-unit chemotherapy administration', amount: 380, service: 'chemo' }],
    expected: tbc('Chemotherapy'), why: '§4 / rule 4: chemotherapy session overrides Medicines; billed by the hospital' },

  // ---- more reference §5 rows and remaining codes ----
  { id: 'INV-51', provider: 'Allergy & Asthma Clinic, Boston, US', currency: 'USD',
    lines: [{ desc: 'Omalizumab 300 mg injection, visit for administration only', amount: 2900, service: 'injection' }],
    expected: tbc('Medicines'), why: '§5: clinic visit solely for an expensive injection is Medicines' },
  { id: 'INV-52', provider: 'Labor Dr. Wisplinghoff, Cologne, DE', currency: 'EUR',
    lines: [{ desc: 'Full blood count and lipid panel', amount: 48, service: 'lab' },
      { desc: 'Specimen collection fee (venipuncture)', amount: 8, service: 'lab' }],
    expected: tbc('Analysis'), why: '§5: independent lab test with a specimen collection fee is Analysis' },
  { id: 'INV-53', provider: 'Cellular Pathology Services, Leeds, UK', currency: 'GBP',
    lines: [{ desc: 'Histology of gallbladder removed at surgery (not a biopsy)', amount: 95, service: 'pathologist-read-specimen' }],
    expected: tbc('Analysis'), why: '§5: lab analysis of a surgical specimen not described as biopsy is Analysis' },
  { id: 'INV-54', provider: 'Clínica Psiquiátrica São Vicente, Rio de Janeiro, BR', currency: 'BRL', main: 0,
    lines: [{ desc: 'Psychiatric ward accommodation, 10 days', amount: 9800, service: 'inpatient-room' },
      { desc: 'Inpatient medications', amount: 640, service: 'pharmacy' }],
    expected: C12, why: '§5: psychiatric inpatient facility accommodation is Inpatient Treatment' },
  { id: 'INV-55', provider: 'Moorfields Private Eye Centre, London, UK', currency: 'GBP', main: 0,
    lines: [{ desc: 'Ophthalmology consultation', amount: 250, service: 'consultation-specialist' },
      { desc: 'Routine eye examination (refraction, tonometry)', amount: 60, service: 'eye-exam' }],
    expected: tbc('Specialist Consultation'), why: '§5: ophthalmologist consult with routine eye exam is Specialist Consultation' },
  { id: 'INV-56', provider: 'Riverside Ambulatory Surgery Center, Portland, US', currency: 'USD',
    lines: [{ desc: 'Facility fee, excision of lipoma (outpatient)', amount: 1850, service: 'surgery-facility' }],
    expected: tbc('Forfait'), why: '§5: facility bill for minor outpatient surgery is Forfait' },
  { id: 'INV-57', provider: 'CityMD Urgent Care, New York, US', currency: 'USD',
    lines: [{ desc: 'Urgent care evaluation, sore throat', amount: 195, service: 'urgent-care' }],
    expected: A01, why: '§5: general urgent care / walk-in evaluation is Consultation' },
  { id: 'INV-58', provider: 'Taxis G7, Paris, FR', currency: 'EUR',
    lines: [{ desc: 'Taxi hotel to hospital appointment and back', amount: 46, service: 'taxi' }],
    expected: tbc('Taxi'), why: '§4 D: taxi for medically related transport' },
  { id: 'INV-59', provider: 'Ambulancias Ayuda, Málaga, ES', currency: 'EUR',
    lines: [{ desc: 'Ground ambulance transfer, hotel to hospital', amount: 320, service: 'ambulance' }],
    expected: tbc('Ambulance'), why: '§4 D: ground ambulance transportation' },
  { id: 'INV-60', provider: 'Nuclear Imaging Partners, Houston, US', currency: 'USD',
    lines: [{ desc: 'PET scan, whole body (FDG)', amount: 4200, service: 'pet' }],
    expected: tbc('PET Scan'), why: '§4 B: positron emission tomography' },
  { id: 'INV-61', provider: 'Breast Screening Centre, Toronto, CA', currency: 'USD',
    lines: [{ desc: 'Screening mammogram, bilateral', amount: 230, service: 'mammogram' }],
    expected: tbc('Mammography'), why: '§4 B: mammogram' },
  { id: 'INV-62', provider: 'Centre d\'Ostéodensitométrie, Nice, FR', currency: 'EUR',
    lines: [{ desc: 'DEXA bone densitometry, hip and spine', amount: 75, service: 'bone-density' }],
    expected: tbc('Bone Densitometry'), why: '§4 B: DEXA / bone density scanning' },
  { id: 'INV-63', provider: 'Sleep Disorders Center, Phoenix, US', currency: 'USD',
    lines: [{ desc: 'Overnight polysomnography', amount: 1900, service: 'sleep-study' }],
    expected: tbc('Sleep Study'), why: '§4 B: polysomnography is Sleep Study' },
  { id: 'INV-64', provider: 'HNO-Praxis Dr. Klein, Frankfurt, DE', currency: 'EUR',
    lines: [{ desc: 'Pure tone audiometry', amount: 55, service: 'audiometry' }],
    expected: tbc('Audiometry'), why: '§4 B: hearing / audiometry testing' },
  { id: 'INV-65', provider: 'HandWorks Therapy, Melbourne, AU', currency: 'USD',
    lines: [{ desc: 'Occupational therapy, hand rehabilitation (x6)', amount: 540, service: 'occupational-therapy' }],
    expected: tbc('Occupational Therapy'), why: '§4 C: occupational therapy' },
  { id: 'INV-66', provider: 'Clínica de Fonoaudiologia, Curitiba, BR', currency: 'BRL',
    lines: [{ desc: 'Speech therapy after stroke (x8)', amount: 1280, service: 'speech-therapy' }],
    expected: tbc('Speech Therapy'), why: '§4 C: speech / language therapy' },
  { id: 'INV-67', provider: 'Proton Therapy Center, Prague, CZ', currency: 'EUR',
    lines: [{ desc: 'Radiotherapy fractions (x15)', amount: 9600, service: 'radiotherapy' }],
    expected: tbc('Radiotherapy'), why: '§4 C: radiation therapy session' },
  { id: 'INV-68', provider: 'DaVita Dialysis Center, Orlando, US', currency: 'USD',
    lines: [{ desc: 'Hemodialysis, holiday sessions (x3)', amount: 1350, service: 'dialysis' }],
    expected: tbc('Dialysis'), why: '§4 C: renal dialysis (standalone dialysis centre)' },
  { id: 'INV-69', provider: 'Spine Align Chiropractic, Denver, US', currency: 'USD',
    lines: [{ desc: 'Chiropractic adjustment (x4)', amount: 260, service: 'chiropractic' }],
    expected: tbc('Chiropractic'), why: '§4 C: chiropractic treatment' },
  { id: 'INV-70', provider: 'Gynäkologie am Dom, Cologne, DE', currency: 'EUR',
    lines: [{ desc: 'Colposcopy', amount: 110, service: 'colposcopy' }],
    expected: tbc('Analysis'), why: '§4 B: colposcopy is Analysis' },
  { id: 'INV-71', provider: 'Centro de Hemoterapia, Lisbon, PT', currency: 'EUR',
    lines: [{ desc: 'Outpatient red cell transfusion, 2 units', amount: 780, service: 'transfusion' }],
    expected: REVIEW, why: '§7.8 / rule 8: blood transfusion code not mapped, manual review' },
  { id: 'INV-72', provider: 'Respiratory Care Clinic, Dubai, AE', currency: 'AED',
    lines: [{ desc: 'Oxygen therapy sessions, medical oxygen by mask (x6)', amount: 900, service: 'oxygen' }],
    expected: REVIEW, why: '§7.8 / rule 8: oxygen therapy code not mapped, manual review' },
  { id: 'INV-73', provider: 'Hospitalist Associates, Charlotte, US', currency: 'USD',
    lines: [{ desc: 'Hospitalist daily inpatient visits, days 1-4', amount: 1120, service: 'inpatient-physician-visit' }],
    expected: B00, why: '§4 A + ruling 1: separately billed physician services during hospitalization are B00' },
  { id: 'INV-74', provider: 'Ortodontia Sorriso, Belo Horizonte, BR', currency: 'BRL',
    lines: [{ desc: 'Orthodontic braces, maintenance visit', amount: 350, service: 'dental-orthodontics' }],
    expected: M00, why: '§4 Dentist / ruling 2: orthodontics is M00' },
  { id: 'INV-75', provider: 'HeartCare Clinic, Sydney, AU', currency: 'USD',
    lines: [{ desc: 'Exercise treadmill stress test', amount: 380, service: 'cardio-other' }],
    expected: tbc('Cardiological Test'), why: '§4 B: other cardiology test (not ECG, EKG or Holter)' },
  { id: 'INV-76', provider: 'Golden Needle Acupuncture, Vancouver, CA', currency: 'USD',
    lines: [{ desc: 'Acupuncture, 5 sessions', amount: 375, service: 'acupuncture' }],
    expected: tbc('Acupuncture'), why: '§4 C: acupuncture' },
  { id: 'INV-77', provider: 'Farmácia Ortopédica, Porto, PT', currency: 'EUR',
    lines: [{ desc: 'Axillary crutches, pair', amount: 45, service: 'crutches' }],
    expected: tbc('Crutches'), why: '§4 D: crutches, own code, not Materials' },
  { id: 'INV-78', provider: 'Instituto de Radiologia, São Paulo, BR', currency: 'BRL',
    lines: [{ desc: 'Ankle X-ray, 3 views', amount: 180, service: 'xray' }],
    expected: tbc('X-ray'), why: '§4 B: radiography' },
  { id: 'INV-79', provider: 'Herzpraxis Basel, CH', currency: 'CHF',
    lines: [{ desc: '24 h Holter ECG recording and report', amount: 260, service: 'holter' }],
    expected: tbc('Holter'), why: '§4 B: Holter monitoring' },
  { id: 'INV-80', provider: 'Neurology Clinic Bangkok, TH', currency: 'THB',
    lines: [{ desc: 'Routine EEG, 30 min', amount: 4500, service: 'eeg' }],
    expected: tbc('EEG'), why: '§4 B: electroencephalogram' },
  { id: 'INV-81', provider: 'Nurses On Call agency, Singapore, SG', currency: 'SGD',
    lines: [{ desc: 'Private-duty nurse, night shifts during admission at Mount Elizabeth Hospital (x3)', amount: 1260, service: 'nursing-in-hospital' }],
    expected: tbc('Med Fees'), why: '§5: nursing service bill is Med Fees (billed apart from the hospital bill)' },
  { id: 'INV-82', provider: 'NewYork-Presbyterian Hospital, New York, US', currency: 'USD',
    lines: [{ desc: 'NY HCRA surcharge on invoice 88213', amount: 62, service: 'admin-fee' }],
    expected: tbc('Administrative Fees'), why: '§5: separate US surcharge is Administrative Fees' },
];

// ---------------- simulated staff member ----------------

const set = (...s: Service[]) => new Set<Service>(s);
const FACILITY = set('er-facility', 'er-observation', 'dental-emergency', 'surgery-facility', 'delivery-facility', 'inpatient-room', 'icu');
const FEE_ONLY = set('admin-fee', 'tax', 'medical-report-fee');
const TRANSPORT = set('air-ambulance', 'taxi', 'ambulance');
const EQUIPMENT = set('wheelchair', 'crutches', 'materials');
const NOT_MEDICAL = new Set<Service>([...FEE_ONLY, ...TRANSPORT, ...EQUIPMENT]);
/**
 * sep "a separate fee from a doctor, nurse or anesthesiologist, billed apart from a facility bill?": Yes only when the
 * care itself happened at a facility that bills on its own invoice (surgery, ER, admission, scan, specimen). An office
 * consult or a home nursing visit has no facility bill to be "apart from", so a literal reader answers No
 * (home nursing is then caught by nursebill).
 */
const SEPARATE_FEE = set('surgeon-fee-inpatient', 'surgeon-fee-outpatient', 'er-doctor-fee', 'inpatient-physician-visit', 'anesthesiologist-fee',
  'nursing-in-hospital', 'radiologist-read-mri', 'pathologist-read-biopsy', 'pathologist-read-specimen');
const READ = set('radiologist-read-mri', 'pathologist-read-biopsy', 'pathologist-read-specimen');
/** cons "a consultation with a doctor or other health professional (dietitian, podiatrist, optometrist…)?"; detail: therapy sessions answer No. */
const CONSULTATION = set('consultation-gp', 'consultation-specialist', 'urgent-care', 'checkup-us', 'medical-certificate', 'telemedicine', 'house-call', 'dietitian');
const SCOPE = set('gastroscopy', 'colonoscopy', 'cystoscopy');
const HEART = set('holter', 'ecg', 'cardio-other');
const ORGAN = new Set<Service>([...HEART, 'eeg', 'sleep-study', 'spirometry', 'audiometry']);
const LAB = set('lab', 'colposcopy');
/** The imaging modality behind a scan or a radiologist's read. */
const modality = (s: Service): Service => (s === 'radiologist-read-mri' ? 'mri' : s);
const IMAGING = set('mri', 'ct', 'pet', 'ultrasound', 'mammogram', 'bone-density', 'xray');
const TEST = new Set<Service>([...IMAGING, ...SCOPE, ...ORGAN, 'colposcopy', 'emg', 'biopsy', 'lab', 'eye-exam']);
/** med lists "pharmacy, injection, infusion, vaccine"; its detail sends blood transfusion and oxygen therapy to No. */
const MEDICINE = set('pharmacy', 'injection', 'vaccine', 'chemo');
const THERAPY = set('physio', 'psychotherapy', 'occupational-therapy', 'speech-therapy');

const kinds = (inv: Invoice) => [...new Set(inv.lines.map((l) => l.service))];
const totals = (inv: Invoice) => {
  const t = new Map<Service, number>();
  for (const l of inv.lines) t.set(l.service, (t.get(l.service) ?? 0) + l.amount);
  return [...t].sort((a, b) => b[1] - a[1]);
};
/** The service the questions after multi/main/top are about: the main line, else the most expensive kind. */
const classified = (inv: Invoice): Service => (inv.main !== undefined ? inv.lines[inv.main].service : totals(inv)[0][0]);
const billHas = (inv: Invoice, ...s: Service[]) => inv.lines.some((l) => s.includes(l.service));

type Ask = (s: Service, inv: Invoice) => boolean;
/** One predicate per question id, answering the question text literally for the classified service. */
const ANSWERS: Record<string, Ask> = {
  multi: (_s, inv) => kinds(inv).length > 1, // more than one kind of service
  main: (_s, inv) => inv.main !== undefined, // one of them is the main reason
  top: (_s, inv) => { const t = totals(inv); return t[0][1] > t[1][1]; }, // strictly most expensive
  svc: (s) => !NOT_MEDICAL.has(s), // detail: No for transport, equipment/supplies, fee only
  dental: (s) => s.startsWith('dental-'),
  adm: (s) => FEE_ONLY.has(s),
  trans: (s) => TRANSPORT.has(s),
  air: (s) => s === 'air-ambulance',
  taxi: (s) => s === 'taxi',
  equip: (s) => EQUIPMENT.has(s),
  chair: (s) => s === 'wheelchair' || s === 'crutches',
  chair2: (s) => s === 'wheelchair',
  // fac "hospital or facility bill, not a doctor's own fee?": Yes for any invoice issued by a hospital (hospitalBill) and for
  // facility charges (ER, operating room or surgery centre, delivery suite, room, ICU). Standalone outpatient centres
  // (imaging, endoscopy, lab, dialysis, therapy, clinic) answer No: they are not a hospital, and the follow-ups
  // (ER, surgery, admission) show the question means hospital-type facility charges.
  fac: (s, inv) => FACILITY.has(s) || inv.hospitalBill === true,
  er: (s) => s === 'er-facility' || s === 'er-observation',
  surg: (_s, inv) => billHas(inv, 'surgery-facility', 'delivery-facility'), // "does this bill include"
  admit: (_s, inv) => billHas(inv, 'inpatient-room', 'icu'),
  sep: (s) => SEPARATE_FEE.has(s),
  nursebill: (s) => s.startsWith('nursing-'), // "a nursing bill (for example home nursing)"
  anes: (s) => s === 'anesthesiologist-fee',
  nurse: (s) => s.startsWith('nursing-'),
  read: (s) => READ.has(s),
  readkind: (s) => s.startsWith('radiologist-'),
  bxread: (s) => s === 'pathologist-read-biopsy',
  inpt: (s) => s === 'surgeon-fee-inpatient' || s === 'inpatient-physician-visit',
  cons: (s) => CONSULTATION.has(s), // therapies (physio, psychotherapy, OT, speech, acupuncture, chiropractic) answer No
  tele: (s) => s === 'telemedicine',
  home: (s) => s === 'house-call',
  spec: (s) => s === 'consultation-specialist' || s === 'dietitian', // "eye, heart, skin, psychiatry, dietitian, podiatrist, optometrist…"
  test: (s) => TEST.has(s),
  imgq: (s) => IMAGING.has(s),
  img: (s) => modality(s) === 'ultrasound',
  mag: (s) => ['mri', 'ct', 'pet'].includes(modality(s)),
  mri: (s) => modality(s) === 'mri',
  ct: (s) => modality(s) === 'ct',
  bb: (s) => s === 'mammogram' || s === 'bone-density',
  mam: (s) => s === 'mammogram',
  xr: (s) => s === 'xray',
  scope: (s) => SCOPE.has(s), // detail: colposcopy and urodynamic tests answer No
  gastro: (s) => s === 'gastroscopy',
  cysto: (s) => s === 'cystoscopy',
  org: (s) => ORGAN.has(s),
  heart: (s) => HEART.has(s),
  holter: (s) => s === 'holter',
  ecg: (s) => s === 'ecg',
  brain: (s) => s === 'eeg',
  lung: (s) => s === 'sleep-study',
  lung2: (s) => s === 'spirometry',
  aud: (s) => s === 'audiometry',
  bx: (s) => s === 'biopsy',
  lab: (s) => LAB.has(s), // detail: colposcopy and urodynamic tests count
  med: (s) => MEDICINE.has(s), // detail: transfusion and oxygen therapy answer No
  vac: (s) => s === 'vaccine',
  chemo: (s) => s === 'chemo',
  wound: (s) => s === 'wound-care',
  talk: (s) => THERAPY.has(s),
  pp: (s) => s === 'physio' || s === 'psychotherapy',
  physio: (s) => s === 'physio',
  occ: (s) => s === 'occupational-therapy',
  other: (s) => s === 'radiotherapy' || s === 'dialysis',
  radio: (s) => s === 'radiotherapy',
  acu: (s) => s === 'acupuncture' || s === 'chiropractic',
  acu2: (s) => s === 'acupuncture',
};

function run(inv: Invoice) {
  let st = start(flow);
  const trail: string[] = [];
  for (let i = 0; i < 100; i++) {
    const n = byId.get(st.nodeId)!;
    if (n.kind === 'result') return { id: n.id, text: n.text, trail };
    const ask = ANSWERS[n.id];
    if (!ask) throw new Error(`Simulator has no answer for question "${n.id}" (${n.text}); add a predicate.`);
    const yes = ask(classified(inv), inv);
    trail.push(`${n.id} "${n.text}" → ${yes ? 'Yes' : 'No'}`);
    st = step(flow, st, yes ? 0 : 1);
    if (st.error) throw new Error(`${inv.id}: step error ${st.error} at ${n.id}`);
  }
  throw new Error(`${inv.id}: no result after 100 steps`);
}

const SYM: Record<Invoice['currency'], string> = { USD: '$', EUR: '€', GBP: '£', BRL: 'R$', CHF: 'CHF ', AED: 'AED ', THB: '฿', SGD: 'S$' };
const money = (inv: Invoice, n: number) => `${SYM[inv.currency]}${n.toLocaleString('en-US')}`;
const title = (inv: Invoice) => `${inv.id} ${inv.lines.map((l) => `${l.desc} ${money(inv, l.amount)}`).join(' + ')} → ${inv.expected}`;
const explain = (inv: Invoice, r: ReturnType<typeof run>) =>
  `${inv.id} (${inv.provider})\n${inv.lines.map((l) => `  - ${l.desc}: ${money(inv, l.amount)} [${l.service}]`).join('\n')}\n` +
  `main: ${inv.main ?? 'none'}\ntrail:\n  ${r.trail.join('\n  ')}\nreached: ${r.id} "${r.text}"\nexpected: ${inv.expected}\nwhy: ${inv.why}`;

/** Result nodes no invoice reaches on purpose (none today). */
const UNCOVERED: string[] = [];

describe('Global Code Finder: invoices', () => {
  it('has 82 invoices with unique ids and positive amounts', () => {
    expect(INVOICES).toHaveLength(82);
    expect(new Set(INVOICES.map((i) => i.id)).size).toBe(INVOICES.length);
    for (const inv of INVOICES) {
      expect(inv.lines.length, inv.id).toBeGreaterThan(0);
      for (const l of inv.lines) expect(l.amount, `${inv.id} ${l.desc}`).toBeGreaterThan(0);
      if (inv.main !== undefined) expect(inv.lines[inv.main], inv.id).toBeDefined();
    }
  });

  for (const inv of INVOICES)
    it(title(inv), () => {
      const r = run(inv);
      expect(r.text, explain(inv, r)).toBe(inv.expected);
    });

  it('every result node is reached by a passing invoice, except the deliberate UNCOVERED list', () => {
    const reached = new Set(INVOICES.map((i) => run(i).id));
    const missing = flow.nodes.filter((n) => n.kind === 'result' && !reached.has(n.id) && !UNCOVERED.includes(n.id)).map((n) => n.id);
    expect(missing).toEqual([]);
    for (const id of ['r-outpt', 'r-a01', 'r-b00', 'r-er', 'r-inpatient', 'r-dentist', 'r-free', 'r-review', 'r-us', 'r-ecg', 'r-spiro'])
      expect(reached.has(id), id).toBe(true);
  });
});
