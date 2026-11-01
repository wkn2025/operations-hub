import { Link, useParams } from 'react-router';
import { PenLine } from 'lucide-react';
import { HttpError, useFlow } from '../../api/client';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton, StatusBadge } from '../../components/ui/primitives';
import { NotFound } from '../../pages/NotFound';
import { FlowRunner } from './FlowRunner';

export function FlowPage() {
  const { slug = '' } = useParams();
  const q = useFlow(slug);
  if (q.isError) {
    const status = q.error instanceof HttpError ? q.error.status : 0;
    if (status === 404) return <NotFound what="flow" />;
    if (status === 401) return <Skeleton className="mt-10 h-64 rounded-[20px]" />; // the session handler redirects to login
    return <div className="panel mt-10"><ErrorState title="Couldn’t load this flow" onRetry={() => q.refetch()} retrying={q.isFetching} /></div>;
  }
  const f = q.data;
  return (
    <div className="mx-auto max-w-[820px]">
      <div className="pt-2"><Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Guided flows', to: '/flows' }, { label: f?.title ?? '…' }]} /></div>
      {!f ? <Skeleton className="mt-8 h-72 rounded-[20px]" /> : (
        <>
          <header className="mt-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[15px] font-medium text-neutral-500">{f.title}</h1>
              {f.article && <Link to={`/article/${f.article.slug}`} className="mt-1 inline-block text-[13px] text-primary hover:underline">Read the article: {f.article.title}</Link>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {f.status !== 'published' && <StatusBadge status={f.status} />}
              {f.permissions.write && <Link to={`/flows/${f.id}/edit`} className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"><PenLine size={14} aria-hidden /> Edit</Link>}
            </div>
          </header>
          <div className="mt-8"><FlowRunner key={f.id + f.revision} flow={f} /></div>
        </>
      )}
    </div>
  );
}
