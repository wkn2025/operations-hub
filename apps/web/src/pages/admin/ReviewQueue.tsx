import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, type ReviewDue } from '../../api/client';
import { ErrorState } from '../../components/ui/ErrorState';
import { fmtDate } from '../../lib/text';
import { LoadMore } from '../../components/ui/LoadMore';
import { InlineError, PageHeader, QueryBlock, Table, smallBtn, td, useAdminAction, useArticlesByStatus } from './common';

export function ReviewQueue() {
  const queue = useArticlesByStatus('in_review');
  const due = useQuery({ queryKey: ['admin', 'review-due'], queryFn: () => api<{ articles: ReviewDue[] }>('/api/admin/review-due?days=30').then((r) => r.articles) });
  const act = useAdminAction();
  const go = (id: string, action: 'publish' | 'reject') => act.run(id, () => api(`/api/articles/${id}/${action}`, { method: 'POST' }));

  return (
    <section>
      <PageHeader title="Review" intro="Articles waiting for approval, and published articles whose review date is within 30 days or already past." />
      <ApprovalSetting />

      <h3 className="mb-3 mt-8 text-[15px] font-semibold text-neutral-900">Waiting for approval</h3>
      <QueryBlock q={queue} what="the review queue" empty="Nothing is waiting for approval.">
        {(rows) => (
          <Table label="Waiting for approval" head={['Article', 'Category', 'Submitted', 'Actions']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={td}>
                  <Link to={`/article/${a.slug}`} className="font-medium text-neutral-900 hover:text-primary hover:underline">{a.title}</Link>
                  <InlineError message={act.errorFor(a.id)} />
                </td>
                <td className={td + ' text-[13px]'}>{a.categoryPath || '—'}</td>
                <td className={td + ' tabular'}>{fmtDate(a.updatedAt)}</td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    <button type="button" className={clsx(smallBtn, 'bg-primary text-white ring-primary hover:bg-primary-hover')} disabled={act.busy === a.id}
                      aria-label={`Publish ${a.title}`} onClick={() => go(a.id, 'publish')}>Publish</button>
                    <button type="button" className={smallBtn} disabled={act.busy === a.id} aria-label={`Reject ${a.title}`}
                      title="Send it back to draft so the author can rework it" onClick={() => go(a.id, 'reject')}>Reject</button>
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
      <LoadMore q={queue} />

      <h3 className="mb-3 mt-10 text-[15px] font-semibold text-neutral-900">Due for review</h3>
      <QueryBlock q={due} what="review dates" empty="No published article is due for review in the next 30 days.">
        {(rows) => (
          <Table label="Due for review" head={['Article', 'Review by', 'Status']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={td}><Link to={`/article/${a.slug}`} className="font-medium text-neutral-900 hover:text-primary hover:underline">{a.title}</Link></td>
                <td className={td + ' tabular'}>{fmtDate(a.reviewDate)}</td>
                <td className={td}>{a.overdue
                  ? <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">Overdue</span>
                  : <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Due soon</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
    </section>
  );
}

function ApprovalSetting() {
  const s = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<{ requireApproval: boolean }>('/api/admin/settings') });
  const act = useAdminAction();
  const on = s.data?.requireApproval ?? false;
  return (
    <div className="panel flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p id="approval-label" className="text-[14.5px] font-medium text-neutral-900">Require approval before publishing</p>
        <p id="approval-desc" className="text-[13px] text-neutral-500">When on, editors submit articles and flows for review and an admin publishes them. Editors also cannot change or archive published content.</p>
        <InlineError message={act.errorFor('settings')} />
        {s.isError && <div className="mt-2"><ErrorState compact title="Couldn’t load this setting" onRetry={() => s.refetch()} retrying={s.isFetching} /></div>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="approval-label" aria-describedby="approval-desc" disabled={!s.isSuccess || act.busy === 'settings'}
        onClick={() => act.run('settings', () => api('/api/admin/settings', { method: 'PATCH', json: { requireApproval: !on } }))}
        className={clsx('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-primary' : 'bg-neutral-300')}>
        <span aria-hidden className={clsx('absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out', on ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}
