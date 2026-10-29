import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  BookA, Cpu, FileText, Folder, Handshake, Hospital, Landmark, LifeBuoy, ListChecks, MonitorCog, Receipt, ScrollText, Workflow, type LucideIcon,
} from 'lucide-react';
import type { ArticleStatus, ArticleType } from '@ops/shared';

export const TEMPLATE_ICON: Record<ArticleType, LucideIcon> = {
  standard: FileText, work_instruction: ListChecks, client_terms: ScrollText, technical: Cpu, troubleshooting: LifeBuoy, glossary: BookA,
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  'EDI & Automation': Workflow,
  'Clients & Terms and Conditions': Handshake,
  'Work Instructions': ListChecks,
  'Claims & Reimbursements': Receipt,
  'Provider Networks & Partners': Hospital,
  'Finance & Payment Processing': Landmark,
  'Internal Systems': MonitorCog,
  'Troubleshooting Center': LifeBuoy,
  'Glossary & Acronyms': BookA,
};
export const categoryIcon = (name: string): LucideIcon => CATEGORY_ICON[name] ?? Folder;

/** Square icon tile used for templates and categories. */
export function IconTile({ icon: Icon, size = 'md', tone = 'primary', className }: { icon: LucideIcon; size?: 'sm' | 'md' | 'lg'; tone?: 'primary' | 'neutral'; className?: string }) {
  const s = { sm: 'h-7 w-7 rounded-[9px]', md: 'h-9 w-9 rounded-[11px]', lg: 'h-12 w-12 rounded-[14px]' }[size];
  const i = { sm: 15, md: 18, lg: 22 }[size];
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center', s,
      tone === 'primary' ? 'bg-primary-soft text-primary ring-1 ring-inset ring-primary/10' : 'bg-neutral-100 text-neutral-600', className)}>
      <Icon size={i} strokeWidth={1.8} aria-hidden />
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={clsx('inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-neutral-200 bg-white px-1.5 font-sans text-[11px] font-medium text-neutral-500 shadow-[0_1px_0_var(--neutral-200)]', className)}>
      {children}
    </kbd>
  );
}

const STATUS: Record<ArticleStatus, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-success-soft text-success' },
  draft: { label: 'Draft', cls: 'bg-neutral-100 text-neutral-600' },
  in_review: { label: 'In review', cls: 'bg-warning-soft text-warning' },
  archived: { label: 'Archived', cls: 'bg-neutral-100 text-neutral-500 line-through decoration-neutral-400' },
};
export function StatusBadge({ status }: { status: ArticleStatus }) {
  const s = STATUS[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {s.label}
    </span>
  );
}

export function Chip({ children, className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  return <span {...rest} className={clsx('inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-600', className)}>{children}</span>;
}

type BtnProps = ComponentPropsWithoutRef<'button'> & { variant?: 'primary' | 'ghost' | 'soft' };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', className, ...rest }, ref) {
  return (
    <button ref={ref} {...rest} className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2 text-sm font-medium transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
      variant === 'primary' && 'bg-primary text-white shadow-[0_1px_2px_rgb(20_27_51/0.2),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-primary-hover',
      variant === 'soft' && 'bg-primary-soft text-primary hover:bg-primary/15',
      variant === 'ghost' && 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
      className)} />
  );
});

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('block animate-pulse rounded-md bg-neutral-100', className)} />;
}
