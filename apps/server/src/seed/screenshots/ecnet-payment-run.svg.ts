import { frame, grid, heading, nav, note, status } from './frame';

/** Illustrative DEMO screenshot of a fictional ECNet payment run. */
export const ecnetPaymentRunSvg = frame('ECNet', `${nav(['Payment runs', 'Postings', 'Returned payments', 'FX rates', 'Reconciliation'], 0)}
  ${heading('Payment run PR-DEMO-2026-44', 'Wednesday 2026-10-28 · cut-off Tue 16:00 CET · 4-eyes sign-off required')}
  ${grid(140, [24, 200, 330, 450, 568], ['Provider', 'Invoices', 'Currency', 'Amount', 'Status'], [
    ['Clinica Solaris', '14', 'EUR', '48,210.00', 'Approved'],
    ['Harbor Ambulance', '3', 'EUR', '6,400.00', 'Approved'],
    ['Bangkok Demo Hosp.', '6', 'THB', '412,500.00', 'Awaiting FX'],
    ['Alpine Demo Klinik', '2', 'CHF', '9,870.00', 'Returned'],
  ], status)}
  ${note(370, 'Sign-off 1 of 2 complete', ['Signed by: Finance assistant (demo) at 09:42.', 'Second signature: Finance lead. The file is sent to the bank after both signatures.'], 'ok')}`);
