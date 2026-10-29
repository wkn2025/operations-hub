import type { Article } from '../../../api/client';
import { ArticleRenderer } from '../ArticleRenderer';
import { Body, Lede, MetaRow, Title } from './parts';

export function Standard({ article: a }: { article: Article }) {
  return (
    <article data-template="standard">
      <header>
        <Title>{a.title}</Title>
        {a.fields.summary && <Lede>{a.fields.summary}</Lede>}
        <MetaRow article={a} />
      </header>
      <Body><ArticleRenderer doc={a.content} links={a.linkTargets} /></Body>
    </article>
  );
}
