import { Navigate, NavLink, Route, Routes } from 'react-router';
import clsx from 'clsx';
import { ShieldAlert } from 'lucide-react';
import { useSession } from '../../api/client';
import { IconTile } from '../../components/ui/primitives';
import { NotFound } from '../NotFound';
import { Users } from './Users';
import { Allowlist } from './Allowlist';
import { Categories } from './Categories';
import { Articles } from './Articles';
import { ReviewQueue } from './ReviewQueue';
import { Revisions } from './Revisions';
import { Archive } from './Archive';
import { Files } from './Files';
import { Audit } from './Audit';

const SECTIONS = [
  ['users', 'Users', Users], ['allowlist', 'Editor allowlist', Allowlist], ['categories', 'Categories', Categories],
  ['articles', 'Articles', Articles], ['review', 'Review', ReviewQueue], ['revisions', 'Revisions', Revisions],
  ['archive', 'Archive', Archive], ['files', 'Files', Files], ['audit', 'Audit log', Audit],
] as const;

/** /admin/*. The guard is a UI courtesy: every /api/admin route (and category writes) is admin-only on the server. */
export default function AdminArea() {
  const me = useSession().data?.user;
  if (me?.role !== 'admin') return <Forbidden />;
  return (
    <div className="animate-rise pt-6">
      <h1 className="text-[34px] font-semibold tracking-[-0.025em] text-neutral-900">Admin</h1>
      <nav aria-label="Admin sections" className="mt-5 border-b border-neutral-200/80">
        <ul className="-mb-px flex flex-wrap gap-x-1">
          {SECTIONS.map(([path, label]) => (
            <li key={path}>
              <NavLink to={`/admin/${path}`} className={({ isActive }) => clsx('block border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                isActive ? 'border-primary text-primary' : 'border-transparent text-neutral-500 hover:text-neutral-900')}>{label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="pt-7">
        <Routes>
          <Route index element={<Navigate to="users" replace />} />
          {SECTIONS.map(([path, , Page]) => <Route key={path} path={path} element={<Page />} />)}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <IconTile icon={ShieldAlert} size="lg" />
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">Admins only</h1>
      <p className="mt-2 max-w-md text-[15px] text-neutral-500">The admin area manages users, categories and settings. Ask an admin if you need something changed here.</p>
      <NavLink to="/" className="mt-6 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">Go to home</NavLink>
    </div>
  );
}
