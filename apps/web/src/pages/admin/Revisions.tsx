import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useArticle, useArticlePages } from '../../api/client';
import { LoadMore } from '../../components/ui/LoadMore';
import { ErrorState } from '../../components/ui/ErrorState';
import { StatusBadge } from '../../components/ui/primitives';
import { VersionPanel } from '../../features/editor/VersionPanel';
import { PageHeader, field } from './common';

export function Revisions() {
  const [params, setParams] = useSearchParams();
  const id = params.get('article') ?? '';
  const [find, setFind] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(find.trim()), 250); return () => clearTimeout(t); }, [find]);
  // server-side title search + paging: every article is reachable, however many there are
  const articles = useArticlePages({ q, sort: 'title' });
  return (
    <section>
      <PageHeader title="Revisions" intro="Pick an article to browse its history. Opening a revision shows it in full; restoring saves it as a new revision, so nothing is lost." />
      <label className="mb-3 flex max-w-xl flex-col gap-1 text-[13px] font-medium text-neutral-700">
        Find article by title
        <input type="search" className={field} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Type part of a title" />
      </label>
      <label className="flex max-w-xl flex-col gap-1 text-[13px] font-medium text-neutral-700">
        Article
        <select className={field} value={id} onChange={(e) => setParams(e.target.value ? { article: e.target.value } : {})}>
          <option value="">Choose an article…</option>
          {(articles.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </label>
      <div className="max-w-xl"><LoadMore q={articles} noun="matching articles" /></div>
      {articles.isError && <div className="mt-3"><ErrorState compact title="Couldn’t load the article list" onRetry={() => articles.refetch()} retrying={articles.isFetching} /></div>}
      {id && <History key={id} id={id} />}
    </section>
  );
}

function History({ id }: { id: string }) {
  const a = useArticle(id);
  const qc = useQueryClient();
  if (a.isError) return <div className="panel mt-5"><ErrorState title="Couldn’t load this article" onRetry={() => a.refetch()} retrying={a.isFetching} /></div>;
  if (!a.data) return <p className="mt-5 text-sm text-ink-muted">Loading…</p>;
  return (
    <div className="panel mt-5">
      <div className="flex items-center gap-3 border-b border-neutral-200/70 px-5 py-3">
        <p className="min-w-0 flex-1 truncate font-medium text-neutral-900">{a.data.title}</p>
        <StatusBadge status={a.data.status} />
      </div>
      <VersionPanel articleId={a.data.id} current={{ title: a.data.title, content: a.data.content }} currentRevision={a.data.revision}
        canRestore={a.data.permissions?.write ?? false} beforeRestore={async () => {}} onRestored={() => qc.invalidateQueries()} />
    </div>
  );
}
