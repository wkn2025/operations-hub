import { RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import { fmtDate } from '../../lib/text';
import { LoadMore } from '../../components/ui/LoadMore';
import { InlineError, PageHeader, QueryBlock, Table, smallBtn, td, useAdminAction, useArticlesByStatus } from './common';

export function Archive() {
  const archived = useArticlesByStatus('archived');
  const act = useAdminAction();
  return (
    <section>
      <PageHeader title="Archive" intro="Archived articles are hidden from viewers and from search. Restoring one returns it to draft, so it is checked again before it is published." />
      <QueryBlock q={archived} what="archived articles" empty="The archive is empty.">
        {(rows) => (
          <Table label="Archived articles" head={['Article', 'Category', 'Archived', 'Actions']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={td}><span className="font-medium text-neutral-900">{a.title}</span><InlineError message={act.errorFor(a.id)} /></td>
                <td className={td + ' text-[13px]'}>{a.categoryPath || '—'}</td>
                <td className={td + ' tabular'}>{fmtDate(a.updatedAt)}</td>
                <td className={td}>
                  <button type="button" className={smallBtn} disabled={act.busy === a.id} aria-label={`Restore ${a.title}`}
                    onClick={() => act.run(a.id, () => api(`/api/articles/${a.id}/restore`, { method: 'POST' }))}>
                    <RotateCcw size={14} aria-hidden /> Restore
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
      <LoadMore q={archived} />
    </section>
  );
}
