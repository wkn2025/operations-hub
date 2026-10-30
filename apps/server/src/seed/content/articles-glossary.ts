import type { SeedArticle } from './articles';
import { REIMBURSEMENT_WI } from './articles-claims';
import { b, callout, demo, p, ref, table } from './pm';

/** DEMO: glossary entries and the acronym list. */
export const GLOSSARY_ARTICLES: SeedArticle[] = [
  {
    title: 'Explanation of Benefits (EOB)',
    type: 'glossary',
    category: 'Glossary & Acronyms / Medical terms',
    owner: 'admin',
    tags: ['eob', 'remittance', 'glossary'],
    fields: {
      term: 'Explanation of Benefits', acronym: 'EOB',
      definition: 'The statement sent with a payment or denial that lists each billed item, the amount paid, and the reason for any amount not paid.',
      aliases: ['Remittance advice', 'Decision letter'], relatedTerms: ['Denial reason code', '835', 'Excess'],
    },
    content: [
      p('Providers receive an EOB with every payment run; members receive it as the decision letter on a reimbursement. Denied lines carry the denial reason codes listed in ', ref(REIMBURSEMENT_WI), '.'),
      demo(),
    ],
  },
  {
    title: 'Cost containment',
    type: 'glossary',
    category: 'Glossary & Acronyms / Medical terms',
    owner: 'admin',
    tags: ['cost containment', 'glossary', 'medical'],
    fields: {
      term: 'Cost containment',
      definition: 'Everything we do to keep medical costs reasonable without affecting care: GOP limits, tariff agreements, bill review and steering patients to network providers.',
      aliases: ['Bill review', 'Medical cost management'], relatedTerms: ['GOP', 'Provider network', 'Tariff'],
    },
    content: [
      table(['Lever', 'Example'],
        ['Guarantee limits', 'A GOP for the expected stay only, extended when needed'],
        ['Network steering', 'Admit to a network hospital with an agreed discount'],
        ['Bill review', 'Check items and unit prices before approval'],
        ['Early repatriation', 'Move a stable patient home sooner']),
      p('See ', ref('GOP (Guarantee of Payment)'), ' and ', ref('Clinica Solaris Group: network agreement terms'), '.'),
      demo(),
    ],
  },
  {
    title: 'Operations acronyms A to Z',
    type: 'standard',
    category: 'Glossary & Acronyms',
    owner: 'editor',
    tags: ['acronyms', 'glossary', 'abbreviations'],
    reviewDate: '2027-06-30',
    fields: { summary: 'The abbreviations you will meet in cases, invoices, EDI files and finance, on one page.' },
    content: [
      callout('tip', 'Search first', p('Most of these also have their own glossary entry. Type the acronym into search.')),
      p('Sorted A to Z (numbers first). The Area column says where you will meet each one.'),
      table(['Acronym', 'Meaning', 'Area'],
        ['277CA', 'Claim Acknowledgement', 'EDI'],
        ['837P / 837I', 'Health Care Claim, professional / institutional', 'EDI'],
        ['999', 'Implementation Acknowledgement', 'EDI'],
        ['ECB', 'European Central Bank (reference rates)', 'Finance'],
        ['EDI', 'Electronic Data Interchange', 'EDI'],
        ['EOB', 'Explanation of Benefits', 'Claims'],
        ['FX', 'Foreign exchange', 'Finance'],
        ['GOP', 'Guarantee of Payment', 'Claims'],
        ['IBAN', 'International Bank Account Number', 'Finance'],
        ['ICD-10', 'International Classification of Diseases, 10th revision', 'Claims'],
        ['ISA / GS', 'Interchange / functional group header', 'EDI'],
        ['LOG', 'Letter of Guarantee (same as GOP)', 'Claims'],
        ['MRR', 'Medical Records Request', 'Claims'],
        ['SEPA', 'Single Euro Payments Area', 'Finance'],
        ['SHA', 'Shared bank charges', 'Finance'],
        ['TA1', 'Interchange Acknowledgement (envelope errors)', 'EDI'],
        ['TPA', 'Third-Party Administrator', 'Claims']),
      p('Full entries: ', ref('GOP (Guarantee of Payment)'), ', ', ref('837 Health Care Claim'), ', ', ref('999 Implementation Acknowledgement'), ', ', ref('Explanation of Benefits (EOB)'), '. Internal systems ', b('Globo'), ' and ', b('ECNet'), ' are described in ', ref('Globo: cases, guarantees and invoices'), '.'),
      demo(),
    ],
  },
];
