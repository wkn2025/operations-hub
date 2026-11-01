import { useState } from 'react';
import { Link } from 'react-router';
import type { ArticleStatus } from '@ops/shared';
import { useArticlePages, useCategories } from '../../api/client';
import { LoadMore } from '../../components/ui/LoadMore';
import { StatusBadge } from '../../components/ui/primitives';
import { fmtDate } from '../../lib/text';
import { Download } from 'lucide-react';
import { PageHeader, QueryBlock, Table, field, smallBtn, td, useAdminUsers } from './common';

const STATUSES: [ArticleStatus, string][] = [['draft', 'Draft'], ['in_review', 'In review'], ['published', 'Published'], ['archived', 'Archived']];

export function Articles() {
  const cats = useCategories().data ?? [];
  const users = useAdminUsers().data ?? [];
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner] = useState('');
  // filtering and paging happen on the server, so no article is ever left out of the list
  const articles = useArticlePages({ status, within: category, ownerId: owner }); // admins see every status
  const name = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? (id ? 'Unknown' : 'No owner');
  const owners = [...users.filter((u) => u.role !== 'viewer').map((u) => u.id), 'none'];

  return (
    <section>
      <PageHeader title="Articles" intro="Every article in every state. Filter, then open one to read or edit it.">
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/export" download className={smallBtn + ' h-9'} title="Zip of every article (JSON + Markdown), every flow and the files they use">
            <Download size={14} aria-hidden /> Export all content
          </a>
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
            {owners.map((o) => <option key={o} value={o}>{name(o === 'none' ? null : o)}</option>)}
          </select>
        </div>
      </PageHeader>
      <QueryBlock q={articles} what="articles" empty="No articles match these filters.">
        {(rows) => (<>
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
          <LoadMore q={articles} />
        </>)}
      </QueryBlock>
    </section>
  );
}
