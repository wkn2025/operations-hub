import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button } from '../../components/ui/primitives';
import { PageHeader, QueryBlock, Table, field, td, useAdminUsers } from './common';

interface Entry { id: number; actorId: string | null; action: string; entity: string; entityId: string | null; detail: { summary?: string } | null; createdAt: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Audit() {
  const log = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    queryFn: ({ pageParam }) => api<{ entries: Entry[]; nextCursor: string | null }>(`/api/admin/audit?limit=200${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '', getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const users = useAdminUsers().data ?? [];
  const [text, setText] = useState('');
  const [entity, setEntity] = useState('');
  const [actor, setActor] = useState('');
  const who = (id: string | null) => (id ? users.find((u) => u.id === id)?.email ?? 'Unknown user' : 'System');

  const all = log.data?.pages.flatMap((p) => p.entries) ?? [];
  const q = text.trim().toLowerCase();
  const rows = all.filter((e) => (!entity || e.entity === entity) && (!actor || (e.actorId ?? '') === actor)
    && (!q || [e.action, e.detail?.summary, e.entityId, who(e.actorId)].some((s) => s?.toLowerCase().includes(q))));
  const entities = [...new Set(all.map((e) => e.entity))].sort();
  const actors = [...new Set(all.map((e) => e.actorId ?? ''))];

  return (
    <section>
      <PageHeader title="Audit log" intro="Every change anyone made, newest first. Filters apply to the entries loaded so far; load older entries to search further back.">
        <div className="flex flex-wrap gap-2">
          <input type="search" aria-label="Filter audit entries" placeholder="Filter…" className={field} value={text} onChange={(e) => setText(e.target.value)} />
          <select aria-label="Entity type" className={field} value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All types</option>
            {entities.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select aria-label="Changed by" className={field} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Everyone</option>
            {actors.map((x) => <option key={x} value={x}>{who(x || null)}</option>)}
          </select>
        </div>
      </PageHeader>
      <QueryBlock q={{ ...log, data: log.isSuccess ? rows : undefined }} what="the audit log" empty={all.length ? 'No loaded entries match these filters.' : 'Nothing has been recorded yet.'}>
        {(r) => (
          <Table label="Audit log" head={['When', 'Who', 'Action', 'What happened']}>
            {r.map((e) => (
              <tr key={e.id}>
                <td className={td + ' whitespace-nowrap tabular text-[13px]'}>{when(e.createdAt)}</td>
                <td className={td + ' text-[13px]'}>{who(e.actorId)}</td>
                <td className={td}><code className="rounded-[6px] bg-neutral-100 px-1.5 py-0.5 font-mono text-[12.5px] text-neutral-700">{e.action}</code></td>
                <td className={td + ' text-[13.5px]'}>{e.detail?.summary ?? e.entityId ?? ''}</td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
      {log.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="soft" disabled={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>{log.isFetchingNextPage ? 'Loading…' : 'Load older entries'}</Button>
        </div>
      )}
    </section>
  );
}
