import type { SeedArticle } from './articles';
import { REIMBURSEMENT_WI } from './articles-claims';
import { b, callout, code, demo, h, ol, p, ref, steps, table, tasks } from './pm';

/** DEMO: Quality Assurance checks, sign-offs and sampling. Fictional procedures, thresholds and figures. */
export const QA_ARTICLES: SeedArticle[] = [
  {
    title: 'Claim file pre-payment QA checklist',
    type: 'work_instruction',
    category: 'Quality Assurance / Quality checks',
    owner: 'editor',
    tags: ['qa', 'checklist', 'claims', 'pre-payment'],
    reviewDate: '2027-02-15',
    fields: {
      summary: 'The second-person check of an approved claim file before it may join a payment run.',
      purpose: 'No claim above the four-eyes limit is paid with a missing document, a wrong amount or an unexplained denial.',
      scope: 'Approved claims and reimbursements of EUR 5,000 or more, plus any claim flagged by the sampling standard.',
      audience: 'QA reviewers, team leads',
      verification: 'The QA task on the case is closed as Passed, or the claim is back with the handler with a finding code.',
    },
    content: [
      p('Run this checklist on the approved file, not on the original documents alone. The procedure being checked is ', ref(REIMBURSEMENT_WI), '.'),
      h(2, 'Checklist'),
      tasks(
        [false, 'Claim form, itemised receipts or invoice, and medical report are on the case'],
        [false, 'GOP covers provider, dates and amount (provider invoices)'],
        [false, 'Approved amount matches the items minus excess or deductible'],
        [false, 'Every denied line has the most specific reason code (D01 to D07)'],
        [false, 'Approval note names the GOP and the checks done; second approver present above EUR 5,000'],
        [false, 'Bank details belong to the member, policyholder or provider of record'],
      ),
      h(2, 'Procedure'),
      steps(
        { title: 'Pick up the QA task', body: [p('Globo, ', b('Tasks'), ', queue ', code('QA pre-payment'), '. You may not check a claim you approved yourself.')] },
        { title: 'Work through the checklist', body: [p('Tick each line in the task. One unticked line is a finding.')] },
        { title: 'Record the result', body: [p('Passed: close the task; the claim joins the next run. Finding: return it to the handler with a code from ', ref('QA sampling and scoring standard'), '.')] },
      ),
      callout('warning', 'Cut-off', p('QA must be finished by Tuesday 16:00 CET for the claim to join that week’s run.')),
      demo(),
    ],
  },
  {
    title: 'Payment run QA sign-off',
    type: 'work_instruction',
    category: 'Quality Assurance / Quality checks',
    owner: 'editor',
    tags: ['qa', 'payment run', 'sign-off', 'finance'],
    reviewDate: '2027-01-20',
    fields: {
      summary: 'The QA check of the weekly payment file before the Finance lead releases it.',
      purpose: 'The payment file contains only approved, QA-passed items and no duplicates.',
      scope: 'The weekly provider and member payment run in ECNet.',
      audience: 'QA reviewers, Finance lead',
      verification: 'The run shows the QA sign-off in ECNet before the four-eyes release at Wednesday 12:00.',
    },
    content: [
      p('This check sits between file creation and the four-eyes release in the ', ref('Weekly provider payment run'), '.'),
      h(2, 'Procedure'),
      steps(
        { title: 'Open the draft run', body: [p('ECNet, ', b('Payment runs'), ', status ', code('Draft'), '. Export the run summary.')] },
        { title: 'Reconcile totals', body: [p('Total and item count must match the Globo approval report for the same cut-off.')] },
        { title: 'Look for duplicates', body: [p('Same payee, same amount, same invoice number: remove the second item and tell the handler.')] },
        { title: 'Check high values', body: [p('Every item above EUR 25,000 needs the head of operations approval on the case.')] },
        { title: 'Sign off', body: [p('Choose ', b('QA approve'), '. The Finance lead can now release the run.')] },
      ),
      table(['Finding', 'Action'], ['Totals differ', 'Hold the run, ask Claims for the missing approvals'], ['Duplicate', 'Remove item, record finding'], ['Missing high-value approval', 'Remove item until approved']),
      demo(),
    ],
  },
  {
    title: 'QA sampling and scoring standard',
    type: 'standard',
    category: 'Quality Assurance / Audit & sampling',
    owner: 'admin',
    tags: ['qa', 'sampling', 'audit', 'scoring'],
    reviewDate: '2027-03-31',
    fields: { summary: 'How many claim files QA samples each month, how findings are scored, and when a handler gets 100 % checking.' },
    content: [
      h(2, 'Sample size'),
      table(['Population', 'Monthly sample'], ['Claims under EUR 5,000', '5 % per handler, at least 10 files'], ['Claims EUR 5,000 or more', '100 % (pre-payment checklist)'], ['New handlers (first 3 months)', '100 %']),
      h(2, 'Finding codes and scores'),
      table(['Code', 'Finding', 'Score'], ['Q1', 'Wrong amount paid', '5'], ['Q2', 'Missing mandatory document', '3'], ['Q3', 'Wrong or vague denial code', '2'], ['Q4', 'Approval note incomplete', '1']),
      h(2, 'Thresholds'),
      ol('Target: average score below 1.0 per sampled file.', 'Above 2.0 in a month: the handler moves to 100 % checking for the next month.', 'Any Q1: correct the payment at once and report it to the team lead.'),
      callout('info', 'Where the results go', p('Monthly results are shared in the team meeting by team, never as a ranking of individuals.')),
      p('Pre-payment checks: ', ref('Claim file pre-payment QA checklist'), '.'),
      demo(),
    ],
  },
];
