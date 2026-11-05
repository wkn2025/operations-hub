import type { ClientDocKind, ClientLine } from '@ops/shared';
import type { SeedArticle } from './articles';
import { b, callout, demo, h, p, table, ul } from './pm';

/**
 * DEMO placeholders so every client in the Clients & T&C directory has Corporate and Travel, each with a full T&C and a
 * coverage summary (user request 2026-11-05). Short and clearly fictional; replace with the real wording per client.
 */
interface Placeholder {
  client: string; product: string; line: ClientLine; docKind: ClientDocKind; ref: string; region: string;
  limits: [string, string][]; // annual/medical limit first, then authority without the client
}

const PLACEHOLDERS: Placeholder[] = [
  { client: 'Bluefin Corporate Health (fictional)', product: 'Bluefin Corporate Health', line: 'corporate', docKind: 'summary', ref: 'BF-CORP-2026-DEMO', region: 'Worldwide incl. USA',
    limits: [['Annual aggregate', 'EUR 5,000,000'], ['Authorise without client', 'EUR 25,000'], ['Security evacuation', 'Actual cost']] },
  { client: 'Bluefin Corporate Health (fictional)', product: 'Bluefin Business Travel', line: 'travel', docKind: 'full', ref: 'BF-TRV-2027-DEMO', region: 'Worldwide incl. USA',
    limits: [['Emergency medical', 'EUR 3,000,000'], ['Authorise without client', 'EUR 15,000'], ['Trip cancellation', 'EUR 5,000']] },
  { client: 'Bluefin Corporate Health (fictional)', product: 'Bluefin Business Travel', line: 'travel', docKind: 'summary', ref: 'BF-TRV-2027-DEMO', region: 'Worldwide incl. USA',
    limits: [['Emergency medical', 'EUR 3,000,000'], ['Authorise without client', 'EUR 15,000'], ['Trip cancellation', 'EUR 5,000']] },
  { client: 'Meridian Expat Care (fictional)', product: 'Meridian Expat Care', line: 'corporate', docKind: 'full', ref: 'MER-EXP-2026-DEMO', region: 'Worldwide excl. USA',
    limits: [['Annual limit', 'EUR 2,000,000'], ['Authorise without client', 'EUR 15,000'], ['Deductible per year', 'EUR 500']] },
  { client: 'Meridian Expat Care (fictional)', product: 'Meridian Travel Cover', line: 'travel', docKind: 'full', ref: 'MER-TRV-2027-DEMO', region: 'Europe',
    limits: [['Emergency medical', 'EUR 500,000'], ['Authorise without client', 'EUR 5,000'], ['Luggage', 'EUR 1,500']] },
  { client: 'Meridian Expat Care (fictional)', product: 'Meridian Travel Cover', line: 'travel', docKind: 'summary', ref: 'MER-TRV-2027-DEMO', region: 'Europe',
    limits: [['Emergency medical', 'EUR 500,000'], ['Authorise without client', 'EUR 5,000'], ['Luggage', 'EUR 1,500']] },
  { client: 'Northwind Travel Insurance (fictional)', product: 'Northwind Travel Insurance', line: 'travel', docKind: 'full', ref: 'NW-ASSIST-2026-DEMO', region: 'Worldwide excl. USA/Canada',
    limits: [['Medical expenses', 'EUR 250,000'], ['Authorise without client', 'EUR 5,000'], ['Repatriation', 'Actual cost']] },
  { client: 'Northwind Travel Insurance (fictional)', product: 'Northwind Corporate Travel', line: 'corporate', docKind: 'full', ref: 'NW-CORP-2027-DEMO', region: 'Worldwide',
    limits: [['Annual aggregate', 'EUR 1,000,000'], ['Authorise without client', 'EUR 10,000'], ['Business equipment', 'EUR 3,000']] },
  { client: 'Northwind Travel Insurance (fictional)', product: 'Northwind Corporate Travel', line: 'corporate', docKind: 'summary', ref: 'NW-CORP-2027-DEMO', region: 'Worldwide',
    limits: [['Annual aggregate', 'EUR 1,000,000'], ['Authorise without client', 'EUR 10,000'], ['Business equipment', 'EUR 3,000']] },
  { client: 'Wayfarer Travel Insurance Ltd (fictional)', product: 'Wayfarer Family Travel Plan', line: 'travel', docKind: 'summary', ref: 'WAY-FAM-2027-DEMO', region: 'Area 1–3 (per schedule)',
    limits: [['Emergency medical', 'EUR 2,000,000'], ['Authorise without client', 'EUR 5,000'], ['Trip cancellation', 'EUR 3,000 per person']] },
  { client: 'Wayfarer Travel Insurance Ltd (fictional)', product: 'Wayfarer Business Travel', line: 'corporate', docKind: 'full', ref: 'WAY-BIZ-2027-DEMO', region: 'Worldwide',
    limits: [['Emergency medical', 'EUR 2,500,000'], ['Authorise without client', 'EUR 10,000'], ['Business equipment', 'EUR 2,500']] },
  { client: 'Wayfarer Travel Insurance Ltd (fictional)', product: 'Wayfarer Business Travel', line: 'corporate', docKind: 'summary', ref: 'WAY-BIZ-2027-DEMO', region: 'Worldwide',
    limits: [['Emergency medical', 'EUR 2,500,000'], ['Authorise without client', 'EUR 10,000'], ['Business equipment', 'EUR 2,500']] },
];

