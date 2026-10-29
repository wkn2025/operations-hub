import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { fmtDate } from '../../lib/text';
import { InlineError, PageHeader, QueryBlock, Table, smallBtn, td, useAdminAction, useAdminUsers } from './common';

interface AdminFile { id: string; name: string; mime: string; size: number; uploadedBy: string | null; createdAt: string; references: number; url: string }

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export function Files() {
  const files = useQuery({ queryKey: ['admin', 'files'], queryFn: () => api<{ files: AdminFile[] }>('/api/admin/files').then((r) => r.files) });
  const users = useAdminUsers().data ?? [];
  const act = useAdminAction();
  const [confirm, setConfirm] = useState<string | null>(null);
  // the Delete button and its confirm group replace each other: move focus with them (to the heading if the row is gone)
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    (document.getElementById(focusId) ?? document.getElementById('admin-page-title'))?.focus();
    setFocusId(null);
  }, [focusId, files.data]);
  const ask = (id: string | null, focus: string) => { setConfirm(id); setFocusId(focus); };

  return (
    <section>
      <PageHeader title="Files" intro="Every uploaded image and document. A file used by an article cannot be deleted; remove it from the article first. Unused files can be deleted for good." />
      <QueryBlock q={files} what="files" empty="No files have been uploaded yet.">
        {(rows) => (
          <Table label="Files" head={['File', 'Size', 'Uploaded', 'Used by', 'Actions']}>
            {rows.map((f) => (
              <tr key={f.id}>
                <td className={td}>
                  <a href={f.url} target="_blank" rel="noreferrer" className="font-medium text-neutral-900 hover:text-primary hover:underline">{f.name}</a>
                  <p className="text-[12.5px] text-neutral-500">{f.mime}</p>
                  <InlineError message={act.errorFor(f.id)} />
                </td>
                <td className={td + ' tabular'}>{size(f.size)}</td>
                <td className={td}><span className="tabular">{fmtDate(f.createdAt)}</span><p className="text-[12.5px] text-neutral-500">{users.find((u) => u.id === f.uploadedBy)?.name ?? ''}</p></td>
                <td className={td}>{f.references ? `${f.references} article${f.references === 1 ? '' : 's'}` : <span className="text-neutral-500">Unused</span>}</td>
                <td className={td}>
                  {confirm === f.id ? (
                    <span role="group" aria-label={`Confirm deleting ${f.name}`} className="flex flex-wrap gap-1.5">
                      <button type="button" className={smallBtn + ' text-danger ring-danger/40'} disabled={act.busy === f.id}
                        onClick={async () => { setConfirm(null); await act.run(f.id, () => api(`/api/admin/files/${f.id}`, { method: 'DELETE' })); setFocusId(`file-delete-${f.id}`); }}>Delete for good</button>
                      <button type="button" id={`file-cancel-${f.id}`} className={smallBtn} onClick={() => ask(null, `file-delete-${f.id}`)}>Cancel</button>
                    </span>
                  ) : (
                    <button type="button" id={`file-delete-${f.id}`} className={smallBtn} disabled={f.references > 0} aria-label={`Delete ${f.name}`}
                      title={f.references > 0 ? 'In use: remove it from its articles first' : undefined} onClick={() => ask(f.id, `file-cancel-${f.id}`)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
    </section>
  );
}
