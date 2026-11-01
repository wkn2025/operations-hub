import type { ReactNode } from 'react';
import clsx from 'clsx';
import { CalendarClock, Clock, Hash } from 'lucide-react';
import { TEMPLATE_LABELS } from '@ops/shared';
import type { Article } from '../../../api/client';
import { StatusBadge, TEMPLATE_ICON } from '../../../components/ui/primitives';
import { fmtDate, initials } from '../../../lib/text';

export const today = () => new Date().toISOString().slice(0, 10);

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={clsx('text-balance text-[34px] font-semibold leading-[1.15] tracking-[-0.025em] text-neutral-900', className)}>{children}</h1>;
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-[62ch] text-pretty text-[18px] leading-[1.6] text-neutral-600">{children}</p>;
}

/** Owner, dates, status, template and tags. */
export function MetaRow({ article: a }: { article: Article }) {
  const Icon = TEMPLATE_ICON[a.type];
  const overdue = !!a.reviewDate && a.reviewDate < today();
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-neutral-500">
        {a.owner && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{initials(a.owner.name)}</span>
            <span><span className="sr-only">Owner: </span><span className="font-medium text-neutral-700">{a.owner.name}</span></span>
          </span>
        )}
        <span className="flex items-center gap-1.5"><Clock size={14} aria-hidden /> Updated {fmtDate(a.updatedAt)}</span>
        {a.reviewDate && (
          <span className={clsx('flex items-center gap-1.5', overdue && 'font-medium text-danger')}>
            <CalendarClock size={14} aria-hidden /> {overdue ? 'Review overdue since' : 'Review by'} {fmtDate(a.reviewDate)}
          </span>
        )}
        <span className="flex items-center gap-1.5"><Icon size={14} aria-hidden /> {TEMPLATE_LABELS[a.type]}</span>
        {a.status !== 'published' && <StatusBadge status={a.status} />}
      </div>
      {a.tags.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
          {a.tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              <Hash size={11} className="text-neutral-400" aria-hidden />{t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Label/value rows for template facts (purpose, contract, …). */
export function Facts({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!shown.length) return null;
  return (
    <dl className={clsx('divide-y divide-neutral-100', className)}>
      {shown.map(([k, v]) => (
        <div key={k} className="grid gap-1 py-3 sm:grid-cols-[132px_1fr] sm:gap-6">
          <dt className="pt-[2px] text-[13px] font-medium text-neutral-500">{k}</dt>
          <dd className="text-[15px] leading-relaxed text-neutral-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const Body = ({ children }: { children: ReactNode }) => <div className="mt-10">{children}</div>;
