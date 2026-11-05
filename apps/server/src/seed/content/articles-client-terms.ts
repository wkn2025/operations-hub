import type { PmNode } from '@ops/shared';
import type { SeedArticle } from './articles';
import { REIMBURSEMENT_WI } from './articles-claims';
import { b, callout, collapsible, demo, h, ol, p, ref, steps, table, ul } from './pm';

/**
 * DEMO: full policy / contract wordings, written to read like real terms and conditions.
 * Insurers, clients, amounts, phone numbers and references are fictional.
 */

type Inline = string | PmNode;
interface Benefit {
  intro: Inline[];
  limits: string[][]; // Benefit | Limit | Excess | Notes
  covered: string[];
  conditions: string[];
  excluded: string[];
  contact: Inline[];
}

/** One numbered benefit section: limits table, then covered / conditions / not covered / when to contact assistance. */
const benefit = (n: number, title: string, x: Benefit): PmNode[] => [
  h(2, `${n}. ${title}`),
  p(...x.intro),
  table(['Benefit', 'Limit', 'Excess', 'Notes'], ...x.limits),
  h(3, `${n}.1 What is covered`), ul(...x.covered),
  h(3, `${n}.2 Conditions`), ul(...x.conditions),
  h(3, `${n}.3 What is not covered`), ul(...x.excluded),
  h(3, `${n}.4 When to contact assistance`), p(...x.contact),
];

const DEMO_PHONE = '+00 000 0000 000 (DEMO number)';

const wayfarer = 'Wayfarer Family Travel Plan: policy terms and conditions';
const bluefinTc = 'Bluefin Corporate Health: full terms and conditions';

