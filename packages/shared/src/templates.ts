import type { ArticleType } from './roles';

export const CLIENT_LINES = ['corporate', 'travel'] as const;
export const CLIENT_DOC_KINDS = ['full', 'summary'] as const;
export type ClientLine = (typeof CLIENT_LINES)[number];
export type ClientDocKind = (typeof CLIENT_DOC_KINDS)[number];
export const CLIENT_LINE_LABELS: Record<ClientLine, string> = { corporate: 'Corporate', travel: 'Travel' };
export const CLIENT_DOC_LABELS: Record<ClientDocKind, string> = { full: 'Full T&C', summary: 'Coverage summary' };

/**
 * Template-specific keys stored in `articles.fields` (all optional). Read by the web templates (Task 5),
 * edited by MetaPanel (Task 6). `client`, `term`, `acronym`, `aliases` are also indexed by search.
 */
export interface TemplateFields {
  summary?: string; // all types: one-line lede under the title
  // work_instruction
  purpose?: string; scope?: string; audience?: string; verification?: string;
  // client_terms
  client?: string; contractRef?: string; validFrom?: string; validTo?: string; region?: string;
  line?: ClientLine; docKind?: ClientDocKind; // place in the Clients & T&C directory: client -> line -> document
  keyLimits?: { label: string; value: string }[];
  // technical
  systems?: string[]; version?: string;
  // troubleshooting
  symptom?: string; cause?: string; fix?: string; flowId?: string;
  // glossary
  term?: string; acronym?: string; definition?: string; aliases?: string[]; relatedTerms?: string[];
}

export const TEMPLATE_LABELS: Record<ArticleType, string> = {
  standard: 'Article',
  work_instruction: 'Work instruction',
  client_terms: 'Client terms',
  technical: 'Technical documentation',
  troubleshooting: 'Troubleshooting guide',
  glossary: 'Glossary entry',
};
