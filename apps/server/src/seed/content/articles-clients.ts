import type { SeedArticle } from './articles';
import { b, callout, collapsible, demo, h, p, ref, steps, table, ul } from './pm';

/** DEMO: client coverage summaries (full terms and conditions live in articles-client-terms.ts). All clients, contract references, limits and contacts are fictional. */
export const CLIENT_ARTICLES: SeedArticle[] = [
  {
    title: 'Meridian Expat Care: coverage summary',
    type: 'client_terms',
    category: 'Clients & Terms and Conditions / Coverage summaries',
    owner: 'admin',
    tags: ['meridian', 'expat', 'coverage'],
    reviewDate: '2027-01-01',
    fields: {
      summary: 'International health plan for expatriates. Covers planned and emergency care; direct billing with network hospitals.',
      client: 'Meridian Expat Care (fictional)', contractRef: 'MER-EXP-2026-DEMO', validFrom: '2026-01-01', validTo: '2027-12-31', region: 'Worldwide excl. USA',
      keyLimits: [
        { label: 'Annual limit', value: 'EUR 2,000,000' },
        { label: 'Authorise without client', value: 'EUR 15,000' },
        { label: 'Deductible per year', value: 'EUR 500' },
        { label: 'Maternity', value: 'EUR 12,000 (after 10 months)' },
      ],
    },
    content: [
      p('Meridian members live abroad, so cases are often planned admissions rather than emergencies. Pre-authorisation is required for any inpatient stay.'),
      h(2, 'Benefits'),
      table(['Benefit', 'Limit', 'Pre-authorisation'],
        ['Inpatient treatment', 'Annual limit', 'Yes, 5 working days before'],
        ['Outpatient and specialists', 'EUR 20,000 per year', 'No'],
        ['Maternity', 'EUR 12,000', 'Yes, at 20 weeks'],
        ['Chronic conditions', 'Included', 'Yearly treatment plan'],
        ['Evacuation', 'Actual cost', 'Yes']),
      h(2, 'Direct billing'),
      p('Network hospitals bill us directly, usually by EDI. Non-network providers are paid by the member and reimbursed. The yearly deductible is tracked in Globo on the policy record.'),
      callout('warning', 'Deductible first', p('Before approving a claim, check the remaining deductible on the policy. The approval screen does not deduct it automatically for Meridian. See ', ref('Approve a claim for payment'), '.')),
      demo(),
    ],
  },
];
