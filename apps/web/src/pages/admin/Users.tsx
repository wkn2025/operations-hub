import type { Role } from '@ops/shared';
import { api, useSession } from '../../api/client';
import { Chip } from '../../components/ui/primitives';
import { fmtDate } from '../../lib/text';
import { InlineError, PageHeader, QueryBlock, Table, field, smallBtn, td, useAdminAction, useAdminUsers, type AdminUser } from './common';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

export function Users() {
  const users = useAdminUsers();
  const me = useSession().data?.user;
  const act = useAdminAction();
  const patch = (u: AdminUser, body: { role?: Role | null; active?: boolean }) =>
    act.run(u.id, () => api(`/api/admin/users/${u.id}`, { method: 'PATCH', json: body }));

  return (
    <section>
      <PageHeader title="Users" intro="People appear here after their first sign-in. A role you set here overrides the editor allowlist; “Automatic” goes back to allowlist rules. Changes apply on the person’s next click." />
      <QueryBlock q={users} what="users" empty="No one has signed in yet.">
        {(rows) => (
          <Table label="Users" head={['Person', 'Role', 'Status', 'Last sign-in', 'Actions']}>
            {rows.map((u) => (
              <tr key={u.id} className={u.active ? undefined : 'bg-neutral-50/60'}>
                <td className={td}>
                  <p className="font-medium text-neutral-900">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}</p>
                  <p className="text-[13px] text-neutral-500">{u.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.bootstrap && <Chip title="Listed in ADMIN_BOOTSTRAP_EMAILS on the server">Bootstrap admin</Chip>}
                    {u.roleSetByAdmin && <Chip>Role set by admin</Chip>}
                  </div>
                  <InlineError message={act.errorFor(u.id)} />
                </td>
                <td className={td}>
                  <select aria-label={`Role for ${u.email}`} className={field} value={u.role} disabled={act.busy === u.id}
                    onChange={(e) => patch(u, { role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r[0]!.toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  {u.roleSetByAdmin && (
                    <button type="button" className="mt-1.5 block text-[12.5px] font-medium text-primary hover:underline" disabled={act.busy === u.id}
                      onClick={() => patch(u, { role: null })}>Use automatic role</button>
                  )}
                </td>
                <td className={td}>{u.active ? <span className="text-success">Active</span> : <span className="text-neutral-500">Deactivated</span>}</td>
                <td className={td + ' tabular'}>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never'}</td>
                <td className={td}>
                  <button type="button" className={smallBtn} disabled={act.busy === u.id} onClick={() => patch(u, { active: !u.active })}
                    aria-label={`${u.active ? 'Deactivate' : 'Activate'} ${u.email}`}>
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </QueryBlock>
    </section>
  );
}
