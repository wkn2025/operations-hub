import type { ArticleType, PmNode, TemplateFields } from '@ops/shared';
import { a, b, callout, code, collapsible, demo, h, hl, i, ol, p, pre, ref, shot, steps, table, tasks, ul } from './pm';
import { ALL_ENTRIES, EDI_101, EDI_ARTICLES, EDI_IMPORT, MANUAL_HANDLING, MISSING_CLAIM, MISSING_GOP } from './articles-edi';
import { CLIENT_ARTICLES } from './articles-clients';
import { CLIENT_TERMS_ARTICLES } from './articles-client-terms';
import { CLIENT_PLACEHOLDER_ARTICLES } from './articles-client-placeholders';
import { CLAIMS_ARTICLES } from './articles-claims';
import { QA_ARTICLES } from './articles-qa';
import { NETWORK_FINANCE_ARTICLES } from './articles-network-finance';
import { SYSTEMS_ARTICLES } from './articles-systems';
import { GLOSSARY_ARTICLES } from './articles-glossary';
import { BANK_ARTICLES } from './articles-bank';

/**
 * Seed article definitions. Extension point: add entries to a domain file (articles-*.ts) or a new file listed in SEED_ARTICLES.
 * Key = title (slug is derived from it). `category` is "Top / Sub". Internal links use ref(title).
 */
export interface SeedArticle {
  title: string;
  type: ArticleType;
  category: string;
  owner: 'admin' | 'editor';
  tags: string[];
  reviewDate?: string;
  fields?: TemplateFields;
  content: PmNode[];
}

const invoiceWi = 'Register an incoming provider invoice';
const gop = 'GOP (Guarantee of Payment)';