const WAYFARER: SeedArticle = {
  title: wayfarer,
  type: 'client_terms',
  category: 'Clients & Terms and Conditions',
  owner: 'admin',
  tags: ['wayfarer', 'travel insurance', 'family', 'policy wording', 'terms and conditions'],
  reviewDate: '2027-12-01',
  fields: {
    summary: 'Full policy wording for the Wayfarer single-trip and annual multi-trip family travel plan: emergency medical, repatriation, cancellation, luggage and liability, with the assistance procedure the insured must follow.',
    client: 'Wayfarer Travel Insurance Ltd (fictional)', line: 'travel', docKind: 'full', contractRef: 'WAY-FAM-2027-DEMO', validFrom: '2027-01-01', validTo: '2027-12-31',
    region: 'Area 1 Europe / Area 2 Worldwide excl. USA, Canada, Caribbean / Area 3 Worldwide',
    keyLimits: [
      { label: 'Emergency medical expenses', value: 'EUR 3,000,000 per insured person' },
      { label: 'Authorise without client', value: 'EUR 5,000' },
      { label: 'Standard excess', value: 'EUR 100 per insured person per claim' },
      { label: 'Trip cancellation', value: 'EUR 5,000 per person' },
      { label: 'Luggage', value: 'EUR 2,000 (single item EUR 300)' },
      { label: 'Max trip length (annual plan)', value: '45 days per trip' },
    ],
  },
  content: [
    demo(),
    p(b('Wayfarer Travel Insurance Ltd (fictional)'), ' underwrites this policy. The 24-hour emergency assistance service is provided on its behalf by the Assistance Company (us). This wording, the policy schedule and any endorsement together form the contract. Please read it carefully: some sections have conditions that, if not met, may reduce or remove cover.'),
    callout('warning', 'Contact assistance before treatment', p('If you are admitted to hospital, need to be moved or brought home, or expect medical costs above EUR 500, the insured (or someone on their behalf) must call the 24-hour assistance line ', b(DEMO_PHONE), ' before any arrangements are made. Costs not approved by assistance may not be covered.')),

    h(2, '1. Definitions'),
    p('Words in this wording have the meaning below wherever they appear.'),
    table(['Term', 'Meaning'],
      ['Assistance / we / us', 'The Assistance Company, appointed by the insurer to manage emergencies and claims 24 hours a day.'],
      ['Insurer', 'Wayfarer Travel Insurance Ltd (fictional).'],
      ['You / insured person', 'Each person named on the policy schedule for whom the premium has been paid.'],
      ['Family', 'Up to two adults living at the same address and their children (including step, foster and adopted children) under 23 in full-time education.'],
      ['Home country', 'The country where you have lived for at least 6 of the last 12 months and are registered with a doctor.'],
      ['Trip', 'A journey that starts and ends in your home country within the period of cover, including a holiday more than 25 km from home with a pre-booked overnight stay.'],
      ['Medical emergency', 'A sudden and unforeseen illness or injury that needs immediate treatment and cannot reasonably wait until you return home.'],
      ['Treating doctor', 'A registered medical practitioner, not related to you, who treats you during the trip.'],
      ['Pre-existing medical condition', 'Any condition for which, in the 24 months before cover started or the trip was booked (whichever is later), you had symptoms, tests, treatment, medication or a change in medication, or were awaiting investigation.'],
      ['Excess', 'The amount you pay towards each claim, per insured person, per section.'],
      ['Valuables', 'Jewellery, watches, cameras, drones, laptops, tablets, phones, binoculars, musical instruments and items made of precious metals.'],
      ['Personal money', 'Cash, travellers cheques and prepaid travel cards held for private use.'],
      ['GOP', 'Guarantee of payment: a written promise by assistance to a hospital to pay covered costs (section 13).'],
      ['Close relative', 'Spouse or partner, parent, child, sibling, grandparent, grandchild, parent-in-law, son- or daughter-in-law.']),

    h(2, '2. Eligibility and territory'),
    h(3, '2.1 Who can be insured'),
    ul('Residents of the European Economic Area or Switzerland aged under 80 at the start of the period of cover (single-trip) or at renewal (annual plan).',
      'Children under 2 travel free when named on the schedule with at least one insured adult.',
      'Children travelling without an insured adult are covered only on school or organised group trips.'),
    h(3, '2.2 Territory'),
    table(['Area', 'Countries', 'Notes'],
      ['Area 1 Europe', 'Europe, including Canary Islands, Madeira, Cyprus, Turkey and Mediterranean islands', 'Includes cruises in the Mediterranean'],
      ['Area 2 Worldwide excl. USA', 'Worldwide except USA, Canada and the Caribbean', 'A stopover in the USA of up to 72 hours is covered'],
      ['Area 3 Worldwide', 'Worldwide', 'Required for any trip to the USA, Canada or the Caribbean']),
    p('No cover applies in your home country, except sections 16 (Trip cancellation and curtailment) and 17 (Travel delay) for domestic trips with a pre-booked overnight stay. Travel to a country or area where the government foreign travel advisory advises against all travel is excluded (see section 21).'),

    h(2, '3. Period of cover'),
    ul('Cancellation cover (section 16) starts on the date of booking the trip or the date the policy is issued, whichever is later.',
      'All other sections start when you leave home to begin the trip and end when you return home or at the end of the period of cover, whichever is earlier.',
      'Annual plan: any number of trips in 12 months, each no longer than 45 days. A trip longer than 45 days is not covered at all, not only for the excess days.',
      'Automatic extension: if your return is delayed by an event covered by this policy, cover is extended free of charge until you can reasonably return, up to 30 days.',
      'Winter sports are covered for up to 17 days per policy year only if the schedule shows the winter sports extension.'),

    ...benefit(4, 'Emergency medical expenses (illness and injury)', {
      intro: ['Covers reasonable and customary costs of emergency treatment abroad for a sudden illness or accidental injury during the trip.'],
      limits: [
        ['Emergency medical and hospital expenses', 'EUR 3,000,000', 'EUR 100', 'Per insured person per trip'],
        ['Emergency outpatient treatment', 'Included', 'EUR 100', 'Receipts and medical report required'],
        ['Hospital daily benefit', 'EUR 50 per day, max EUR 1,000', 'None', 'Per full 24 hours as an inpatient abroad'],
        ['Telephone and taxi costs to hospital', 'EUR 250', 'None', 'Must be receipted'],
      ],
      covered: ['Fees of the treating doctor, surgeon and anaesthetist.', 'Hospital accommodation in a standard semi-private room, including intensive care.', 'Diagnostic tests, X-rays and scans ordered by the treating doctor.', 'Emergency ambulance to the nearest suitable hospital.', 'Extra accommodation and travel costs if the treating doctor and assistance agree you cannot travel home on the planned date.'],
      conditions: ['Treatment must be medically necessary and unable to wait until you return home.', 'Inpatient admission and any costs above EUR 500 must be reported to assistance as soon as possible and at the latest within 48 hours.', 'Assistance may ask our medical team to speak to the treating doctor and may move you to another hospital or bring you home once fit to travel.', 'If you refuse to be moved or repatriated when assistance and the treating doctor agree it is safe, cover for further medical expenses ends on that date.'],
      excluded: ['Treatment that can reasonably wait until your return home (non-emergency or planned treatment).', 'Treatment after the date assistance considers you fit to return home.', 'Private room supplements and personal comfort items (TV, telephone, meals for visitors).', 'Costs in your home country.', 'Any trip made against medical advice or to obtain treatment.'],
      contact: ['Call assistance before admission, or if not possible, within 48 hours of admission. For outpatient treatment under EUR 500 you can pay and claim later (section 13).'],
    }),

    h(2, '5. Pre-existing medical conditions'),
    p('This section applies to every section of the policy. It is the most common reason a claim is declined, so it is set out in full.'),
    h(3, '5.1 Stable-condition rule'),
    p('A pre-existing medical condition is covered without declaration only if, in the 6 months before cover started or before booking the trip (whichever is later), it was ', b('stable and controlled'), ':'),
    ul('no new symptoms or worsening of symptoms;', 'no change in medication or dose (a dose change ordered as routine monitoring is allowed);', 'no hospital admission, surgery or referral to a specialist;', 'no tests or investigations awaited, and no terminal prognosis.'),
    h(3, '5.2 Declared conditions'),
    ul('Conditions that do not meet the stable-condition rule must be declared using the medical screening questions when you buy the policy and again whenever your health changes before a trip.',
      'Accepted conditions are listed on the schedule, may carry an additional premium and may have a higher excess of EUR 250 per claim.',
      'The insurer may decline to cover a declared condition; all other conditions and insured persons remain covered.'),
    h(3, '5.3 Undeclared conditions'),
    ul('Claims arising from a pre-existing condition that should have been declared and was not are not covered.', 'Assistance will still help you obtain treatment, but costs will be at your own expense and assistance may ask for a deposit or credit card guarantee before issuing any GOP.'),
    callout('info', 'Assistance handling', p('When a case involves a known condition, the case manager checks the schedule for declared conditions before issuing a GOP. If the condition is not declared, request the GP history (24 months) as described in the medical records step of ', ref(REIMBURSEMENT_WI), ', and issue a GOP only for costs clearly unrelated to the condition.')),

    ...benefit(6, 'Medical evacuation and repatriation', {
      intro: ['Covers transport to a suitable hospital or back to your home country when medically necessary and arranged by assistance.'],
      limits: [
        ['Medical evacuation to nearest suitable hospital', 'Included in EUR 3,000,000', 'None', 'Assistance arranges'],
        ['Repatriation to home country', 'Included in EUR 3,000,000', 'None', 'Economy, stretcher or air ambulance'],
        ['Medical escort', 'Included', 'None', 'Doctor or nurse appointed by assistance'],
        ['Return of travelling companion', 'Economy one-way', 'None', 'One insured person'],
      ],
      covered: ['Road or air ambulance when the local facility cannot provide adequate treatment.', 'Repatriation by scheduled flight (with extra seats, business class or a stretcher if medically required) or by air ambulance.', 'A medical escort when the assistance doctor considers it necessary.', 'Transport to your home or a hospital near your home.'],
      conditions: ['The move must be medically necessary, decided by the assistance medical team after speaking to the treating doctor. Convenience or preference is not a medical reason.', 'Assistance chooses the means, timing and destination of transport. Air ambulance is used only when a scheduled flight is medically unsafe.', 'The arrangements must be made by assistance. Transport arranged without assistance approval is reimbursed only up to what assistance would have paid for an economy flight.'],
      excluded: ['Repatriation requested only because you prefer treatment at home when adequate treatment is available locally.', 'Evacuation from a country under a travel advisory against all travel at the time of departure.', 'Your original return ticket if unused: it must be handed to assistance or its value is deducted.'],
      contact: ['Always, before any transfer or repatriation. Assistance will not reimburse a self-arranged air ambulance.'],
    }),

    ...benefit(7, 'Repatriation of mortal remains', {
      intro: ['If an insured person dies during the trip, assistance arranges and pays for the return of the body or ashes to the home country.'],
      limits: [
        ['Repatriation of remains or ashes', 'EUR 15,000', 'None', 'Includes standard transport coffin'],
        ['Local burial or cremation abroad', 'EUR 5,000', 'None', 'Alternative to repatriation'],
        ['Return of companions', 'Economy one-way', 'None', 'Insured persons travelling with the deceased'],
      ],
      covered: ['Embalming, a zinc-lined transport coffin, required documentation and transport to the nearest airport to the home address.', 'Or local burial or cremation and the return of ashes.'],
      conditions: ['The death must result from an illness or injury covered by this policy.', 'Arrangements are made by assistance with the next of kin.'],
      excluded: ['The funeral in the home country, headstone, flowers or ceremony costs.', 'Deaths caused by an excluded cause (section 21).'],
      contact: ['As soon as possible. Assistance appoints the local funeral director and handles consular paperwork.'],
    }),

    ...benefit(8, 'Preventive care, vaccinations and routine check-ups', {
      intro: ['This is a travel policy for emergencies. Preventive and routine care is generally ', b('not covered'), '; only the limited benefit below applies.'],
      limits: [
        ['Emergency post-exposure treatment', 'Included in medical expenses', 'EUR 100', 'Rabies or tetanus after a bite or wound abroad'],
        ['Routine vaccinations and check-ups', 'Not covered', 'n/a', 'Arrange before travel'],
        ['Malaria prophylaxis', 'Not covered', 'n/a', 'Failure to take advised prophylaxis may affect a malaria claim'],
      ],
      covered: ['Emergency post-exposure prophylaxis (for example rabies or tetanus injections after an animal bite or contaminated wound) when the treating doctor says it cannot wait.'],
      conditions: ['Post-exposure treatment must start during the trip.'],
      excluded: ['Pre-travel vaccinations, travel clinic consultations and anti-malaria tablets.', 'Routine check-ups, screening, monitoring of a known condition, and repeat prescriptions.', 'Contraception and fertility treatment.'],
      contact: ['Call assistance for advice on where to obtain post-exposure treatment; many areas have limited rabies vaccine supply.'],
    }),

    ...benefit(9, 'Pregnancy and childbirth', {
      intro: ['Pregnancy is not an illness. Only unexpected complications during the trip are covered.'],
      limits: [
        ['Complications of pregnancy', 'Included in EUR 3,000,000', 'EUR 100', 'Up to the end of week 32 (week 28 for multiple pregnancy)'],
        ['Premature birth abroad', 'Included in EUR 3,000,000', 'EUR 100', 'Before the gestation limit only'],
        ['Newborn care', 'EUR 100,000', 'None', 'Baby born abroad after a covered complication'],
      ],
      covered: ['Emergency treatment for complications such as pre-eclampsia, ectopic pregnancy, miscarriage, haemorrhage or premature labour.', 'Premature birth before the gestation limit, and emergency care of the newborn until it is fit to travel home.', 'Cancellation (section 16) if you become pregnant after booking and the trip would be past the gestation limit.'],
      conditions: ['Travel must end by week 32 of pregnancy (week 28 for twins or more). Carry a doctor\'s letter confirming the due date.', 'The pregnancy must have no known complications at the time of booking.'],
      excluded: ['Routine antenatal care, scans and check-ups.', 'Normal childbirth, or any birth after the gestation limit.', 'Pregnancy following fertility treatment if the trip starts within 12 weeks of the treatment, unless declared.', 'Travel against medical or airline advice.'],
      contact: ['Immediately on any pregnancy-related admission. The assistance doctor will review the gestation and the treating doctor\'s report before issuing a GOP.'],
    }),

    ...benefit(10, 'Mental health', {
      intro: ['Covers an acute mental-health crisis that starts suddenly during the trip.'],
      limits: [
        ['Acute psychiatric inpatient care', 'EUR 15,000', 'EUR 100', 'Within the medical expenses limit'],
        ['Repatriation with escort', 'Included in section 6', 'None', 'When assistance considers it necessary'],
        ['Outpatient psychiatric care', 'EUR 1,000', 'EUR 100', 'Max 5 sessions'],
      ],
      covered: ['Emergency psychiatric admission and stabilisation.', 'Repatriation with a psychiatric nurse or doctor when required.'],
      conditions: ['The condition must be diagnosed by a psychiatrist or treating doctor.', 'Conditions treated in the last 24 months are pre-existing (section 5).'],
      excluded: ['Stress, anxiety or depression not requiring admission, except the outpatient benefit.', 'Conditions related to alcohol, drugs or solvent abuse.', 'Fear of travel, or not wanting to travel.'],
      contact: ['As soon as possible. Assistance can involve its own psychiatrist and arrange a safe environment.'],
    }),

    ...benefit(11, 'Dental emergency', {
      intro: ['Emergency dental treatment for the immediate relief of pain abroad.'],
      limits: [['Emergency dental treatment', 'EUR 400', 'EUR 50', 'Pain relief only'], ['Accidental damage to sound natural teeth', 'EUR 1,000', 'EUR 50', 'Accident during the trip']],
      covered: ['Pain relief, temporary fillings, extraction where needed.', 'Treatment after an accident to sound natural teeth.'],
      conditions: ['Treatment must not be able to wait until you return home.'],
      excluded: ['Permanent fillings, crowns, bridges, implants, dentures, and repairs to dentures or implants.', 'Routine and cosmetic dental work.', 'Damage while eating.'],
      contact: ['Only if the cost will exceed EUR 400; otherwise pay and claim later.'],
    }),

    ...benefit(12, 'Prescription medication', {
      intro: ['Medication prescribed abroad for a covered illness or injury, and replacement of lost essential medication.'],
      limits: [['Medication for a covered condition', 'Included in medical expenses', 'EUR 100', 'Prescription required'], ['Replacement of lost or stolen essential medication', 'EUR 300', 'None', 'Includes delivery by assistance']],
      covered: ['Prescribed medication for a covered medical emergency.', 'Replacement or delivery of essential prescribed medication that was lost or stolen during the trip.'],
      conditions: ['Keep the prescription and the pharmacy receipt.', 'For lost medication, a police or carrier report is needed.'],
      excluded: ['Medication you knew you would need during the trip but did not take with you.', 'Over-the-counter remedies, vitamins and supplements.'],
      contact: ['Call assistance if you cannot obtain your medication locally; assistance will try to source or courier it.'],
    }),

    h(2, '13. Hospital direct billing, guarantee of payment (GOP) and claims procedure'),
    h(3, '13.1 Guarantee of payment'),
    ul('For inpatient treatment, assistance contacts the hospital and, once cover is confirmed, issues a guarantee of payment so you do not pay the hospital yourself.',
      'Assistance can approve up to EUR 5,000 without referring to the insurer. Above that, approval is obtained from the insurer, usually within 4 hours.',
      'The GOP covers only the reasonable and customary costs of covered treatment. The excess and any non-covered costs are recovered from you.'),
    h(3, '13.2 Claims procedure'),
    steps(
      { title: 'Notify', body: [p('Report the claim within 30 days of returning home through the assistance portal or by e-mail to claims@demo.test.')] },
      { title: 'Send documents', body: [p('Original itemised invoices and receipts, the medical report, policy number, proof of travel dates, and for luggage a police report within 24 hours of discovery.')] },
      { title: 'Assessment', body: [p('Assistance assesses the claim within 15 working days of receiving all documents and may ask for medical records or a medical examination.')] },
      { title: 'Payment', body: [p('Payment is made by bank transfer in euro, minus the excess. Our internal handling: ', ref(REIMBURSEMENT_WI), '.')] },
    ),

    ...benefit(14, 'Luggage and personal belongings', {
      intro: ['Covers loss, theft of or damage to your own luggage and personal belongings during the trip, and essentials bought when luggage is delayed.'],
      limits: [
        ['Luggage total', 'EUR 2,000', 'EUR 100', 'Per insured person'],
        ['Single item, pair or set', 'EUR 300', 'EUR 100', 'Value after wear and tear'],
        ['Valuables in total', 'EUR 500', 'EUR 100', 'Must be carried with you'],
        ['Delayed luggage', 'EUR 100 per 12 hours, max EUR 400', 'None', 'Delay over 12 hours on the outward journey'],
      ],
      covered: ['Loss, theft or accidental damage, paid at replacement value less wear and tear, or the cost of repair.', 'Essential clothing and toiletries bought because luggage is delayed by the carrier on the outward journey.'],
      conditions: ['Theft must be reported to the police within 24 hours and a written report obtained.', 'Loss or delay by an airline must be reported at the airport and a Property Irregularity Report (PIR) obtained.', 'Valuables must be on your person, in a locked safe or in a locked room; never in checked-in luggage.'],
      excluded: ['Items left unattended in a public place or in an unattended vehicle between 21:00 and 07:00.', 'Valuables in checked-in luggage.', 'Breakage of fragile items, sports equipment while in use, wear and tear.', 'Contact lenses, hearing aids, dentures, mobility aids (unless damaged in transit by a carrier).'],
      contact: ['Not needed for the claim itself. Call assistance if documents or tickets are lost too (sections 15 and 20).'],
    }),

    ...benefit(15, 'Personal money and documents', {
      intro: ['Covers theft or loss of personal money and the cost of replacing travel documents.'],
      limits: [['Personal money', 'EUR 500', 'EUR 100', 'Cash limit EUR 300 (EUR 50 for under 18s)'], ['Passport and travel documents', 'EUR 400', 'None', 'Emergency passport, travel and accommodation costs']],
      covered: ['Stolen or lost cash carried on your person or held in a locked safe.', 'Cost of an emergency travel document and extra travel or accommodation to obtain it.'],
      conditions: ['Report to the police within 24 hours and keep the report.', 'Provide proof of withdrawal or exchange of the cash.'],
      excluded: ['Money left unattended or in checked-in luggage.', 'Shortages due to error or exchange-rate loss.'],
      contact: ['Call assistance immediately for help with the nearest embassy or consulate.'],
    }),

    ...benefit(16, 'Trip cancellation and curtailment', {
      intro: ['Covers irrecoverable trip costs if you must cancel before departure, or cut short (curtail) the trip, for one of the reasons below.'],
      limits: [['Cancellation', 'EUR 5,000', 'EUR 100', 'Per insured person; EUR 15,000 per family'], ['Curtailment', 'EUR 5,000', 'EUR 100', 'Unused portion of the trip, pro rata per day'], ['Extra travel home on curtailment', 'Economy', 'None', 'Arranged by assistance']],
      covered: ['Death, serious injury or illness of you, a travelling companion or a close relative.', 'Being called for jury service or as a witness, or compulsory quarantine.', 'Serious damage to your home by fire, flood or burglary within 7 days of departure.', 'Redundancy (for those employed for 2 years or more).', 'A government advisory against all travel issued after booking.'],
      conditions: ['Cancel with the travel provider as soon as you know you cannot travel; the insurer pays only the charges that would have applied at that time.', 'A medical certificate from the treating doctor is required for medical reasons.', 'For curtailment, assistance must be contacted before you return home.'],
      excluded: ['Not wanting to travel, or financial circumstances (other than redundancy).', 'Pre-existing conditions not covered under section 5.', 'Failure by a travel provider; claim from the provider, card issuer or bonding scheme first.', 'Costs recoverable from another source.'],
      contact: ['For curtailment: before you return home. For cancellation: notify the claim within 30 days.'],
    }),

    ...benefit(17, 'Travel delay and missed departure', {
      intro: ['Compensation if your outbound or return public transport is delayed, and extra costs if you miss your departure.'],
      limits: [['Travel delay benefit', 'EUR 50 per 12 hours, max EUR 300', 'None', 'Delay over 12 hours'], ['Abandonment after 24 hours delay (outward)', 'As cancellation', 'EUR 100', 'Section 16 limit'], ['Missed departure', 'EUR 750', 'EUR 100', 'Extra travel and accommodation']],
      covered: ['Delay caused by strike, adverse weather or mechanical breakdown of the scheduled carrier.', 'Missed departure caused by an accident or breakdown of the vehicle you are travelling in, or public transport failure.'],
      conditions: ['You must check in on time and obtain written confirmation of the delay from the carrier.'],
      excluded: ['Delays announced before you bought the policy or booked the trip.', 'Delays you can claim from the carrier under passenger rights rules, to the extent paid.'],
      contact: ['Not required; claim afterwards with the carrier confirmation.'],
    }),

    ...benefit(18, 'Personal liability', {
      intro: ['Covers your legal liability to pay compensation for accidental bodily injury to others or damage to their property during the trip.'],
      limits: [['Personal liability', 'EUR 2,000,000', 'EUR 250', 'Per event, including legal costs'], ['Damage to rented accommodation', 'EUR 50,000', 'EUR 250', 'Accommodation and its contents']],
      covered: ['Damages and claimant costs you are legally liable to pay.', 'Legal costs incurred with the insurer\'s written consent.'],
      conditions: ['Do not admit liability or make any offer or payment without the insurer\'s written consent.', 'Send any letter, claim or summons to the insurer immediately and unanswered.'],
      excluded: ['Liability from motor vehicles, aircraft, boats or jet skis, or firearms.', 'Liability to members of your family or travelling party.', 'Business or professional activities.', 'Contractual liability and fines.'],
      contact: ['Report to the insurer through assistance within 7 days of the incident.'],
    }),

    ...benefit(19, 'Compassionate visit and accompanying child', {
      intro: ['Travel and accommodation for a relative to be with you if you are hospitalised alone, and care of children travelling with you.'],
      limits: [['Compassionate visit (travel)', 'Economy return', 'None', 'Hospitalised alone for more than 5 days'], ['Compassionate visit (accommodation)', 'EUR 100 per night, max EUR 1,000', 'None', 'Room only'], ['Escort and return of accompanying child', 'Economy fares + escort', 'None', 'Children under 16 left alone']],
      covered: ['Return travel for one relative or friend to stay with you.', 'If you are hospitalised or die and children under 16 travelling with you are left without an adult, return travel for the children with an escort chosen by the family or by assistance.'],
      conditions: ['The treating doctor must confirm the inpatient stay will exceed 5 days, or that you are in a critical condition (any duration).', 'Arranged by assistance.'],
      excluded: ['Meals, taxis and personal expenses of the visitor.', 'Visits when another insured adult is already travelling with you.'],
      contact: ['Before the visitor books travel.'],
    }),

    ...benefit(20, 'Assistance services (no extra charge)', {
      intro: ['Practical help provided by assistance 24 hours a day, whether or not a claim is payable.'],
      limits: [['Medical advice and referral', 'Unlimited calls', 'None', 'Doctor on call'], ['Emergency cash advance', 'EUR 1,000', 'None', 'Against a guarantee; repayable'], ['Interpreter and message relay', 'Included', 'None', '']],
      covered: ['Referral to doctors, clinics and pharmacies.', 'Relay of urgent messages to family or employer.', 'Help with lost documents and contact with embassies.', 'Advance of emergency cash against a credit-card guarantee.'],
      conditions: ['Services are provided on a best-effort basis; assistance is not responsible for the quality of third-party services.'],
      excluded: ['Costs of the third-party service itself unless covered under another section.'],
      contact: [`At any time on ${DEMO_PHONE}.`],
    }),

    h(2, '21. General exclusions'),
    p('These exclusions apply to all sections, in addition to the exclusions in each section.'),
    collapsible('General exclusions (full list)', ol(
      'Pre-existing medical conditions that are not covered under section 5.',
      'Travel to a country or area where the government advises against all travel or all but essential travel at the start of the trip.',
      'War, invasion, act of foreign enemy, hostilities (whether war is declared or not), civil war, rebellion, revolution or military power. Terrorism is not excluded for medical expenses and repatriation unless nuclear, biological or chemical.',
      'Nuclear, biological or chemical contamination, ionising radiation and radioactivity.',
      'Suicide, attempted suicide or deliberate self-injury, or deliberately putting yourself at needless risk (except to save life).',
      'Being under the influence of alcohol (blood alcohol above twice the local driving limit) or drugs not prescribed by a doctor.',
      'Hazardous activities not listed as covered, including mountaineering above 4,000 m, motor racing, professional sports, and winter sports without the extension.',
      'Riding a motorcycle above 125cc, or any motorcycle without a helmet or the licence required in your home country.',
      'Manual work, the armed forces, or crew of an aircraft or vessel.',
      'Unlawful acts, or acts which result in your arrest or imprisonment.',
      'Loss caused by an epidemic or pandemic, except medical expenses, repatriation and cancellation if you personally are diagnosed.',
      'Any loss that is not directly covered by the terms, such as loss of enjoyment or loss of earnings.',
    )),

    h(2, '22. General conditions'),
    h(3, '22.1 Your duties'),
    ul('Take all reasonable care to prevent loss and to minimise any claim.', 'Answer the medical and other questions honestly and tell us of any change before travelling.', 'Give assistance access to medical records relevant to a claim, and allow a medical examination if requested.'),
    h(3, '22.2 Fraud'),
    p('If any claim is fraudulent or exaggerated, the insurer will not pay it, may cancel the policy from the date of the fraud, keep the premium, recover any payments already made, and inform the police.'),
    h(3, '22.3 Subrogation and recovery'),
    p('The insurer may take over your rights against any third party (for example a carrier or a liable person) and pursue them in your name. You must help with any recovery and must not settle with a third party without consent. Any refunds you receive for covered costs must be passed to the insurer.'),
    h(3, '22.4 Other insurance'),
    p('If another policy, a public health scheme (such as the European Health Insurance Card) or a card issuer also covers the loss, the insurer pays only its proportionate share. EU residents travelling in Europe must use the EHIC or GHIC where it applies; in that case the medical excess is waived.'),
    h(3, '22.5 Sanctions'),
    p('The insurer and assistance will not provide cover, pay any claim or provide any service where doing so would expose them to a sanction, prohibition or restriction under United Nations resolutions or the trade or economic sanctions of the European Union, United Kingdom or United States.'),
    h(3, '22.6 Cancellation of the policy'),
    p('You may cancel within 14 days of purchase for a full refund, provided no trip has started and no claim is made. After that, no refund is due on single-trip policies.'),
    h(3, '22.7 Complaints'),
    ol('Contact the assistance complaints team at complaints@demo.test (fictional). We acknowledge within 5 working days.', 'If you are not satisfied with our final response, or we have not responded within 8 weeks, you may refer the complaint to the financial ombudsman service of the insurer\'s country, free of charge.'),
    h(3, '22.8 Governing law and jurisdiction'),
    p('This policy is governed by the law of the country where it was sold (DEMO: Ireland), and the courts of that country have jurisdiction unless otherwise agreed. Policy documents and communications are in English.'),

    h(2, '23. How to contact assistance'),
    table(['When', 'What to do', 'Contact'],
      ['Hospital admission, transfer, repatriation, costs above EUR 500', 'Call before treatment or within 48 hours', DEMO_PHONE],
      ['Death abroad', 'Call immediately', DEMO_PHONE],
      ['Small outpatient costs, luggage, delay', 'Pay and claim within 30 days of return', 'claims@demo.test (fictional)'],
      ['Complaint', 'E-mail with policy number', 'complaints@demo.test (fictional)']),
    p('Have ready: policy number ', b('WAY-FAM-2027-DEMO'), ', your name and date of birth, your location and a contact phone number, the name and phone number of the treating doctor or hospital, and a short description of what happened.'),
    callout('tip', 'For case managers', p('Wayfarer cases: check the schedule for the area of cover (Area 3 is required for the USA) and for declared conditions before issuing a GOP. Authority without referral is EUR 5,000.')),
  ],
};

