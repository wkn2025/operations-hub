import { GitCommitHorizontal } from 'lucide-react';
import type { Article } from '../../../api/client';
import { ArticleRenderer } from '../ArticleRenderer';
import { Body, Lede, MetaRow, Title } from './parts';

export function Technical({ article: a }: { article: Article }) {
  const f = a.fields;
  return (
    <article data-template="technical">
      <header>
        <Title>{a.title}</Title>
        {f.summary && <Lede>{f.summary}</Lede>}
        {(!!f.systems?.length || f.version) && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {!!f.systems?.length && (
              <ul aria-label="Systems" className="flex flex-wrap gap-2">
                {f.systems.map((s) => (
                  <li key={s} className="inline-flex items-center gap-2 rounded-[10px] bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-200">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />{s}
                  </li>
                ))}
              </ul>
            )}
            {f.version && (
              <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-neutral-100 px-3 py-1.5 font-mono text-[12.5px] text-neutral-600">
                <GitCommitHorizontal size={14} aria-hidden /><span>{f.version}</span>
              </span>
            )}
          </div>
        )}
        <MetaRow article={a} />
      </header>
      <Body><ArticleRenderer doc={a.content} links={a.linkTargets} /></Body>
    </article>
  );
}