const CORE_ARTICLES: SeedArticle[] = [
  {
    title: invoiceWi,
    type: 'work_instruction',
    category: 'Work Instructions / Invoice processing',
    owner: 'editor',
    tags: ['invoice', 'registration', 'claims'],
    reviewDate: '2026-11-12',
    fields: {
      summary: 'Register a provider invoice against the right case so it can be checked and paid.',
      purpose: 'Every provider invoice is registered in Globo within one working day, linked to the correct case and GOP.',
      scope: 'Paper, e-mail and portal invoices from network and non-network providers. EDI invoices are registered automatically.',
      audience: 'Claims handlers, Finance assistants',
      verification: 'The invoice shows status "Registered" in Globo, the GOP balance is reduced, and the scanned original is attached.',
    },
    content: [
      h(2, 'Before you start'),
      tasks([false, 'You have the invoice as PDF or scan'], [false, 'You know the case number or the patient name and date of birth'], [false, 'You have Globo access with the Claims role']),
      h(2, 'Procedure'),
      steps(
        { title: 'Find the case', body: [p('Search the case number in Globo. If you only have the patient name, search by name and date of birth and confirm the admission date matches the invoice.')] },
        { title: 'Check the GOP', body: [p('Open the ', b('Guarantees'), ' tab. The invoice amount must fit the remaining ', ref(gop, 'GOP'), ' balance.'), callout('warning', null, p('No GOP, or the amount exceeds it? Stop and assign the case to the medical team. Do not register the invoice.'))] },
        { title: 'Create the invoice record', body: [p('Choose ', b('New invoice'), ', enter provider, invoice number, date, currency and total. Use the currency printed on the invoice, never a converted amount.')] },
        { title: 'Attach the original', body: [p('Upload the PDF to the invoice record. File name: ', code('INV_<case>_<invoiceNo>.pdf'), '.')] },
        { title: 'Set status to Registered', body: [p('Save. Globo reduces the GOP balance and places the invoice in the medical check queue.')] },
      ),
      h(2, 'Exceptions'),
      collapsible('Invoice in a currency we do not pay in', p('Register it anyway, tick ', i('Manual FX'), ', and add a note for Finance.')),
      collapsible('Duplicate invoice number from the same provider', p('Compare amount and dates. If identical, mark the new one as ', b('Duplicate'), ' and attach it to the first record.')),
      demo(),
    ],
  },
  {
    title: 'Northwind Travel Insurance: coverage summary',
    type: 'client_terms',
    category: 'Clients & Terms and Conditions',
    owner: 'admin',
    tags: ['northwind', 'travel insurance', 'coverage'],
    reviewDate: '2027-01-15',
    fields: {
      summary: 'What we may authorise for Northwind policyholders without calling the client first.',
      client: 'Northwind Travel Insurance (fictional)', line: 'travel', docKind: 'summary', contractRef: 'NW-ASSIST-2026-DEMO', validFrom: '2026-01-01', validTo: '2027-12-31', region: 'Worldwide excl. USA/Canada',
      keyLimits: [
        { label: 'Medical expenses', value: 'EUR 250,000' },
        { label: 'Authorise without client', value: 'EUR 5,000' },
        { label: 'Excess per claim', value: 'EUR 75' },
      ],
    },
    content: [
      h(2, 'Coverage'),
      table(['Benefit', 'Limit per trip', 'Notes'],
        ['Emergency medical treatment', 'EUR 250,000', 'Including hospitalisation'],
        ['Medical repatriation', 'Actual cost', 'Medical team decides on mode of transport'],
        ['Dental emergency', 'EUR 400', 'Pain relief only'],
        ['Travel of a relative', 'EUR 3,000', 'Only if hospitalised > 7 days'],
        ['Search and rescue', 'EUR 10,000', '']),
      h(2, 'Authorisation rules'),
      steps(
        { title: 'Up to EUR 5,000', body: [p('Case manager may issue a GOP directly.')] },
        { title: 'EUR 5,000 to 25,000', body: [p('Team lead approval in Globo.')] },
        { title: 'Above EUR 25,000', body: [p('E-mail the Northwind claims desk and wait for written approval.')] },
      ),
      h(2, 'Exclusions'),
      callout('danger', 'Not covered', ul('Pre-existing conditions not declared at booking', 'Treatment the patient travelled to receive', 'Injuries from professional sports', 'Trips longer than 90 days')),
      callout('tip', 'Ask first', p('When the cause of illness is unclear, open the case and issue a provisional GOP of up to EUR 1,500 while the medical team reviews.')),
      demo(),
    ],
  },
  {
    title: 'EDI claim failed to import',
    type: 'troubleshooting',
    category: 'EDI & Automation / EDI issues',
    owner: 'admin',
    tags: ['edi', 'import', 'web.transformer', 'missing claim', 'missing gop'],
    reviewDate: '2027-11-05',
    fields: {
      summary: 'An invoice was sent through EDI, but it does not show on the case in Globo.',
      symptom: 'An EDI invoice is not on the case in Globo.',
      cause: 'One of the three import checks failed: the Member ID does not exist in Globo (automatically denied), no open case has the same diagnosis (Missing Claim), or no open GOP matches the service dates and provider Tax ID (Missing GOP).',
      fix: 'Find the invoice in web.transformer and fix what the failed check needs, then let the import pick it up.',
    },
    content: [
      h(2, 'Check these in order'),
      steps(
        { title: 'Find the invoice in All Entries', body: [p('Every invoice processed via EDI is recorded there. Filter the UHAP ID column, or enter the Member ID without the 909000 prefix in the Client ID column. See ', ref(ALL_ENTRIES), '.')] },
        { title: 'Does the Member ID exist in Globo?', body: [p('If not, the invoice was automatically denied at the first import check.')] },
        { title: 'Is it on the Missing Claim page?', body: [p('No open case has the same diagnosis as the invoice. Follow ', ref(MISSING_CLAIM), '.')] },
        { title: 'Is it on the Missing GOP page?', body: [p('No open GOP has the same service dates from and to and a provider registered under the Tax ID on the invoice. Follow ', ref(MISSING_GOP), '.')] },
      ),
      callout('info', 'Imported, but not exported?', p('If the invoice is in Globo but its PCF was not built when it moved from Pay to Settled, it is on the Manual Handling page: ', ref(MANUAL_HANDLING), '.')),
      p('How the checks work: ', ref(EDI_IMPORT), '. The whole loop: ', ref(EDI_101), '.'),
    ],
  },
  {
    title: gop,
    type: 'glossary',
    category: 'Glossary & Acronyms / Medical terms',
    owner: 'admin',
    tags: ['gop', 'guarantee', 'glossary'],
    reviewDate: '2027-06-01',
    fields: {
      term: 'Guarantee of Payment', acronym: 'GOP', aliases: ['Letter of guarantee', 'LOG'],
      definition: 'A written commitment to a provider that we will pay for agreed treatment up to a stated amount.',
      relatedTerms: ['Prior authorisation', 'Cost containment', 'Excess'],
    },
    content: [
      p('A GOP is issued per case and per provider. It states the patient, the treatment, the maximum amount and how long it is valid. Invoices above the GOP amount are not paid until the GOP is increased.'),
      h(2, 'In practice'),
      ul('Issued from the Guarantees tab in Globo.', 'Sent to the provider by fax or e-mail; providers reference it in their invoice.', 'An EDI invoice needs an open GOP with the same service dates and a provider registered under the invoice Tax ID; otherwise it lands on the Missing GOP page in web.transformer.'),
      p('See also ', ref('EDI claim failed to import'), '.'),
      demo(),
    ],
  },
  {
    title: 'Weekly provider payment run',
    type: 'standard',
    category: 'Finance & Payment Processing / Payment runs',
    owner: 'editor',
    tags: ['payments', 'finance', 'schedule'],
    reviewDate: '2026-11-05',
    fields: { summary: 'When approved invoices are paid, who signs off, and what to tell a provider who is waiting.' },
    content: [
      p('Approved invoices are paid in one run every ', b('Wednesday'), '. Anything approved by Tuesday 16:00 CET is included.'),
      h(2, 'Timeline'),
      table(['Day', 'What happens', 'Owner'],
        ['Tuesday 16:00', 'Cut-off for approvals', 'Claims'],
        ['Wednesday 09:00', 'Payment file created in ECNet', 'Finance'],
        ['Wednesday 12:00', 'Four-eyes sign-off', 'Finance lead'],
        ['Thursday', 'Funds arrive (SEPA)', 'Bank']),
      h(2, 'Provider asks where their money is'),
      ol('Check the invoice status in Globo. Only "Approved" invoices go into a run.', 'If approved before the cut-off, give the expected arrival date.', 'If not approved, tell the provider what is missing. Do not promise a date.'),
      callout('warning', 'Urgent payments', p('Out-of-run payments need the Finance lead’s approval and are limited to EUR 20,000 per day.')),
      demo(),
    ],
  },
];

export const SEED_ARTICLES: SeedArticle[] = [
  ...CORE_ARTICLES, ...EDI_ARTICLES, ...CLIENT_ARTICLES, ...CLIENT_TERMS_ARTICLES, ...CLIENT_PLACEHOLDER_ARTICLES, ...CLAIMS_ARTICLES,
  ...QA_ARTICLES, ...NETWORK_FINANCE_ARTICLES, ...SYSTEMS_ARTICLES, ...GLOSSARY_ARTICLES, ...BANK_ARTICLES,
];
