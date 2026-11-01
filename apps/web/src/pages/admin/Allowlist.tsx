import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../../components/ui/primitives';
import { fmtDate } from '../../lib/text';
import { InlineError, PageHeader, QueryBlock, Table, field, smallBtn, td, useAdminAction } from './common';

interface Entry { email: string; addedBy: string | null; createdAt: string }

export function Allowlist() {
  const list = useQuery({ queryKey: ['admin', 'allowlist'], queryFn: () => api<{ entries: Entry[] }>('/api/admin/allowlist').then((r) => r.entries) });
  const act = useAdminAction();
  const [email, setEmail] = useState('');

  return (
    <section>
      <PageHeader title="Editor allowlist" intro="People on this list become editors when they sign in (or right away, if they already have an account). Removing someone returns them to viewer unless an admin set their role on the Users page." />
      <form className="panel mb-5 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => { e.preventDefault(); const v = email.trim().toLowerCase(); if (v) void act.run('add', async () => { await api('/api/admin/allowlist', { method: 'POST', json: { email: v } }); setEmail(''); }); }}>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-[13px] font-medium text-neutral-700">
          Email address
          <input type="email" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" />
        </label>
        <Button type="submit" disabled={act.busy === 'add'}><Plus size={15} aria-hidden /> Add editor</Button>
        <InlineError className="basis-full" message={act.errorFor('add')} />
      </form>
      <QueryBlock q={list} what="the allowlist" empty="No one is on the allowlist yet. Add an email above.">
        {(rows) => (
          <Table label="Editor allowlist" head={['Email', 'Added', 'Actions']}>
            {rows.map((r) => (
              <tr key={r.email}>
                <td className={td}>{r.email}<InlineError message={act.errorFor(r.email)} /></td>
                <td className={td + ' tabular'}>{fmtDate(r.createdAt)}</td>
                <td className={td}>
                  <button type="button" className={smallBtn} disabled={act.busy === r.email} aria-label={`Remove ${r.email}`}
                    onClick={() => act.run(r.email, () => api(`/api/admin/allowlist/${encodeURIComponent(r.email)}`, { method: 'DELETE' }))}>Remove</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
    </section>
  );
}
