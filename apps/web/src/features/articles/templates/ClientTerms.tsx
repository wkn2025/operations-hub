import { FlaskConical } from 'lucide-react';
import type { Article } from '../../../api/client';
import { fmtDate } from '../../../lib/text';
import { ArticleRenderer } from '../ArticleRenderer';
import { Body, Facts, Lede, MetaRow, Title } from './parts';

export function ClientTerms({ article: a }: { article: Article }) {
  const f = a.fields;
  const validity = f.validFrom || f.validTo ? `${fmtDate(f.validFrom) || 'open'} to ${fmtDate(f.validTo) || 'open-ended'}` : undefined;
  return (
    <article data-template="client_terms">
      <div role="note" aria-label="Demo data notice" className="demo-stripe mb-8 flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px] text-neutral-800 ring-1 ring-inset ring-accent/60">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-neutral-900"><FlaskConical size={17} aria-hidden /></span>
        <p><strong className="font-semibold">DEMO – illustrative data.</strong> Fictional client, limits and contract. Do not use for real authorisations.</p>
      </div>
      <header>
        <Title>{a.title}</Title>
        {f.summary && <Lede>{f.summary}</Lede>}
        <MetaRow article={a} />
        <div className="panel mt-8 overflow-hidden">
          <Facts className="px-5" rows={[['Client', f.client], ['Contract', f.contractRef], ['Valid', validity], ['Territory', f.region]]} />
          {!!f.keyLimits?.length && (
            <dl className="grid border-t border-neutral-100 bg-neutral-50/60 sm:grid-cols-3">
              {f.keyLimits.map((k, i) => (
                <div key={k.label} className={i ? 'border-t border-neutral-100 px-5 py-4 sm:border-l sm:border-t-0' : 'px-5 py-4'}>
                  <dt className="text-[13px] text-neutral-500">{k.label}</dt>
                  <dd className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-primary tabular">{k.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>
      <Body><ArticleRenderer doc={a.content} links={a.linkTargets} /></Body>
    </article>
  );
}