const placeholderNote = () => callout('warning', 'Placeholder', p('This document is a placeholder so the client directory is complete. Replace it with the client’s real wording before relying on it.'));

function article(x: Placeholder): SeedArticle {
  const full = x.docKind === 'full';
  const who = x.line === 'corporate' ? 'employees travelling or living abroad for the policyholder company' : 'travellers named on the policy schedule';
  return {
    title: `${x.product}: ${full ? 'full terms and conditions' : 'coverage summary'}`,
    type: 'client_terms',
    category: 'Clients & Terms and Conditions',
    owner: 'admin',
    tags: [x.product.split(' ')[0]!.toLowerCase(), x.line === 'corporate' ? 'corporate' : 'travel insurance', full ? 'terms and conditions' : 'coverage', 'placeholder'],
    reviewDate: '2027-06-30',
    fields: {
      summary: full
        ? `Full ${x.line} policy wording for ${x.product}: definitions, cover, limits, exclusions and the claims procedure. Placeholder.`
        : `What we may authorise for ${x.product} (${x.line}) without calling the client first. Placeholder.`,
      client: x.client, line: x.line, docKind: x.docKind, contractRef: x.ref, validFrom: '2027-01-01', validTo: '2027-12-31', region: x.region,
      keyLimits: x.limits.map(([label, value]) => ({ label, value })),
    },
    content: full ? [
      placeholderNote(),
      h(2, '1. Definitions'),
      p(b('Insured person'), `: ${who}. `, b('Assistance'), ': the 24/7 medical assistance service that acts for the insurer.'),
      h(2, '2. Territory and period of cover'),
      p(`Cover applies in: ${x.region}. Cover runs for the period on the schedule, within contract ${x.ref}.`),
      h(2, '3. What is covered'),
      table(['Benefit', 'Limit'], ...x.limits),
      h(2, '4. General exclusions'),
      ul('Pre-existing conditions not declared and accepted in writing.', 'Treatment that can wait until the insured person returns home.', 'Travel against medical advice.'),
      h(2, '5. Claims procedure'),
      p('Call assistance before any inpatient treatment. Send itemised invoices and the medical report within 30 days.'),
      demo(),
    ] : [
      placeholderNote(),
      p(`Quick reference for case managers handling ${x.product} cases (${x.line}).`),
      h(2, 'Key limits'),
      table(['Benefit', 'Limit'], ...x.limits),
      h(2, 'Before you authorise'),
      ul('Check the policy is valid on the date of treatment.', `Check the territory: ${x.region}.`, 'Above the authority limit, call the client first.'),
      demo(),
    ],
  };
}

export const CLIENT_PLACEHOLDER_ARTICLES: SeedArticle[] = PLACEHOLDERS.map((x) => article(x));
