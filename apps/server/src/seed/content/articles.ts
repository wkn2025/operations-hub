import type { ArticleType, PmNode, TemplateFields } from '@ops/shared';
import { a, b, callout, code, collapsible, demo, h, hl, i, ol, p, pre, ref, shot, steps, table, tasks, ul } from './pm';
import { EDI_ARTICLES } from './articles-edi';
import { CLIENT_ARTICLES } from './articles-clients';
import { CLAIMS_ARTICLES } from './articles-claims';
import { NETWORK_FINANCE_ARTICLES } from './articles-network-finance';
import { SYSTEMS_ARTICLES } from './articles-systems';
import { GLOSSARY_ARTICLES } from './articles-glossary';

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

const ediTech = 'UHCG Direct EDI: inbound 837I pipeline';
const invoiceWi = 'Register an incoming provider invoice';
const gop = 'GOP (Guarantee of Payment)';
const ack999 = '999 Implementation Acknowledgement';

const CORE_ARTICLES: SeedArticle[] = [
  {
    title: ediTech,
    type: 'technical',
    category: 'EDI & Automation / Inbound claims (837)',
    owner: 'admin',
    tags: ['edi', '837i', 'uhcg', 'pipeline'],
    reviewDate: '2027-03-01',
    fields: {
      summary: 'How institutional claims travel from the UHCG Direct SFTP drop to a case in Globo, and where each step can fail.',
      systems: ['UHCG Direct', 'EDI Gateway', 'Globo', 'ECNet'], version: 'v2.4 (DEMO)',
    },
    content: [
      h(2, 'Overview'),
      p('Inbound 837I files arrive several times a day. The ', b('EDI Gateway'), ' validates the envelope, answers with a ', ref(ack999, '999 acknowledgement'), ', splits the batch into single claims and hands each claim to Globo, where it is matched to an open assistance case.'),
      shot('edi-monitor.svg', 'EDI Monitor showing three inbound batches, one with a rejected claim', 'EDI Monitor, batch view (illustrative DEMO screenshot)'),
      h(2, 'Processing stages'),
      table(['Stage', 'System', 'Typical duration', 'Fails when'],
        ['Pickup', 'EDI Gateway', '< 1 min', 'SFTP credentials expired'],
        ['Envelope check (ISA/GS)', 'EDI Gateway', 'seconds', 'Wrong sender ID or control number reused'],
        ['999 acknowledgement', 'EDI Gateway', 'seconds', 'Syntax errors in a segment'],
        ['Case matching', 'Globo', '1–5 min', 'No open case or no GOP issued'],
        ['Financial posting', 'ECNet', 'nightly', 'Currency or provider record missing']),
      h(2, 'File naming'),
      p('Files follow the pattern below. The control number must be unique per sender for 12 months.'),
      pre('text', 'UHCGD_837I_<senderId>_<yyyyMMddHHmm>_<controlNo>.x12\nUHCGD_837I_DEMO01_202610290815_000412.x12'),
      callout('warning', 'Duplicate control numbers', p('A reused ISA13 control number makes the gateway reject the whole batch with a ', code('TA1'), '. Ask the sender to resend with a new number; never edit the file by hand.')),
      h(2, 'Monitoring'),
      ul('The EDI Monitor dashboard refreshes every 60 seconds.', 'Alerts go to the EDI on-call channel when a batch is older than 30 minutes.', 'Rejected claims stay in the quarantine queue for 14 days.'),
      collapsible('Segment reference used by the case matcher',
        table(['Segment', 'Element', 'Used for'],
          ['CLM', 'CLM01', 'Provider claim reference'],
          ['NM1*IL', 'NM109', 'Member ID'],
          ['REF*G1', 'REF02', 'GOP / prior authorisation number'],
          ['DTP*434', 'DTP03', 'Statement period'])),
      p('If a claim does not show up in Globo, follow ', ref('EDI claim failed to import'), '.'),
      demo(),
    ],
  },
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
    category: 'Clients & Terms and Conditions / Coverage summaries',
    owner: 'admin',
    tags: ['northwind', 'travel insurance', 'coverage'],
    reviewDate: '2027-01-15',
    fields: {
      summary: 'What we may authorise for Northwind policyholders without calling the client first.',
      client: 'Northwind Travel Insurance (fictional)', contractRef: 'NW-ASSIST-2026-DEMO', validFrom: '2026-01-01', validTo: '2026-12-31', region: 'Worldwide excl. USA/Canada',
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
    category: 'Troubleshooting Center / EDI issues',
    owner: 'editor',
    tags: ['edi', 'import', 'error', '837i'],
    reviewDate: '2026-10-20',
    fields: {
      summary: 'A provider says they sent a claim by EDI, but there is no invoice on the case.',
      symptom: 'Claim visible in the EDI Monitor but no invoice in Globo.',
      cause: 'Usually a missing GOP, an invalid member ID, or no open case to match.',
      fix: 'Correct the reference data, then re-queue the claim from quarantine.',
    },
    content: [
      h(2, 'Check these in order'),
      steps(
        { title: 'Is there a GOP for this case?', body: [p('Open the case and the ', b('Guarantees'), ' tab. If not, the matcher rejects the claim with ', code('E-112 NO_GOP'), '. Ask the medical team to issue one, then re-queue.')] },
        { title: 'Is the member ID valid?', body: [p('Compare ', code('NM1*IL'), ' in the claim with the policy record. Leading zeros are often dropped by providers.')] },
        { title: 'Does a matching case exist?', body: [p('The matcher needs an open case with the same member and an admission date within ±3 days. Closed cases are not matched.')] },
        { title: 'Re-queue the claim', body: [p('In the EDI Monitor, open ', b('Quarantine'), ', select the claim and choose ', b('Retry match'), '.')] },
      ),
      callout('success', 'Resolved?', p('The invoice appears in Globo within 5 minutes with status ', hl('Registered'), '.')),
      h(2, 'Error codes'),
      table(['Code', 'Meaning', 'Who fixes it'],
        ['E-112 NO_GOP', 'No guarantee of payment on the case', 'Medical team'],
        ['E-118 MEMBER', 'Member ID not found on the policy', 'Claims handler'],
        ['E-121 NOCASE', 'No open case in the date window', 'Case manager'],
        ['E-200 SYNTAX', 'Segment syntax error, see the 999', 'Provider / EDI team']),
      p('Background: ', ref(ediTech), '. To register the invoice manually instead, use ', ref(invoiceWi), '.'),
      p('Still stuck? Raise a ticket with the EDI team: ', a('edi-support@example.test', 'mailto:edi-support@example.test'), '.'),
      demo(),
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
      ul('Issued from the Guarantees tab in Globo.', 'Sent to the provider by fax or e-mail; providers reference it in their invoice.', 'Required before an EDI claim can be matched.'),
      p('See also ', ref('EDI claim failed to import'), '.'),
      demo(),
    ],
  },
  {
    title: ack999,
    type: 'glossary',
    category: 'Glossary & Acronyms / EDI terms',
    owner: 'admin',
    tags: ['999', 'edi', 'acknowledgement', 'glossary'],
    fields: {
      term: 'Implementation Acknowledgement', acronym: '999',
      definition: 'The X12 transaction that tells the sender whether a file passed syntax validation.',
      relatedTerms: ['TA1', '277CA', '837I'],
    },
    content: [
      p('A 999 is generated by the EDI Gateway within seconds of pickup. ', b('Accepted'), ' means the file is syntactically valid, not that the claims inside will be paid.'),
      table(['IK5 code', 'Meaning'], ['A', 'Accepted'], ['E', 'Accepted with errors'], ['R', 'Rejected']),
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
  {
    title: 'Handling medical records requests',
    type: 'standard',
    category: 'Claims & Reimbursements / Medical records',
    owner: 'editor',
    tags: ['medical records', 'privacy', 'claims'],
    reviewDate: '2027-02-01',
    fields: { summary: 'How to request records from a hospital and how to store them safely.' },
    content: [
      p('We request medical records only when the medical team needs them to confirm cover or plan a repatriation.'),
      h(2, 'Requesting records'),
      ul('Use the request template in Globo; it includes the patient’s signed consent.', 'Ask only for the admission period, not the full history.', 'Chase after 48 hours, then escalate to the medical team.'),
      h(2, 'Storing records'),
      callout('danger', 'Never by e-mail attachment', p('Records go into the case’s ', b('Medical'), ' folder only. Delete any copy from your mailbox and downloads.')),
      collapsible('Retention', p('Records are kept for 10 years after the case closes, then deleted automatically.')),
      demo(),
    ],
  },
];

export const SEED_ARTICLES: SeedArticle[] = [
  ...CORE_ARTICLES, ...EDI_ARTICLES, ...CLIENT_ARTICLES, ...CLAIMS_ARTICLES,
  ...NETWORK_FINANCE_ARTICLES, ...SYSTEMS_ARTICLES, ...GLOSSARY_ARTICLES,
];
