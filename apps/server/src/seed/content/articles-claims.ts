import type { SeedArticle } from './articles';
import { b, callout, code, collapsible, demo, h, hl, i, ol, p, ref, shot, steps, table, tasks, ul } from './pm';

/** The single end-to-end reimbursement work instruction (merged 2026-10-30 from five earlier articles). */
export const REIMBURSEMENT_WI = 'Reimbursement: from document intake to proof of payment';

/** DEMO: claims, GOPs, approvals, reimbursements, medical records and denials. Fictional procedures and figures. */
export const CLAIMS_ARTICLES: SeedArticle[] = [
  {
    title: 'Request a missing GOP',
    type: 'work_instruction',
    category: 'Work Instructions / Case handling',
    owner: 'editor',
    tags: ['gop', 'medical team', 'case handling'],
    reviewDate: '2026-12-10',
    fields: {
      summary: 'What to do when an invoice or EDI claim arrives for a case that has no guarantee of payment.',
      purpose: 'No invoice waits more than two working days because a GOP is missing.',
      scope: 'All clients and providers. Applies to paper invoices and to EDI claims quarantined with E-112 NO_GOP.',
      audience: 'Claims handlers, case managers',
      verification: 'The case shows an active GOP covering the invoice and the invoice or EDI claim is registered.',
    },
    content: [
      h(2, 'Before you start'),
      tasks([false, 'The case number and the provider name'], [false, 'The invoice or the quarantined claim reference'], [false, 'The client coverage summary for this case']),
      shot('globo-case.svg', 'Globo case Guarantees tab with three GOPs and a remaining-balance warning', 'Globo, Guarantees tab (illustrative DEMO screenshot)'),
      h(2, 'Procedure'),
      steps(
        { title: 'Confirm the GOP is really missing', body: [p('Open the ', b('Guarantees'), ' tab. A GOP for another provider on the same case does not count. An ', i('Expired'), ' GOP does not count either.')] },
        { title: 'Check the coverage', body: [p('Open the client summary (for example ', ref('Northwind Travel Insurance: coverage summary'), ') and check that the treatment is covered and within the authorisation limit.')] },
        { title: 'Create a GOP request task', body: [p('Choose ', b('Request extension'), ' or ', b('New GOP'), ', select reason ', code('Invoice received without GOP'), ', and attach the invoice.')] },
        { title: 'Tell the provider', body: [p('Reply that the invoice is on hold pending a guarantee. Do not promise payment.')] },
        { title: 'Re-process', body: [p('When the GOP is active, register the invoice with ', ref('Register an incoming provider invoice'), ', or retry the EDI claim from quarantine.')] },
      ),
      callout('warning', 'Over the authorisation limit', p('If the amount is above what we may authorise for the client, the medical team must contact the client first. Mark the task ', hl('Client approval needed'), '.')),
      p('Term explained: ', ref('GOP (Guarantee of Payment)'), '.'),
      demo(),
    ],
  },
  {
    title: REIMBURSEMENT_WI,
    type: 'work_instruction',
    category: 'Work Instructions / Reimbursements',
    owner: 'editor',
    tags: ['reimbursement', 'claims', 'approval', 'medical records', 'denial', 'proof of payment'],
    reviewDate: '2027-01-31',
    fields: {
      summary: 'The whole path of a member reimbursement or provider invoice: document intake, medical records, approval, denial reasons, payment and sending proof of payment.',
      purpose: 'Every complete claim is decided within 10 working days, only correct and covered amounts are paid, and the payee receives proof of payment.',
      scope: 'Member and policyholder reimbursement claims and registered provider invoices in Globo, any client. Requests from members for their own data go to the privacy officer, not this procedure.',
      audience: 'Claims handlers (approval rights where stated), case managers, medical assistants, team leads',
      verification: 'The claim is Approved or Denied with a reason code per line, the approval note names the GOP and the checks done, the payment is in a run, and the proof of payment is on the case and sent to the payee.',
    },
    content: [
      shot('claim-lifecycle.svg', 'Diagram: GOP issued, invoice in, registered, approved, paid', 'Claim lifecycle (illustrative DEMO diagram)'),
      p('One procedure from the moment documents arrive to the moment the payee has proof that we paid. Provider invoices enter at step 3 once registered with ', ref('Register an incoming provider invoice'), '.'),

      h(2, '1. Document intake and completeness'),
      p('A member claim is complete when you have:'),
      tasks([false, 'The claim form signed by the member'], [false, 'Itemised receipts (not only card slips)'], [false, 'A medical report or prescription for each treatment'], [false, 'Bank details in the member name (IBAN or SWIFT)']),
      steps(
        { title: 'Create the reimbursement', body: [p('On the case choose ', b('New reimbursement'), '. Enter each receipt as a line in its original currency and attach the scans.')] },
        { title: 'Check completeness', body: [p('Tick the checklist above in the case note. Anything missing goes into one letter (see the warning below).')] },
        { title: 'Verify bank details', body: [p('The account holder must be the member or policyholder. Third-party accounts need a signed authorisation.')] },
      ),
      callout('warning', 'Incomplete claims', p('Ask once for all missing documents in a single letter. After 30 days without an answer, close the claim as ', i('Incomplete'), '; it can be reopened.')),

      h(2, '2. Medical records request (only when the medical team needs them)'),
      p('We request medical records only to confirm cover or plan a repatriation, and only for the admission period.'),
      steps(
        { title: 'Check consent', body: [p('The case must have a signed consent form (', code('Consent'), ' tab). No consent: ask the member first.')] },
        { title: 'Generate the request', body: [p('Case, ', b('Correspondence'), ', template ', code('MED-REQ-01'), '. Enter the admission period and the documents needed: discharge summary, lab results, imaging report.')] },
        { title: 'Send through the secure channel', body: [p('Use the provider portal or encrypted e-mail. Fax only if the hospital has no other option.')] },
        { title: 'Chase', body: [table(['When', 'Action'], ['After 48 hours', 'Phone the medical records office'], ['After 4 working days', 'Second written request'], ['After 5 working days', 'Escalate to the medical team lead'])] },
        { title: 'File the records', body: [p('Upload to the case ', b('Medical'), ' folder, close the task, delete local copies.')] },
      ),
      callout('danger', 'Minimum necessary, never by e-mail attachment', p('Never request a full medical history. Records live only in the case Medical folder; delete any copy from your mailbox and downloads.')),
      collapsible('Retention', p('Medical records are kept for 10 years after the case closes, then deleted automatically.')),

      h(2, '3. Assessment and approval'),
      h(3, 'Approval limits'),
      table(['Amount (EUR equivalent)', 'Who approves'],
        ['Up to 5,000', 'Claims handler'],
        ['5,000 to 25,000', 'Claims handler + team lead (four eyes)'],
        ['Above 25,000', 'Team lead + head of operations']),
      steps(
        { title: 'Open the approval queue', body: [p('Globo, ', b('Invoices'), ', filter ', code('Status = Registered'), ', oldest first. Member reimbursements appear in the same queue.')] },
        { title: 'Match to the GOP', body: [p('Provider invoices: same provider, dates inside the GOP period, amount within the remaining balance. No GOP: ', ref('Request a missing GOP'), '.')] },
        { title: 'Check the items', body: [ul('Every billed item belongs to the treatment in the medical report.', 'No duplicates of items already paid on this case.', 'Unit prices in line with the provider agreement, if there is one.')] },
        { title: 'Apply client rules', body: [p('Apply the limits, excess or deductible from the client terms, for example ', ref('Wayfarer Family Travel Plan: policy terms and conditions'), '. Deny excluded lines with a reason code from section 4.')] },
        { title: 'Approve', body: [p('Set the approved amount and write the approval note. Above EUR 5,000 the claim waits for the second approver. Globo then generates the decision letter; check that denied lines show a reason.')] },
      ),
      callout('tip', 'Partial approval', p('Approve the covered part and deny the rest in one action. The payee gets a single remittance with both lines.')),

      h(2, '4. Denial reasons and how to explain them'),
      p('Every denied line needs a reason code. The code drives the remittance text and our reporting, so pick the most specific one.'),
      table(['Code', 'Reason', 'What to tell the provider or member'],
        ['D01', 'Not covered by the policy', 'This treatment is excluded under the policy terms.'],
        ['D02', 'No GOP / above GOP', 'The amount exceeds the guarantee we issued. Please contact us before treating further.'],
        ['D03', 'Duplicate', 'This item was already paid on invoice [number].'],
        ['D04', 'Outside policy period', 'The treatment date is outside the cover period.'],
        ['D05', 'Missing documents', 'Please send the itemised invoice and the medical report.'],
        ['D06', 'Excess or deductible', 'This amount is the policy excess and is payable by the patient.'],
        ['D07', 'Price above agreement', 'The price exceeds the agreed tariff; we paid the agreed amount.']),
      h(3, 'Good practice'),
      ol('Deny lines, not whole invoices, wherever possible.', 'Never deny for missing documents without asking for them first.', 'Write the note for the reader: no internal system names or error codes.'),
      callout('info', 'Disputes', p('If a provider disagrees, follow ', ref('Provider disputes an invoice denial'), '.')),

      h(2, '5. Payment'),
      p('Approved amounts are paid in the ', ref('Weekly provider payment run'), ' (cut-off Tuesday 16:00 CET). Members are paid in the currency of their bank account at the ECB reference rate on the receipt date; details in ', ref('Currency conversion and bank fees'), '.'),

      h(2, '6. Sending proof of payment'),
      steps(
        { title: 'Wait for the run to settle', body: [p('Funds are sent on Wednesday and normally arrive Thursday (SEPA). The ECNet payment status changes to ', hl('Paid'), '.')] },
        { title: 'Download the payment confirmation', body: [p('In ECNet open the payment and export the confirmation: payee, amount, currency, value date and payment reference. See ', ref('ECNet: postings and payment files'), '.')] },
        { title: 'Attach it to the case', body: [p('Upload the confirmation to the case ', b('Finance'), ' folder, file name ', code('POP_<case>_<paymentRef>.pdf'), '.')] },
        { title: 'Send it to the payee', body: [p('Members: Globo template ', code('PAY-CONF-01'), ' with the confirmation attached. Providers receive the remittance advice automatically; send the confirmation only on request.')] },
        { title: 'Close the task', body: [p('Close the reimbursement task. A returned payment reopens it: see ', ref('Payment returned by the bank'), '.')] },
      ),
      callout('warning', 'Only this payee', p('Proof of payment shows one payment. Never send a bank statement, a payment file or anything that shows other payees.')),
      demo(),
    ],
  },
  {
    title: 'Provider disputes an invoice denial',
    type: 'troubleshooting',
    category: 'Finance & Payment Processing / Payment issues',
    owner: 'editor',
    tags: ['denial', 'dispute', 'provider'],
    reviewDate: '2026-12-20',
    fields: {
      summary: 'A provider writes back that a denied invoice line should have been paid.',
      symptom: 'Provider dispute received for an invoice line with status Denied.',
      cause: 'Most often missing documents (D05) that have since arrived, a GOP extended after the denial (D02), or a wrong reason code.',
      fix: 'Re-check the line against the new information; reverse the denial if it no longer applies, otherwise confirm it in writing.',
    },
    content: [
      h(2, 'Check these in order'),
      steps(
        { title: 'Read the denial note', body: [p('Which code was used and what was the evidence at the time?')] },
        { title: 'Has something changed?', body: [ul('New documents received (D05)', 'GOP increased since the denial (D02)', 'Corrected invoice with new prices (D07)')] },
        { title: 'Reverse or confirm', body: [p('If the reason no longer applies, choose ', b('Reverse denial'), ' and approve the line as in ', ref(REIMBURSEMENT_WI), '. If it still applies, confirm the denial with the standard sentence from the denial reason table in the same work instruction.')] },
        { title: 'Escalate if unsure', body: [p('Medical questions go to the medical team; contract questions to the provider network team.')] },
      ),
      collapsible('Time limits', p('Providers can dispute within 90 days of the remittance. Later disputes need team lead approval.')),
      demo(),
    ],
  },
];
