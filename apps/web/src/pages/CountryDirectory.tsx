import { useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ChevronRight, FileText } from 'lucide-react';
import { AMERICAS, COUNTRY_DOCS, COUNTRY_DOC_LABELS } from '@ops/shared';
import type { ArticleSummary } from '../api/client';
import { StatusBadge } from '../components/ui/primitives';

const COUNTRIES = [...AMERICAS].sort((a, b) => a.localeCompare(b, 'en'));

/** Work Instructions / Country Specifics: every country of the Americas (A–Z) -> preferred providers, country specifics, repatriation/evacuation. */
export function CountryDirectory({ articles }: { articles: ArticleSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // one article per country/document slot; archived never shows; a published article beats a draft; the rest go to "Other documents"
  const slots = new Map<string, ArticleSummary>(), other: ArticleSummary[] = [];
  for (const a of articles) {
    if (a.status === 'archived') continue;
    const k = a.country && a.countryDoc ? `${a.country}|${a.countryDoc}` : null;
    const held = k ? slots.get(k) : undefined;
    if (!k || (held && (held.status === 'published' || a.status !== 'published'))) { other.push(a); continue; }
    if (held) other.push(held);
    slots.set(k, a);
  }

  return (
    <>
      <ul aria-label="Countries" className="panel mt-8 divide-y divide-neutral-100 overflow-hidden">
        {COUNTRIES.map((country, i) => {
          const isOpen = open === country;
          return (
            <li key={country}>
              <button type="button" aria-expanded={isOpen} aria-controls={isOpen ? `country-${i}` : undefined} onClick={() => setOpen(isOpen ? null : country)}
                className="group flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50/70">
                <ChevronRight size={16} aria-hidden className={clsx('shrink-0 text-neutral-400 transition-transform duration-200 motion-reduce:transition-none', isOpen && 'rotate-90 text-primary')} />
                <span className="group-hover:text-primary">{country}</span>
              </button>
              {isOpen && (
                <ul id={`country-${i}`} aria-label={country} className="flex flex-col gap-1.5 px-5 pb-5 pl-12 sm:flex-row sm:flex-wrap sm:gap-2">
                  {COUNTRY_DOCS.map((k) => {
                    const a = slots.get(`${country}|${k}`);
                    return (
                      <li key={k}>
                        {a ? (
                          <Link to={`/article/${a.slug}`} className="inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-[14px] font-medium text-primary ring-1 ring-inset ring-primary-line hover:bg-primary-soft">
                            <FileText size={15} aria-hidden /> {COUNTRY_DOC_LABELS[k]}
                            {a.status !== 'published' && <StatusBadge status={a.status} />}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-[14px] text-ink-muted ring-1 ring-inset ring-neutral-200">
                            {COUNTRY_DOC_LABELS[k]}: not available yet
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {other.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-neutral-500">Other documents</h2>
          <p className="mt-1 text-[13px] text-neutral-500">Not in the country list: Country or Country document is not set, or another article already fills that slot.</p>
          <ul className="panel mt-3 divide-y divide-neutral-100 overflow-hidden">
            {other.map((a) => (
              <li key={a.id}><Link to={`/article/${a.slug}`} className="flex items-center gap-3 px-5 py-3 text-[15px] font-medium text-neutral-900 hover:bg-neutral-50/70 hover:text-primary">
                <span className="min-w-0 flex-1 truncate">{a.title}</span>{a.status !== 'published' && <StatusBadge status={a.status} />}
              </Link></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
