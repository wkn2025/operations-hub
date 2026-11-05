# Global Code Finder — Design

Status: approved in chat 2026-11-05. Source rules: `C:\Users\wkn\Downloads\GLOBAL_CODE_FINDER_IMPLEMENTATION.md` (business rules only; its architecture advice is superseded by this doc).

## Intent

Staff pick **one Global Code per invoice**. The finder is an easygoing guided flow: **every question has exactly two answers**, one question per screen, 3–7 taps to a result. Not overwhelming is the top priority; correctness of the business rules comes second to nothing but that.

## Goals / non-goals

Goals: full catalog (~50 codes); binary questions only; result shows code name (+ number where known), one-line reason, the rule applied; traceable rules; editable later by editors in the admin flow editor.
Non-goals: new engine, new UI, Copy button, numeric-code editor/importer, amounts input, coverage/medical-necessity decisions. Anti-goal: guessing an unresolved rule or inventing a code number.

## Implementation (decided)

- One new `SeedFlow` "Global Code Finder (DEMO)" in `apps/server/src/seed/content/flows.ts` (or a sibling file imported by it), `articleSlug` = the Finance "Global codes for invoice processing" article. Existing engine (`@ops/shared` flow runner, 200-node limit, `FLOW_LIMITS`) unchanged.
- Result nodes: `text` = `A01 · Consultation` / `Inpatient Treatment · code TBC`; `detail` = reason + rule applied (+ US check-up / certificate notes). `severity`: success for a code, warning for pending-rule and manual review, info for Free Choice.
- Known numbers (from the Finance article): **A00** Outpatient Physician Fees, **A01** Consultation, **B00** Inpatient Physician Fees, **B01** ER, **C12** Inpatient Treatment (Hospitalization), **M00** Dentist (user rulings 2026-11-05). All others "code TBC" — user fills later.

**User rulings 2026-11-05:**
1. Outpatient Physician Fees = **A00**, including a separately billed outpatient surgeon fee and a separate ER doctor fee. B00 is only for doctors treating or operating during an admission.
2. Anything dental = **M00 Dentist**, including a dental emergency billed as a hospital ER facility bill (overrides reference §5 "dental ER facility bill → ER"). Asked once, right after `svc` Yes.
- Footer wording in every result detail start/end is not repeated; the first question's `detail` states: classifies the invoice only, never coverage or necessity.
- Tests (`apps/server/test/`): `validateFlow` clean; every question has exactly 2 options; every scenario row of the reference §5 walked as an answer sequence through `startRun/answer`, asserting the result node; unresolved-rule results name both codes.

## Tree

Format: `id` "question" → Yes / No. Result ids start `r-`.

**Entry / several services**
- `multi` "Does this invoice include more than one kind of service?" → `main` / `svc`
- `main` "Is one of them the main reason for the invoice?" → `svc` (detail: answer for that service only) / `top`
- `top` "Is one of them clearly the most expensive?" → `svc` (same detail) / `r-free`
- `r-free` Free Choice: "Pick any of the tied codes"; rule: highest-value wins, exact tie = free choice, never silently chosen.

**Service or item**
- `svc` "Is this a medical service for the patient?" → `dental` / `adm`
- `dental` "Is it dental (dentist, dental emergency, prosthesis, orthodontics)?" → `r-dentist` (M00) / `fac`
- `adm` "Is it only a fee or tax, with no care or items?" → `r-admin` / `trans`
- `trans` "Is it for transport?" → `air` / `equip`
- `air` "Is it by air?" → `r-air` / `taxi`; `taxi` "Is it a taxi?" → `r-taxi` / `r-ambulance`
- `equip` "Is it equipment or supplies?" → `chair` / `r-review`
- `chair` "Is it a wheelchair or crutches?" → `chair2` / `r-materials`; `chair2` "Is it a wheelchair?" → `r-wheelchair` / `r-crutches`

**Facility bill**
- `fac` "Is this a hospital or facility bill, not a doctor's own fee?" → `er` / `sep`
- `er` "Is it for the hospital emergency room (observation without admission counts)?" → `r-er` / `surg`
- `surg` "Does this bill include a surgery or a delivery?" → `r-forfait` / `admit`
- `admit` "Was the patient admitted (room, ICU)?" → `r-inpatient` / `r-review`
- Ruling (mine): ER + surgery on one facility bill → ER (rule 4 order); flagged in `r-er` detail.

**Separate professional fee**
- `sep` "Is it a separate fee from a doctor, nurse or anesthesiologist, billed apart from a facility bill?" → `anes` / `cons`
- `anes` "Is it from the anesthesiologist?" → `r-anes` / `nurse`
- `nurse` "Is it for nursing services?" → `r-medfees` / `read`
- `read` "Is it only a radiologist or pathologist reading an image or sample?" → `readkind` / `inpt`
- `readkind` "Is it reading an image or scan?" → `img` / `bxread`; `bxread` "Is the sample described as a biopsy?" → `r-biopsy` / `r-analysis`
- `inpt` "Did the doctor treat or operate while the patient was admitted?" → `r-b00` (B00 Inpatient Physician Fees) / `r-outpt` (A00 Outpatient Physician Fees; includes outpatient surgeon and separate ER doctor)