const BLUEFIN: SeedArticle = {
  title: bluefinTc,
  type: 'client_terms',
  category: 'Clients & Terms and Conditions',
  owner: 'admin',
  tags: ['bluefin', 'corporate', 'business travel', 'duty of care', 'terms and conditions'],
  reviewDate: '2027-03-31',
  fields: {
    summary: 'Full contract wording for the Bluefin group business-travel and employee medical assistance programme: employer pre-approval, authorisation thresholds, security evacuation, dependants and annual aggregate limits.',
    client: 'Bluefin Corporate Health (fictional)', line: 'corporate', docKind: 'full', contractRef: 'BF-CORP-2026-DEMO', validFrom: '2026-04-01', validTo: '2027-03-31', region: 'Worldwide incl. USA',
    keyLimits: [
      { label: 'Medical expenses', value: 'USD 1,000,000 per person per trip' },
      { label: 'Annual aggregate (all travellers)', value: 'USD 25,000,000' },
      { label: 'Authorise without client', value: 'USD 10,000' },
      { label: 'Excess per claim', value: 'None' },
      { label: 'Security evacuation', value: 'USD 150,000 per person' },
      { label: 'Max trip length', value: '180 days' },
    ],
  },
  content: [
    demo(),
    p('This contract is made between ', b('Bluefin Corporate Health (fictional)'), ' (the client, the employer) and the Assistance Company (us). It sets out the medical, travel and security assistance we provide to Bluefin travellers and the terms on which we pay or guarantee costs. Authorisation limits are set out in section ', b('Authorisation thresholds'), '.'),
    callout('warning', 'Employer pre-approval and travel registration', p('Cover applies only to trips registered in the Bluefin travel-booking tool and approved by the traveller\'s line manager before departure. Assistance verifies registration in the daily traveller feed before issuing any guarantee.')),

    h(2, '1. Definitions'),
    table(['Term', 'Meaning'],
      ['Client / employer', 'Bluefin Corporate Health (fictional) and its group companies listed in Schedule A.'],
      ['Assistance / we / us', 'The Assistance Company, providing 24/7 medical, travel and security assistance under this contract.'],
      ['Traveller', 'An employee, director or contractor of the client named in the traveller feed for a registered business trip.'],
      ['Dependant', 'A spouse or partner and unmarried children under 25 of the traveller who accompany them on a registered trip or long-term assignment.'],
      ['Business trip', 'A trip outside the traveller\'s home country registered in the client\'s travel tool, including up to 14 days of private travel added to it.'],
      ['Long-term assignment', 'A posting abroad of 91 to 180 days approved by the client\'s HR team.'],
      ['Home country', 'The country of the traveller\'s permanent residence or, for assignees, the country of their employment contract.'],
      ['Travel-risk desk', 'The client\'s 24/7 security and travel team that approves high-cost or security decisions.'],
      ['Authorisation threshold', 'The cost level above which assistance needs client approval (section 3).'],
      ['Annual aggregate', 'The maximum the client funds for all travellers in one contract year.'],
      ['Medical necessity', 'Treatment or transport that the assistance medical director considers necessary, appropriate and not for convenience.'],
      ['Security event', 'Civil unrest, armed conflict, terrorism, natural disaster or a government evacuation order that threatens a traveller\'s safety.']),

    h(2, '2. Eligibility and territory'),
    ul('All travellers and dependants named in the daily traveller feed, without age limit and without medical underwriting (subject to section 6).',
      'Territory: worldwide, including the USA and Canada. Cover does not apply in the home country, except emergency assistance services within 100 km of the airport on the outbound and inbound journey.',
      'Countries rated "extreme risk" by the client\'s security provider need prior written approval from the travel-risk desk. Travel to sanctioned destinations is not covered (section 23).',
      'The client sends a traveller feed every 24 hours (name, employee ID with prefix BF-, destination, dates, line manager). Assistance uses it to confirm eligibility and to locate travellers during a security event.'),

    h(2, '3. Period of cover, authorisation thresholds and annual aggregate'),
    h(3, '3.1 Period of cover'),
    ul('Each business trip is covered from leaving home or the workplace until return, for up to 180 consecutive days.', 'Long-term assignments must be notified by HR; after 180 days the traveller must move to the client\'s expatriate plan.', 'Contract year: 1 April 2026 to 31 March 2027, renewing annually unless either party gives 90 days\' notice.'),
    h(3, '3.2 Authorisation thresholds'),
    table(['Estimated cost of case', 'Who approves', 'Timeframe'],
      ['Up to USD 10,000', 'Assistance case manager (GOP issued directly)', 'Immediately'],
      ['USD 10,000 to 50,000', 'Assistance team lead', 'Within 1 hour'],
      ['Above USD 50,000, any air ambulance, any security evacuation', 'Client travel-risk desk, confirmed by e-mail', 'Within 2 hours; assistance may act first if life is at risk']),
    h(3, '3.3 Annual aggregate'),
    p('The client funds all costs up to an annual aggregate of ', b('USD 25,000,000'), ' for all travellers. Assistance reports usage monthly and notifies the client when 75% is reached. Assistance fees are invoiced separately and do not count towards the aggregate.'),

    ...benefit(4, 'Emergency medical expenses (illness and injury)', {
      intro: ['Covers emergency treatment of illness or injury during a business trip, with direct billing wherever possible.'],
      limits: [
        ['Emergency inpatient and outpatient treatment', 'USD 1,000,000', 'None', 'Per traveller per trip; USA included'],
        ['Hospital accommodation', 'Private room', 'None', 'Intensive care included'],
        ['Follow-up treatment in home country', 'USD 10,000', 'None', 'Within 30 days of repatriation'],
        ['Physiotherapy after injury', 'USD 2,500', 'None', 'Prescribed by treating doctor'],
      ],
      covered: ['Doctor, specialist and surgeon fees; hospital accommodation in a private room; diagnostics; emergency ambulance.', 'Extra hotel and travel costs for the traveller to recover before travelling home, up to USD 300 per night for 10 nights.', 'Follow-up treatment in the home country within 30 days of repatriation, for the same condition.'],
      conditions: ['Inpatient admission must be notified to assistance within 24 hours.', 'Costs are subject to the authorisation thresholds in section 3.2.', 'Assistance may move the traveller to a better-equipped hospital or the home country when medically appropriate.'],
      excluded: ['Planned or elective treatment abroad, or trips made to obtain treatment.', 'Treatment on trips not registered in the travel tool.', 'Cosmetic and experimental treatment.'],
      contact: ['Before treatment when possible and always within 24 hours of admission.'],
    }),

    ...benefit(5, 'Pre-trip vaccinations and health checks', {
      intro: ['Unlike consumer travel policies, this programme pays for preventive care that protects the traveller and the client\'s duty of care.'],
      limits: [
        ['Travel vaccinations', 'USD 750 per traveller per year', 'None', 'As advised for the destination'],
        ['Pre-trip medical check (high-risk destinations or assignments)', 'USD 500', 'None', 'Required for long-term assignments'],
        ['Malaria prophylaxis', 'USD 250 per trip', 'None', 'Prescription required'],
        ['Travel health consultation (tele-medicine)', 'Unlimited', 'None', 'Through assistance'],
      ],
      covered: ['Destination-specific vaccinations (for example yellow fever, hepatitis A/B, typhoid, rabies pre-exposure, Japanese encephalitis).', 'Pre-trip medical and dental check before a long-term assignment or travel to a high-risk destination.', 'Malaria prophylaxis and a travel medical kit for remote destinations.', 'Pre-travel advice calls with an assistance travel-medicine doctor.'],
      conditions: ['Claim within 90 days of the vaccination or check, with the clinic invoice and travel booking reference.'],
      excluded: ['Routine vaccinations not related to the destination (for example annual flu vaccination), except where the client\'s occupational health team requests them.', 'Ongoing treatment or monitoring of chronic conditions.'],
      contact: ['Book the tele-medicine consultation through assistance at least 4 weeks before travel to high-risk destinations.'],
    }),

    h(2, '6. Pre-existing medical conditions and medical screening'),
    h(3, '6.1 Stable-condition rule'),
    p('Pre-existing medical conditions are covered without declaration if they have been stable for 90 days before the trip: no new symptoms, no hospital admission, no change in medication and no awaited investigation.'),
    h(3, '6.2 Declared conditions'),
    p('Conditions that are not stable must be declared by the traveller to the client\'s occupational health team before travel. Declared and accepted conditions are covered in full. The traveller\'s consent is recorded so that assistance may see the declaration if a case arises.'),
    h(3, '6.3 Undeclared conditions'),
    p('Emergency treatment of an undeclared, unstable condition is covered up to ', b('USD 50,000'), ' per trip. Costs above that need travel-risk desk approval. Repatriation is always covered.'),
    h(3, '6.4 Medical screening for assignments and high-risk travel'),
    ul('Travellers going on a long-term assignment, or to a destination rated high or extreme medical risk, complete a fit-to-travel screening by the client\'s occupational health provider.', 'The screening outcome (fit, fit with conditions, unfit) is shared with assistance with the traveller\'s consent.', 'Travel against an "unfit" outcome is not covered for related conditions.'),

    ...benefit(7, 'Medical evacuation and repatriation', {
      intro: ['Transport to the nearest centre of medical excellence or repatriation to the home country, arranged by assistance.'],
      limits: [
        ['Medical evacuation', 'Actual cost', 'None', 'Nearest suitable facility'],
        ['Repatriation to home country', 'Actual cost', 'None', 'Not to country of trip origin'],
        ['Air ambulance', 'Actual cost', 'None', 'Client travel-risk desk approval required'],
        ['Return to post after recovery', 'Economy one-way', 'None', 'If the trip or assignment continues'],
      ],
      covered: ['Evacuation by road ambulance, scheduled flight (with business class or stretcher if needed) or air ambulance.', 'Repatriation to the home country, not to the country where the trip started if different.', 'Medical escort by a doctor or nurse.', 'Return to the place of work abroad after recovery, if the client agrees.'],
      conditions: ['Medical necessity is decided by the assistance medical director after peer-to-peer contact with the treating doctor.', 'Air ambulance and any evacuation above USD 50,000 need approval from the travel-risk desk; assistance may proceed first where delay would endanger life, and informs the desk immediately.'],
      excluded: ['Transport arranged without assistance, except in a life-threatening emergency where assistance could not be reached.', 'Evacuation for convenience when adequate care is available locally.'],
      contact: ['Always before any transfer. Assistance coordinates with the travel-risk desk.'],
    }),

    ...benefit(8, 'Repatriation of mortal remains', {
      intro: ['If a traveller or dependant dies abroad, assistance arranges the return of remains to the home country.'],
      limits: [['Repatriation of remains', 'Actual cost', 'None', 'Includes documentation and transport coffin'], ['Local burial or cremation', 'USD 15,000', 'None', 'At the family\'s request'], ['Travel for a relative to accompany remains', 'Business class return', 'None', 'One person']],
      covered: ['Preparation, transport coffin, consular formalities and transport to the home country.', 'Travel and two nights\' hotel for one relative to accompany the remains or attend formalities.'],
      conditions: ['The client\'s HR contact is informed before the family, unless the family contacts assistance first.'],
      excluded: ['Funeral, ceremony and headstone costs in the home country.'],
      contact: ['Immediately. Assistance informs the travel-risk desk and HR within 1 hour.'],
    }),

    ...benefit(9, 'Pregnancy and childbirth', {
      intro: ['Covers complications of pregnancy for travellers and dependants, and care of a newborn born abroad.'],
      limits: [['Complications of pregnancy', 'USD 1,000,000', 'None', 'Up to week 36 (week 32 multiple pregnancy)'], ['Childbirth abroad on long-term assignment', 'USD 15,000', 'None', 'Pre-approved maternity plan'], ['Newborn care', 'USD 250,000', 'None', 'Newborn automatically covered as a dependant']],
      covered: ['Emergency care for complications such as pre-eclampsia, ectopic pregnancy, miscarriage or premature labour.', 'Planned childbirth during a long-term assignment, if a maternity plan is approved by HR by week 24.', 'Neonatal intensive care and repatriation of the newborn.'],
      conditions: ['Business travel after week 28 needs a fit-to-fly letter from the traveller\'s doctor.'],
      excluded: ['Routine antenatal care on short business trips (it should be provided at home).', 'Fertility treatment and elective termination.'],
      contact: ['Immediately on admission. Notify HR of a planned birth abroad by week 24.'],
    }),

    ...benefit(10, 'Mental health', {
      intro: ['Psychological support for travellers, including after a traumatic or security event.'],
      limits: [['Acute psychiatric inpatient care', 'USD 15,000', 'None', 'Inpatient only'], ['Critical-incident counselling', '6 sessions', 'None', 'After a security event, assault or accident'], ['Employee assistance helpline', 'Unlimited', 'None', '24/7, multilingual']],
      covered: ['Emergency psychiatric admission and safe repatriation with a medical escort.', 'Trauma counselling, in person or by video, after a covered event.'],
      conditions: ['Counselling must start within 6 months of the event.'],
      excluded: ['Long-term psychotherapy and treatment of conditions related to substance abuse.'],
      contact: ['Assistance can arrange a counsellor within 24 hours; the travel-risk desk is informed only with the traveller\'s consent.'],
    }),

    ...benefit(11, 'Dental emergency', {
      intro: ['Emergency dental treatment during a business trip.'],
      limits: [['Emergency dental treatment', 'USD 1,000', 'None', 'Pain relief and accident damage']],
      covered: ['Pain relief, temporary repairs, extraction and accident damage to natural teeth.'],
      conditions: ['Treatment must not be able to wait until return.'],
      excluded: ['Routine, restorative and cosmetic dentistry.'],
      contact: ['Only if the cost will exceed USD 1,000.'],
    }),

    ...benefit(12, 'Prescription medication', {
      intro: ['Medication prescribed abroad and delivery of essential medication.'],
      limits: [['Prescribed medication', 'Included in medical expenses', 'None', ''], ['Courier of essential medication', 'USD 1,000 per trip', 'None', 'Lost, stolen or insufficient supply']],
      covered: ['Medication for a covered condition, and courier delivery of a traveller\'s regular prescribed medication if it is lost or the trip is extended.'],
      conditions: ['Delivery is subject to customs rules of the destination country.'],
      excluded: ['Medication not legally available in the destination country.'],
      contact: ['Call assistance; customs clearance can take several days.'],
    }),

    h(2, '13. Hospital direct billing, guarantee of payment (GOP) and claims procedure'),
    ul('Assistance issues a ', ref('GOP (Guarantee of Payment)', 'GOP'), ' to the hospital within the thresholds in section 3.2. Travellers should not pay hospital bills themselves.',
      'Where the provider insists on payment, assistance can pay by virtual card. Travellers using their corporate card claim back within 60 days through the client\'s expense system; assistance validates the claim within 10 working days.',
      'Invoices are checked against reasonable and customary charges; in the USA, network rates apply.'),
    p('Provider invoices are registered and checked as described in ', ref('Register an incoming provider invoice'), '. Reimbursement of travellers follows ', ref(REIMBURSEMENT_WI), '.'),

    ...benefit(14, 'Luggage, business equipment and personal belongings', {
      intro: ['Loss, theft of or damage to personal luggage and the client\'s business equipment.'],
      limits: [['Personal luggage', 'USD 3,000', 'None', 'Single item USD 750'], ['Business equipment', 'USD 5,000', 'None', 'Laptop, phone, samples'], ['Delayed luggage (over 6 hours)', 'USD 500', 'None', 'Essentials']],
      covered: ['Replacement or repair of luggage and business equipment.', 'Essential purchases when checked luggage is delayed over 6 hours.'],
      conditions: ['Police report within 24 hours for theft; PIR from the airline for loss or delay.', 'Company laptops must be reported to the client\'s IT security team immediately.'],
      excluded: ['Items left unattended in a public place or visible in a vehicle.', 'Data loss and software reinstallation.'],
      contact: ['Not required for the claim; call assistance for help replacing essential items abroad.'],
    }),

    ...benefit(15, 'Personal money and documents', {
      intro: ['Theft of personal money and replacement of lost travel documents.'],
      limits: [['Personal money', 'USD 1,000', 'None', 'Cash limit USD 500'], ['Passport, visa and documents', 'USD 1,500', 'None', 'Including extra travel and hotel']],
      covered: ['Stolen cash and the cost of emergency travel documents and visas.'],
      conditions: ['Police report within 24 hours.'],
      excluded: ['Unexplained losses and currency exchange loss.'],
      contact: ['Immediately: assistance contacts the embassy and the client\'s travel team.'],
    }),

    ...benefit(16, 'Compassionate visit, return of dependants and replacement employee', {
      intro: ['Support for the traveller\'s family and for the client\'s business continuity.'],
      limits: [['Compassionate visit', 'Business class return + USD 300/night', 'None', 'Hospitalised more than 5 days'], ['Return of dependants', 'Economy one-way each', 'None', 'If the traveller is repatriated or dies'], ['Early return home', 'Economy one-way', 'None', 'Death or serious illness of a close relative at home'], ['Replacement employee', 'Economy return', 'None', 'Client approval required']],
      covered: ['Travel and accommodation for one family member to be with a hospitalised traveller.', 'Return of accompanying dependants, with an escort for children under 18 if needed.', 'Early return home for a family emergency, and the travel of a replacement colleague to complete the business task.'],
      conditions: ['Inpatient stay of more than 5 days, or critical condition confirmed by the treating doctor.'],
      excluded: ['Visitor meals and personal expenses.'],
      contact: ['Before any travel is booked; assistance books on the client\'s preferred carriers where possible.'],
    }),

    h(2, '17. Security and political evacuation'),
    p('Assistance, with its security partner, helps travellers leave a country or area when a security event makes it unsafe to stay.'),
    table(['Benefit', 'Limit', 'Excess', 'Notes'],
      ['Security evacuation', 'USD 150,000 per traveller', 'None', 'Travel-risk desk approval required'],
      ['Natural disaster evacuation', 'USD 100,000 per traveller', 'None', 'Earthquake, flood, hurricane, volcanic eruption'],
      ['Shelter-in-place accommodation', 'USD 500 per day, max 10 days', 'None', 'When leaving is unsafe'],
      ['Annual security aggregate', 'USD 5,000,000', 'None', 'All travellers, within the annual aggregate']),
    h(3, '17.1 Triggers'),
    ul('The government of the traveller\'s home country or the destination recommends that nationals leave, or orders an evacuation.', 'The client\'s security provider raises the destination to "extreme risk" while the traveller is there.', 'The travel-risk desk and assistance jointly decide that the traveller\'s safety is at risk.'),
    h(3, '17.2 How it works'),
    steps(
      { title: 'Locate', body: [p('Assistance cross-checks the traveller feed and contacts every traveller in the affected area.')] },
      { title: 'Decide', body: [p('A joint call between assistance, the security partner and the travel-risk desk agrees to shelter in place or evacuate.')] },
      { title: 'Move', body: [p('Assistance arranges transport to the nearest safe place, then onward travel home or to another place of work.')] },
      { title: 'Account', body: [p('Assistance reports each traveller\'s status to the travel-risk desk every 4 hours until all are safe.')] },
    ),
    h(3, '17.3 What is not covered'),
    ul('Evacuation from a country already rated "extreme risk" when the traveller entered it without travel-risk desk approval.', 'Kidnap, ransom and extortion (covered separately under the client\'s K&R policy).', 'Loss of business or property left behind.'),

    h(2, '18. War and terrorism'),
    ul('Medical expenses, evacuation and repatriation arising from terrorism are covered, including when the traveller is an innocent bystander.',
      'War risks: medical and evacuation cover continues for 14 days after the outbreak of war in the country the traveller is in, to allow departure.',
      'Not covered: active participation in war, riot or terrorism; travel to a country where war has already broken out; nuclear, biological or chemical events unless the client\'s travel-risk desk confirms cover in writing.'),

    ...benefit(19, 'Duty-of-care services and traveller tracking', {
      intro: ['Services that support the client\'s legal duty of care to its travellers.'],
      limits: [['Pre-trip risk briefings', 'Unlimited', 'None', 'By e-mail for every registered trip'], ['Traveller tracking and alerts', 'Included', 'None', 'Based on the traveller feed'], ['Incident reporting to client', 'Included', 'None', 'Within 1 hour for serious cases']],
      covered: ['Medical and security briefings before departure.', 'Real-time alerts to travellers in an affected area.', 'Monthly management information: cases, costs, aggregate usage, destinations.'],
      conditions: ['The client keeps the traveller feed complete and accurate. Assistance is not responsible for travellers not in the feed.', 'Personal medical data is shared with the client only with the traveller\'s consent or when life is at risk.'],
      excluded: ['Tracking of private trips not registered in the travel tool.'],
      contact: ['The travel-risk desk can request a traveller location report from assistance at any time.'],
    }),

    h(2, '20. Exclusions specific to business travel'),
    ul('Trips not registered or not approved by the line manager before departure.', 'Private travel longer than 14 days added to a business trip.', 'Manual work at height, offshore or underground, unless named in Schedule A.', 'Travel as crew, or as a professional athlete.'),

    h(2, '21. General exclusions'),
    collapsible('General exclusions (full list)', ol(
      'Planned or elective treatment, and any trip made against medical advice or to obtain treatment.',
      'Deliberate self-injury, except when caused by an acute mental-health condition covered under section 10.',
      'Alcohol or drug abuse, or being under the influence of drugs not prescribed by a doctor.',
      'Unlawful acts by the traveller.',
      'Nuclear, biological or chemical contamination, except as set out in section 18.',
      'Travel to a sanctioned country, or for a sanctioned person or entity (section 22.5).',
      'Losses covered by another policy of the client, such as the K&R or property policies.',
      'Indirect or consequential loss, including loss of business or earnings.',
    )),

    h(2, '22. General conditions'),
    h(3, '22.1 Fraud'),
    p('If a claim is fraudulent, assistance will not pay it and will inform the client\'s HR and compliance teams. The client may recover any amounts paid from the traveller under its employment terms.'),
    h(3, '22.2 Subrogation'),
    p('Assistance and the client may take over the traveller\'s rights against a liable third party, carrier or other insurer to recover costs paid. Travellers must cooperate and must not waive these rights.'),
    h(3, '22.3 Other insurance'),
    p('Where a public health scheme or another policy covers the same costs, assistance coordinates benefits and pays only the balance. The traveller\'s private policies are not called on unless the traveller agrees.'),
    h(3, '22.4 Data protection'),
    p('Assistance processes medical data as an independent controller under applicable data-protection law and shares it with the client only as set out in section 19.'),
    h(3, '22.5 Sanctions'),
    p('No cover, payment or service is provided where doing so would breach UN, EU, UK or US sanctions. Assistance screens every case and every payee.'),
    h(3, '22.6 Complaints'),
    p('Travellers raise complaints with the client\'s HR team or directly with assistance at complaints@demo.test (fictional). Unresolved complaints go to the contract governance meeting held each quarter.'),
    h(3, '22.7 Governing law'),
    p('This contract is governed by the laws of England and Wales (DEMO) and disputes are subject to the exclusive jurisdiction of the English courts.'),

    h(2, '23. How to contact assistance'),
    table(['Situation', 'Who calls', 'Contact'],
      ['Medical emergency, admission, evacuation', 'Traveller, colleague or hospital', DEMO_PHONE],
      ['Security event', 'Traveller or travel-risk desk', `${DEMO_PHONE}, option 2`],
      ['Pre-travel advice, vaccination booking', 'Traveller', 'assist@demo.test (fictional)'],
      ['Approval above USD 50,000', 'Assistance team lead', 'Travel-risk desk, number in the Globo client record']),
    p('Give the employee ID (', b('BF-'), ' prefix), name, location, phone number and a short description. Assistance confirms the trip in the traveller feed while the call is in progress.'),
    callout('tip', 'For case managers', p('Check the traveller feed first; no registration means no cover unless the travel-risk desk approves in writing. Thresholds: USD 10,000 own authority, USD 50,000 team lead, above that the travel-risk desk.')),
  ],
};

export const CLIENT_TERMS_ARTICLES: SeedArticle[] = [WAYFARER, BLUEFIN];
