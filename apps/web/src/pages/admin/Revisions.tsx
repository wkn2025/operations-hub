import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useArticle, useArticles } from '../../api/client';
import { ErrorState } from '../../components/ui/ErrorState';
import { StatusBadge } from '../../components/ui/primitives';
import { VersionPanel } from '../../features/editor/VersionPanel';
import { PageHeader, field } from './common';

export function Revisions() {
  const articles = useArticles();
  const [params, setParams] = useSearchParams();
  const id = params.get('article') ?? '';
  return (
    <section>
      <PageHeader title="Revisions" intro="Pick an article to browse its history. Opening a revision shows it in full; restoring saves it as a new revision, so nothing is lost." />
      <label className="flex max-w-xl flex-col gap-1 text-[13px] font-medium text-neutral-700">
        Article
        <select className={field} value={id} onChange={(e) => setParams(e.target.value ? { article: e.target.value } : {})}>
          <option value="">Choose an article…</option>
          {[...(articles.data ?? [])].sort((a, b) => a.title.localeCompare(b.title)).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </label>
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
