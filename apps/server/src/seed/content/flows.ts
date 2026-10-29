import type { FlowNode } from '@ops/shared';

/**
 * DEMO guided flows (fictional procedures). Extension point like SEED_ARTICLES. Article nodes name a seeded article by
 * slug (resolved to its id at seed time). `articleSlug` on the flow links the flow to a troubleshooting article.
 */
export type SeedFlowNode = Omit<FlowNode, 'articleId'> & { articleSlug?: string };
export interface SeedFlow { title: string; articleSlug?: string; startId: string; nodes: SeedFlowNode[] }

const yn = (yes: string, no: string) => [{ label: 'Yes', to: yes }, { label: 'No', to: no }];

export const SEED_FLOWS: SeedFlow[] = [
  {
    title: 'EDI claim failed to import',
    articleSlug: 'edi-claim-failed-to-import',
    startId: 'gop',
    nodes: [
      { id: 'gop', kind: 'question', text: 'Is there a GOP for this case?', detail: 'Open the case in Globo and look at the Guarantees tab.', options: yn('member', 'no-gop') },
      { id: 'no-gop', kind: 'result', severity: 'warning', text: 'The matcher rejects claims without a guarantee (E-112 NO_GOP).', detail: 'Ask the medical team to issue a GOP, then re-queue the claim from Quarantine.' },
      { id: 'member', kind: 'question', text: 'Does the member ID on the claim match the policy record?', detail: 'Compare NM1*IL in the claim with the policy. Providers often drop leading zeros.', options: [{ label: 'Yes, they match', to: 'case' }, { label: 'No, they differ', to: 'fix-member' }, { label: 'I am not sure', to: 'recheck-member' }] },
      { id: 'recheck-member', kind: 'result', severity: 'info', text: 'Look the member up by name and date of birth first.', detail: 'Once you have the policy record open, come back and answer again.' },
      { id: 'fix-member', kind: 'result', severity: 'info', text: 'Correct the member ID on the claim and use Retry match.', detail: 'In the EDI Monitor open Quarantine, edit the claim and choose Retry match.' },
      { id: 'case', kind: 'question', text: 'Is there an open case with the same member and an admission date within 3 days?', options: [...yn('ack', 'closed-case'), { label: 'Go back and check the member ID again', to: 'member' }] },
      { id: 'closed-case', kind: 'question', text: 'Was a case for this member closed recently?', detail: 'Closed cases are never matched.', options: yn('reopen', 'new-case') },
      { id: 'reopen', kind: 'result', severity: 'warning', text: 'Ask the team lead to reopen the case, then re-queue the claim.' },
      { id: 'new-case', kind: 'result', severity: 'info', text: 'Create the case first. The claim cannot be imported without one.', detail: 'Assign it to the case management team with the claim reference.' },
      { id: 'ack', kind: 'question', text: 'Did the clearinghouse reject the file with a 999?', options: yn('reject-999', 'retry') },
      { id: 'reject-999', kind: 'article', text: 'Read how to interpret the 999 rejection', articleSlug: '999-implementation-acknowledgement' },
      { id: 'retry', kind: 'result', severity: 'success', text: 'Everything checks out. Re-queue the claim.', detail: 'EDI Monitor, Quarantine, select the claim, Retry match. It should import within a minute.' },
    ],
  },
  {
    title: 'Invoice cannot be registered',
    startId: 'case',
    nodes: [
      { id: 'case', kind: 'question', text: 'Does Globo find the case number on the invoice?', options: yn('gop', 'by-name') },
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
    title: 'Payment returned by bank',
    startId: 'reason',
    nodes: [
      { id: 'reason', kind: 'question', text: 'What reason did the bank give for returning the payment?', options: [{ label: 'Account closed or not found', to: 'iban' }, { label: 'Name does not match', to: 'name' }, { label: 'Another reason', to: 'other' }] },
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
];