**Consultation**
- `cons` "Is the main purpose to see a doctor?" → `tele` / `test`
- `tele` "Was it by video or phone?" → `r-tele` / `home`; `home` "Was it a house call?" → `r-home` / `spec`
- `spec` "Is the doctor a specialist (eye, heart, skin, psychiatry, dietitian…)?" → `r-spec` / `r-a01`
- `r-a01` detail: general consult, follow-up, urgent care, walk-in, US routine check-up (flagged for later review), certificate billed separately, non-surgical joint injection or nerve block; extra tests/medicines do not change it. Specialist at urgent care: confirm with team lead (backlog item 10).

**Test or scan**
- `test` "Is the main purpose a test or scan?" → `imgq` / `med`
- `imgq` "Is it an imaging scan?" → `img` / `scope`
- `img` "Is it an ultrasound?" → `r-us` (provisional: Ultrasonography) / `mag`
- `mag` "Is it a scanner with magnets or a ring (MRI, CT, PET)?" → `mri` / `bb`
- `mri` "Is it an MRI?" → `r-mri` / `ct`; `ct` "Is it a CT?" → `r-ct` / `r-pet`
- `bb` "Is it a breast or bone scan?" → `mam` / `xr`; `mam` "Is it a mammogram?" → `r-mam` / `r-bone`; `xr` "Is it a plain X-ray?" → `r-xray` / `r-review`
- `scope` "Is it a scope (a camera inside the body)?" → `gastro` / `org`
- `gastro` "Is it a gastroscopy (stomach)?" → `r-gastro` (biopsy on same invoice included) / `cysto`; `cysto` "Is it a cystoscopy (bladder)?" → `r-analysis-cysto` (Analysis, flagged for review) / `r-scopies` (colonoscopy incl. biopsy, other scopes)
- `org` "Is it a heart, brain, lung, sleep or hearing test?" → `heart` / `bx`
- `heart` "Is it a heart test?" → `holter` / `brain`; `holter` "Is it a Holter (wearable 24 h monitor)?" → `r-holter` / `ecg`; `ecg` "Is it an electrocardiogram tracing?" → `r-ecg` (provisional: ECG) / `r-cardtest`
- `brain` "Is it an EEG (brain)?" → `r-eeg` / `lung`; `lung` "Is it a sleep study?" → `r-sleep` / `lung2`; `lung2` "Is it a lung function test?" → `r-spiro` (Spirometry / Pulmonary Function Test, one entry) / `aud`; `aud` "Is it a hearing test?" → `r-audio` / `r-review`
- `bx` "Is it a biopsy (tissue sample)?" → `r-biopsy` / `lab`; `lab` "Is it a lab analysis of a sample (blood, urine, Pap smear…)?" → `r-analysis` / `r-review`

**Medicine or treatment**
- `med` "Is the main purpose to give or buy a medicine (pharmacy, injection, infusion, vaccine)?" → `vac` / `wound`
- `vac` "Is it a vaccination?" → `r-vac` / `chemo`; `chemo` "Is it chemotherapy?" → `r-chemo` / `r-medicines` (visit solely for non-chemo injection counts; incidental medicine on a consultation does not)
- `wound` "Is it a wound dressing, stitches, stitch removal or abscess drainage?" → `r-wound` (outside ER only) / `talk`
- `talk` "Is it physio, psychotherapy, occupational or speech therapy?" → `pp` / `other`
- `pp` "Is it physiotherapy or psychotherapy?" → `physio` / `occ`; `physio` → `r-physio` / `r-psycho`; `occ` "Is it occupational therapy?" → `r-ot` / `r-speech`
- `other` "Is it radiotherapy or dialysis?" → `radio` / `acu`; `radio` "Is it radiotherapy?" → `r-radio` / `r-dialysis`; `acu` "Is it acupuncture or chiropractic?" → `acu2` / `r-review`; `acu2` "Is it acupuncture?" → `r-acu` / `r-chiro`

**Review**
- `r-review` "Needs manual review": no matching code, no generic fallback; send to team lead. Also covers EMG, blood transfusion, oxygen therapy (backlog 8/9).

## Pending rules — Ruling (mine, user delegated 2026-11-05)

No dead ends: each unresolved pair gets a **provisional default**, shown as a `warning` result that names the alternative and says the business rule is not yet defined, so staff can confirm with their team lead.
- Ultrasound -> **Ultrasonography** (alternative: Ecography).
- Electrocardiogram -> **ECG** (alternative: EKG).
- Lung function test -> one catalog entry "Spirometry / Pulmonary Function Test"; detail says to use whichever matches the invoice wording if the master list has two codes.
Cost if wrong: an invoice coded with the sibling code until the user supplies the rule; change is one node's text. Still open: all numeric codes except A00/A01/B00/B01/C12/M00; other-country check-ups; Check-up code.

## Left to builder

Exact reason wording per result (from reference §4 tables); `detail` ≤ 1000 chars, `text` ≤ 400; scenario-to-answer-sequence encoding in tests.
