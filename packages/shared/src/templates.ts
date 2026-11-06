import type { ArticleType } from './roles';

export const CLIENT_LINES = ['corporate', 'travel'] as const;
export const CLIENT_DOC_KINDS = ['full', 'summary'] as const;
export type ClientLine = (typeof CLIENT_LINES)[number];
export type ClientDocKind = (typeof CLIENT_DOC_KINDS)[number];
/** Countries and territories of the Americas (same 55 as Bank information); the Country Specifics directory lists them all. */
export const AMERICAS = [
  'Anguilla', 'Antigua and Barbuda', 'Argentina', 'Aruba', 'Bahamas', 'Barbados', 'Belize', 'Bermuda', 'Bolivia', 'Bonaire, Sint Eustatius and Saba', 'Brazil', 'British Virgin Islands', 'Canada', 'Cayman Islands', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Curaçao', 'Dominica', 'Dominican Republic', 'Ecuador', 'El Salvador', 'Falkland Islands', 'French Guiana', 'Greenland', 'Grenada', 'Guadeloupe', 'Guatemala', 'Guyana', 'Haiti', 'Honduras', 'Jamaica', 'Martinique', 'Mexico', 'Montserrat', 'Nicaragua', 'Panama', 'Paraguay', 'Peru', 'Puerto Rico', 'Saint Barthélemy', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin (French part)', 'Saint Pierre and Miquelon', 'Saint Vincent and the Grenadines', 'Sint Maarten (Dutch part)', 'Suriname', 'Trinidad and Tobago', 'Turks and Caicos Islands', 'US Virgin Islands', 'United States', 'Uruguay', 'Venezuela',
] as const;
export type AmericasCountry = (typeof AMERICAS)[number];
export const COUNTRY_DOCS = ['providers', 'specifics', 'evacuation'] as const;
export type CountryDoc = (typeof COUNTRY_DOCS)[number];
export const COUNTRY_DOC_LABELS: Record<CountryDoc, string> = { providers: 'Preferred providers', specifics: 'Country specifics', evacuation: 'Repatriation / evacuation' };
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
  // any type filed under Work Instructions / Country Specifics: country -> document in the directory
  country?: AmericasCountry; countryDoc?: CountryDoc;
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
