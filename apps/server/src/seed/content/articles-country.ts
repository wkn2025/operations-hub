import type { SeedArticle } from './articles';
import { b, callout, h, p, table, ul } from './pm';

/**
 * Country Specifics (user request 2026-11-05): how cases differ by country. Only the "Country rule" callouts are
 * user-given procedure (Barbados medical reports, Mexico US billing offices, Cuba Asistur), so no DEMO label.
 * "Suggested steps" and "General information" are Claude-drafted and labelled for the team to confirm.
 */
const CATEGORY = 'Work Instructions / Country Specifics';

const suggested = () => callout('info', 'Suggested steps: confirm with your team lead', p('These steps were drafted to go with the country rule above. They are not yet confirmed procedure.'));
const general = () => callout('info', 'General country facts', p('Background for planning a case. Check anything you quote to a client or provider.'));

export const COUNTRY_ARTICLES: SeedArticle[] = [
  {
    title: 'Barbados: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['barbados', 'caribbean', 'medical report', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { country: 'Barbados', countryDoc: 'specifics', summary: 'Medical reports are obtained directly from the treating doctor, not the hospital, and they are paid, unlike in other countries.' },
    content: [
      callout('warning', 'Country rule: medical reports',
        p('In Barbados, medical reports are obtained ', b('directly from the treating doctor'), ', not the hospital.'),
        p('Unlike other countries, these medical reports are ', b('paid'), '.')),
      h(2, 'Suggested steps'),
      suggested(),
      ul(
        'Get the treating doctor’s name and contact details.',
        'Request the medical report from the doctor with the case number.',
        'Note the report fee on the case so the payment is expected.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'English'],
        ['Currency', 'Barbados dollar (BBD), pegged at 2 BBD to 1 USD'],
        ['Time zone', 'UTC−4 (Atlantic Standard Time), no daylight saving'],
        ['Main public hospital', 'Queen Elizabeth Hospital, Bridgetown']),
    ],
  },
  {
    title: 'Mexico: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['mexico', 'latin america', 'billing', 'us prices', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { country: 'Mexico', countryDoc: 'specifics', summary: 'Mexican cases are handled by US billing offices, which practise US prices.' },
    content: [
      callout('warning', 'Country rule: US billing offices',
        p('Mexican cases are handled by ', b('US billing offices'), ', which practise ', b('US prices'), '.')),
      h(2, 'Suggested steps'),
      suggested(),
      ul(
        'Expect US-level prices and compare estimates with the policy limits early.',
        'Check the invoice currency and that the guarantee of payment (GOP) states the same currency.',
        'Check which party the invoice asks to be paid before paying.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'Spanish'],
        ['Currency', 'Mexican peso (MXN)'],
        ['Time zones', 'Several; Mexico City is UTC−6, Cancún is UTC−5, no daylight saving in most of the country']),
    ],
  },
  {
    title: 'Cuba: country specifics',
    type: 'standard',
    category: CATEGORY,
    owner: 'admin',
    tags: ['cuba', 'caribbean', 'asistur', 'country specifics'],
    reviewDate: '2027-05-01',
    fields: { country: 'Cuba', countryDoc: 'specifics', summary: 'All cases are handled by Asistur, a government organisation. Contacting or paying hospitals and doctors directly can be considered illegal.' },
    content: [
      callout('danger', 'Country rule: only through Asistur',
        p('All cases in Cuba are handled by ', b('Asistur'), ', a government organisation.'),
        p('Attempting to ', b('contact or pay hospitals and doctors directly can be considered illegal'), '.')),
      h(2, 'Suggested steps'),
      suggested(),
      ul(
        'Open and run the case with Asistur.',
        'Request medical information through Asistur.',
        'If a provider contacts us directly, ask your team lead before replying.',
      ),
      h(2, 'General information'),
      general(),
      table(['Topic', 'Detail'],
        ['Language', 'Spanish'],
        ['Currency', 'Cuban peso (CUP)'],
        ['Time zone', 'UTC−5, with daylight saving in summer'],
        ['Entry rules', 'Visitors must hold travel medical insurance valid in Cuba']),
    ],
  },
];
