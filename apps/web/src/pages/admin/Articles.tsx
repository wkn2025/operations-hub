import { useState } from 'react';
import { Link } from 'react-router';
import type { ArticleStatus } from '@ops/shared';
import { ARTICLE_CAP, useArticles, useCategories, subtree } from '../../api/client';
import { StatusBadge } from '../../components/ui/primitives';
import { fmtDate } from '../../lib/text';
import { PageHeader, QueryBlock, Table, field, td, useAdminUsers } from './common';

const STATUSES: [ArticleStatus, string][] = [['draft', 'Draft'], ['in_review', 'In review'], ['published', 'Published'], ['archived', 'Archived']];

export function Articles() {
  const articles = useArticles(); // admins see every status
  const cats = useCategories().data ?? [];
  const users = useAdminUsers().data ?? [];
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner] = useState('');
  const inCat = category ? subtree(cats, category) : null;
  const name = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? (id ? 'Unknown' : 'No owner');
  const owners = [...new Set((articles.data ?? []).map((a) => a.ownerId ?? ''))];

  const filtered = articles.isSuccess ? {
    ...articles,
    data: articles.data.filter((a) => (!status || a.status === status) && (!inCat || (a.categoryId && inCat.has(a.categoryId))) && (!owner || (a.ownerId ?? '') === owner)),
  } : articles;

  return (
    <section>
      <PageHeader title="Articles" intro="Every article in every state. Filter, then open one to read or edit it.">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="f-status">Status</label>
          <select id="f-status" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-cat">Category</label>
          <select id="f-cat" className={field + ' max-w-[240px]'} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {[...cats].sort((a, b) => a.path.localeCompare(b.path)).map((c) => <option key={c.id} value={c.id}>{c.path}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-owner">Owner</label>
          <select id="f-owner" className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {owners.map((o) => <option key={o} value={o}>{name(o || null)}</option>)}
          </select>
        </div>
      </PageHeader>
      <QueryBlock q={filtered} what="articles" empty="No articles match these filters.">
        {(rows) => (<>
          <p className="mb-2 text-[13px] text-ink-muted" role="status">{rows.length} article{rows.length === 1 ? '' : 's'}{articles.data?.length === ARTICLE_CAP && ` (showing the ${ARTICLE_CAP} most recently updated)`}</p>
          <Table label="Articles" head={['Title', 'Status', 'Category', 'Owner', 'Updated', 'Review by']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={td}>
                  <Link to={`/article/${a.slug}`} className="font-medium text-neutral-900 hover:text-primary hover:underline">{a.title}</Link>
                  {a.status !== 'archived' && <Link to={`/edit/${a.id}`} className="ml-2 text-[12.5px] font-medium text-primary hover:underline" aria-label={`Edit ${a.title}`}>Edit</Link>}
                </td>
                <td className={td}><StatusBadge status={a.status} /></td>
                <td className={td + ' text-[13px]'}>{a.categoryPath || '—'}</td>
                <td className={td}>{name(a.ownerId)}</td>
                <td className={td + ' tabular'}>{fmtDate(a.updatedAt)}</td>
                <td className={td + ' tabular'}>{a.reviewDate ? fmtDate(a.reviewDate) : '—'}</td>
              </tr>
            ))}
          </Table>
        </>)}
      </QueryBlock>
    </section>
  );
}
