import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; to?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-neutral-500">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-neutral-300" aria-hidden />}
            {c.to && i < items.length - 1
              ? <Link to={c.to} className="rounded-md px-1 py-0.5 transition-colors hover:bg-neutral-100 hover:text-neutral-900">{c.label}</Link>
              : <span aria-current={i === items.length - 1 ? 'page' : undefined} className="px-1 py-0.5 font-medium text-neutral-700">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Crumbs for a "Top / Sub" category path, linking each level by slug. */
export function categoryCrumbs(path: string, cats: { name: string; slug: string; path: string }[]): Crumb[] {
  const parts = path ? path.split(' / ') : [];
  return parts.map((_, i) => {
    const p = parts.slice(0, i + 1).join(' / ');
    const c = cats.find((x) => x.path === p);
    return { label: parts[i]!, to: c ? `/category/${c.slug}` : undefined };
  });
}
