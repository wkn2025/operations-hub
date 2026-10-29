import type { ArticleType } from './roles';

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
