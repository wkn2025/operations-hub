import type { Article } from '../../../api/client';
import { useSearch } from '../../search/SearchDialog';
import { ArticleRenderer } from '../ArticleRenderer';
import { Body, MetaRow } from './parts';

export function Glossary({ article: a }: { article: Article }) {
  const f = a.fields;
  const { openWith } = useSearch();
  const big = f.acronym || f.term || a.title;
  const sub = f.acronym ? f.term : undefined;
  return (
    <article data-template="glossary">
      <header className="relative overflow-hidden rounded-[22px] bg-white px-8 pb-8 pt-9 shadow-md ring-1 ring-neutral-200/80">
        <h1 className="relative">
          <span className="inline-block hl-under px-1 text-[64px] font-bold leading-none tracking-[-0.035em] text-primary -ml-1">{big}</span>
          {sub && <span className="mt-3 block text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">{sub}</span>}
        </h1>
        {f.definition && <p className="relative mt-5 max-w-[60ch] text-[19px] leading-[1.6] text-neutral-700">{f.definition}</p>}
        {!!f.aliases?.length && <p className="relative mt-4 text-[13px] text-neutral-500">Also called {f.aliases.join(', ')}</p>}
        {!!f.relatedTerms?.length && (
          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] text-neutral-500">Related terms</span>
            {f.relatedTerms.map((t) => (
              <button key={t} type="button" onClick={() => openWith(t)} title={`Search for ${t}`}
                className="rounded-full bg-neutral-50 px-3 py-1 text-[13px] font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-primary-soft hover:text-primary hover:ring-primary/20">
                {t}
              </button>
            ))}
          </div>
        )}
      </header>
      <MetaRow article={a} />
      <Body><ArticleRenderer doc={a.content} links={a.linkTargets} /></Body>
    </article>
  );
}
