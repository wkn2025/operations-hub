import type { FlowNode } from '@ops/shared';
import { GLOBAL_CODE_FLOW } from './global-code-finder';

/**
 * Seed guided flows: DEMO ones (fictional procedures, title ends in "(DEMO)") and the real EDI import flow. Extension point like SEED_ARTICLES. Article nodes name a seeded article by
 * slug (resolved to its id at seed time). `articleSlug` on the flow links the flow to a troubleshooting article.
 */
export type SeedFlowNode = Omit<FlowNode, 'articleId'> & { articleSlug?: string };
export interface SeedFlow { title: string; articleSlug?: string; startId: string; nodes: SeedFlowNode[] }

const yn = (yes: string, no: string) => [{ label: 'Yes', to: yes }, { label: 'No', to: no }];

export const SEED_FLOWS: SeedFlow[] = [
  {
    // real procedure (EDI 101 reference), not DEMO: the three import checks, then the web.transformer pages
    title: 'EDI claim failed to import',
    articleSlug: 'edi-claim-failed-to-import',
    startId: 'member',
    nodes: [
      { id: 'member', kind: 'question', text: 'Does the Member ID on the invoice exist in Globo?', detail: 'Import check 1 of 3.', options: yn('missing-claim', 'denied') },
      { id: 'denied', kind: 'result', severity: 'warning', text: 'The invoice was automatically denied.', detail: 'An invoice whose Member ID does not exist in Globo is denied at the first import check.' },
      { id: 'missing-claim', kind: 'question', text: 'Is the invoice on the Missing Claim page in web.transformer?', detail: 'Import check 2: the patient has no open case with the same diagnosis as the invoice.', options: yn('claim', 'missing-gop') },
      { id: 'claim', kind: 'article', text: 'Read the error description, then find or open the right case', articleSlug: 'web-transformer-missing-claim' },
      { id: 'missing-gop', kind: 'question', text: 'Is the invoice on the Missing GOP page in web.transformer?', detail: 'Import check 3: no open GOP with the same service dates and a provider registered under the Tax ID on the invoice.', options: yn('gop', 'manual') },
      { id: 'gop', kind: 'article', text: 'Create the GOP on the invoice service dates', articleSlug: 'web-transformer-missing-gop' },
      { id: 'manual', kind: 'question', text: 'Is the invoice on the Manual Handling page?', detail: 'It was imported, but the PCF could not be built when it moved from Pay to Settled.', options: yn('fix-pcf', 'entries') },
      { id: 'fix-pcf', kind: 'article', text: 'Add the missing information and export again', articleSlug: 'web-transformer-manual-handling' },
      { id: 'entries', kind: 'article', text: 'Look the invoice up in All Entries', articleSlug: 'web-transformer-all-entries' },
    ],
  },
  {
    title: 'Invoice cannot be registered (DEMO)',
    startId: 'case',
    nodes: [
      { id: 'case', kind: 'question', text: 'Does Globo find the case number on the invoice?', detail: 'DEMO flow: fictional procedure and data.', options: yn('gop', 'by-name') },
      { id: 'by-name', kind: 'question', text: 'Does a search by name and date of birth find exactly one case?', detail: 'Check that the admission date matches the invoice.', options: yn('gop', 'no-case') },
      { id: 'no-case', kind: 'result', severity: 'info', text: 'Ask the provider for the case number or assign the invoice to your team lead.' },
      { id: 'gop', kind: 'question', text: 'Is there an active GOP on the case?', options: yn('amount', 'no-gop') },
      { id: 'no-gop', kind: 'result', severity: 'warning', text: 'Stop. Do not register the invoice without a GOP.', detail: 'Assign the case to the medical team.' },
      { id: 'amount', kind: 'question', text: 'Does the invoice total fit the remaining GOP balance?', options: yn('currency', 'over') },
      { id: 'over', kind: 'result', severity: 'warning', text: 'The invoice exceeds the guarantee. Assign it to the medical team for an extension.' },
      { id: 'currency', kind: 'question', text: 'Is the invoice in the same currency as the GOP?', detail: 'Use the currency printed on the invoice, never a converted amount.', options: yn('register', 'fx') },
      { id: 'fx', kind: 'result', severity: 'info', text: 'Register it in the invoice currency. Globo converts at the payment date.' },
      { id: 'register', kind: 'article', text: 'Follow the registration procedure', articleSlug: 'register-an-incoming-provider-invoice' },
    ],
  },
  {
    title: 'Payment returned by bank (DEMO)',
    startId: 'reason',
    nodes: [
      { id: 'reason', kind: 'question', text: 'What reason did the bank give for returning the payment?', detail: 'DEMO flow: fictional procedure and data.', options: [{ label: 'Account closed or not found', to: 'iban' }, { label: 'Name does not match', to: 'name' }, { label: 'Another reason', to: 'other' }] },
      { id: 'iban', kind: 'question', text: 'Is the IBAN on the invoice the same as the one in the provider record?', options: yn('contact-bank', 'update-iban') },
      { id: 'update-iban', kind: 'result', severity: 'warning', text: 'Confirm the new IBAN by phone with the provider, then update the record.', detail: 'Never change bank details based on an e-mail alone.' },
      { id: 'contact-bank', kind: 'result', severity: 'info', text: 'The details are right, so ask the finance desk to contact the bank with the return reference.' },
      { id: 'name', kind: 'question', text: 'Does the beneficiary on the invoice match the provider master record?', options: yn('resubmit', 'fix-master') },
      { id: 'fix-master', kind: 'result', severity: 'info', text: 'Update the beneficiary name in the provider master data, then resubmit.' },
      { id: 'resubmit', kind: 'article', text: 'Add the payment to the next payment run', articleSlug: 'weekly-provider-payment-run' },
      { id: 'other', kind: 'question', text: 'Is the return reason a sanctions or compliance code?', options: yn('compliance', 'finance') },
      { id: 'compliance', kind: 'result', severity: 'warning', text: 'Do not retry. Report it to compliance immediately.' },
      { id: 'finance', kind: 'result', severity: 'info', text: 'Send the return notice to the finance desk and note it on the invoice.' },
    ],
  },
  GLOBAL_CODE_FLOW,
];
