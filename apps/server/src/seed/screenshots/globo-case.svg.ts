import { frame, grid, heading, nav, note, status } from './frame';

/** Illustrative DEMO screenshot of a fictional Globo case, Guarantees tab. */
export const globoCaseSvg = frame('Globo', `${nav(['Case overview', 'Guarantees', 'Invoices', 'Medical', 'Correspondence', 'Audit trail'], 1)}
  ${heading('Case C-DEMO-20931 · Guarantees', 'Patient: Demo Patient A · Northwind Travel Insurance (fictional) · admitted 2026-10-21')}
  ${grid(140, [24, 170, 330, 450, 568], ['GOP number', 'Provider', 'Amount', 'Used', 'Status'], [
    ['GOP-DEMO-5512', 'Clinica Solaris', 'EUR 5,000', 'EUR 3,140', 'Active'],
    ['GOP-DEMO-5530', 'Clinica Solaris', 'EUR 2,500', 'EUR 0', 'Pending'],
    ['GOP-DEMO-5401', 'Harbor Ambulance', 'EUR 900', 'EUR 900', 'Expired'],
  ], status)}
  ${note(330, 'Remaining balance on GOP-DEMO-5512: EUR 1,860', ['Invoices above the remaining balance cannot be registered.', 'Ask the medical team to extend the GOP before registering a larger invoice.'])}
  <g transform="translate(232 444)">
    <rect width="132" height="36" rx="10" fill="#26408F"/><text x="66" y="23" font-size="13" font-weight="600" fill="#fff" text-anchor="middle">New GOP</text>
    <rect x="144" width="152" height="36" rx="10" fill="#fff" stroke="#C9CFDC"/><text x="220" y="23" font-size="13" font-weight="600" fill="#26408F" text-anchor="middle">Request extension</text>
  </g>`);
