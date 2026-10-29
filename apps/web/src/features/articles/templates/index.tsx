import type { ArticleType } from '@ops/shared';
import type { Article } from '../../../api/client';
import { Standard } from './Standard';
import { WorkInstruction } from './WorkInstruction';
import { ClientTerms } from './ClientTerms';
import { Technical } from './Technical';
import { Troubleshooting } from './Troubleshooting';
import { Glossary } from './Glossary';

const TEMPLATES: Record<ArticleType, (p: { article: Article }) => JSX.Element> = {
  standard: Standard, work_instruction: WorkInstruction, client_terms: ClientTerms, technical: Technical, troubleshooting: Troubleshooting, glossary: Glossary,
};

/** Picks the template by article.type (unknown types fall back to standard). */
export function ArticleTemplate({ article }: { article: Article }) {
  const T = TEMPLATES[article.type] ?? Standard;
  return <T article={article} />;
}
