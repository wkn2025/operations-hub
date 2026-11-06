import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { FlaskConical } from 'lucide-react';
import { CLIENT_DOC_KINDS, CLIENT_DOC_LABELS } from '@ops/shared';
import { fetchArticles, type Article } from '../../../api/client';
import { key } from '../../../pages/ClientDirectory';
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
        <VersionSwitch article={a} />
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

/** Full T&C <-> coverage summary of the same client and line, so readers needn't go back through the directory. */
function VersionSwitch({ article: a }: { article: Article }) {
  const { client, line, docKind } = a.fields;
  const ready = !!(client && key(client) && line && docKind && a.categoryId);
  // ponytail: first 200 articles of the category (API max); page through if a category ever holds more
  const list = useQuery({
    queryKey: ['articles', 'client-docs', a.categoryId], enabled: ready,
    queryFn: () => fetchArticles({ categoryId: a.categoryId!, limit: 200 }).then((r) => r.articles),
  });
  if (!ready) return null;
  // same pick as the directory: archived never, a published one beats a draft
  const other = (kind: string) => (list.data ?? [])
    .filter((o) => o.id !== a.id && o.status !== 'archived' && o.client && key(o.client) === key(client!) && o.line === line && o.docKind === kind)
    .sort((x, y) => Number(y.status === 'published') - Number(x.status === 'published'))[0];
  const chip = 'rounded-full px-4 py-1.5 text-[13px] font-medium';
  return (
    <nav aria-label="Document version" className="mt-5 inline-flex gap-1 rounded-full bg-neutral-100 p-1">
      {CLIENT_DOC_KINDS.map((k) => {
        if (k === docKind) return <span key={k} aria-current="page" className={clsx(chip, 'bg-white text-neutral-900 shadow-sm ring-1 ring-inset ring-primary')}>{CLIENT_DOC_LABELS[k]}</span>;
        const o = other(k);
        return o
          ? <Link key={k} to={`/article/${o.slug}`} className={clsx(chip, 'text-primary hover:bg-accent-soft')}>Switch to {CLIENT_DOC_LABELS[k]}</Link>
          : <span key={k} className={clsx(chip, 'text-ink-muted')}>{CLIENT_DOC_LABELS[k]}{list.isSuccess && ': not available yet'}</span>;
      })}
    </nav>
  );
}
