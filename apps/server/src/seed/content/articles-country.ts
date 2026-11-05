import type { SeedArticle } from './articles';
import { b, callout, h, p, table, ul } from './pm';

/**
 * Country Specifics (user request 2026-11-05): how cases differ by country. The key rules (Barbados medical reports,
 * Mexico US billing offices, Cuba Asistur) come from the user and are real procedure, so no DEMO label.
 * The general country facts are background for handlers.
 */
const CATEGORY = 'Work Instructions / Country Specifics';

const general = () => callout('info', 'General country facts', p('The background facts below help with planning a case. Check anything you quote to a client or provider against the case file.'));

export const COUNTRY_ARTICLES: SeedArticle[] = [
  {
    title: 'Barbados: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['barbados', 'caribbean', 'medical report', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { summary: 'Medical reports come from the treating doctor, not the hospital, and the doctor charges for them. Budget for the report fee.' },
    content: [
      callout('warning', 'Medical reports: ask the doctor, and expect to pay',
        p('In Barbados, request the medical report ', b('directly from the treating doctor'), ', not the hospital. The hospital does not issue it.'),
        p('Doctors ', b('charge for medical reports'), ', unlike most other countries where the report comes free with the case. Medical reports here are paid: approve the report fee as part of the case cost and pay it with the doctor’s invoice.')),
      h(2, 'How to get a medical report'),
      ul(
        'Get the treating doctor’s name and direct contact from the hospital or the patient.',
        'Send the request to the doctor with the case number and the patient’s signed medical-information release.',
        'Ask for the fee up front and note it on the case so the payment is not queried later.',
        'Pay the report fee to the doctor, not the hospital.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'English'],
        ['Currency', 'Barbados dollar (BBD), pegged at 2 BBD to 1 USD; USD widely accepted'],
        ['Time zone', 'UTC−4 (Atlantic Standard Time), no daylight saving'],
        ['Main public hospital', 'Queen Elizabeth Hospital, Bridgetown'],
        ['Evacuation', 'Complex or specialist cases may need evacuation to a regional centre or the USA']),
    ],
  },
  {
    title: 'Mexico: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['mexico', 'latin america', 'billing', 'us prices', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { summary: 'Many Mexican cases are billed through US billing offices at US prices. Check who bills and in which currency before you guarantee payment.' },
    content: [
      callout('warning', 'US billing offices, US prices',
        p('Many Mexican hospitals, especially in tourist areas, hand billing to ', b('US billing offices'), '. These offices send the invoice and chase payment, and they bill at ', b('US prices'), ', often in USD.')),
      h(2, 'What this means for a case'),
      ul(
        'Before issuing a GOP, confirm who will bill: the hospital itself or a US billing office.',
        'Expect US-level prices. Compare the estimate with the policy limits early, not when the final invoice arrives.',
        'Check the invoice currency (USD or MXN) and make sure the GOP states it.',
        'Send correspondence and payment to the billing office named on the invoice, and keep the hospital’s details on the case for the medical side.',
        'Query line items that look out of line with local care. A US billing office is used to negotiation and reductions.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'Spanish; English common in tourist-area private hospitals'],
        ['Currency', 'Mexican peso (MXN); USD often used for billing'],
        ['Time zones', 'Several; most of the country, including Mexico City, is UTC−6; Cancún is UTC−5'],
        ['Healthcare', 'Public system (IMSS and others) and a large private sector; travellers are usually treated in private hospitals']),
    ],
  },
  {
    title: 'Cuba: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['cuba', 'caribbean', 'asistur', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { summary: 'Every case in Cuba goes through Asistur, the government assistance organisation. Never contact or pay hospitals or doctors directly.' },
    content: [
      callout('danger', 'Only through Asistur',
        p('All medical cases in Cuba are handled by ', b('Asistur'), ', a government organisation. Hospitals and doctors do not deal with foreign insurers or assistance companies themselves.'),
        p('Trying to ', b('contact or pay hospitals or doctors directly can be considered illegal'), ' in Cuba. Always go through Asistur.')),
      h(2, 'How to handle a case'),
      ul(
        'Open the case with Asistur. Send guarantees, requests for medical information and payment to Asistur only.',
        'Get medical updates and reports from Asistur, not from the treating facility.',
        'Pay Asistur’s invoice. Do not pay a hospital or doctor even if one sends a bill or asks for payment.',
        'If the patient or family is asked to pay locally, tell them to refer the provider to Asistur and let us know.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'Spanish'],
        ['Currency', 'Cuban peso (CUP)'],
        ['Time zone', 'UTC−5, with daylight saving in summer'],
        ['Entry rules', 'Visitors must hold travel medical insurance valid in Cuba'],
        ['Payments', 'Sanctions can block payments that involve US banks or US-linked entities. Check the payment route with Finance before paying.']),
    ],
  },
];
