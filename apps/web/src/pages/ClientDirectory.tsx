import { useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ChevronRight, FileText } from 'lucide-react';
import { CLIENT_DOC_KINDS, CLIENT_DOC_LABELS, CLIENT_LINES, CLIENT_LINE_LABELS, type ClientLine } from '@ops/shared';
import type { ArticleSummary } from '../api/client';
import { StatusBadge } from '../components/ui/primitives';

/** "Acme Travel (fictional)" -> "Acme Travel": the DEMO label lives on every article, not in the directory. */
const display = (client: string) => client.replace(/\s*\(fictional\)\s*$/i, '').trim().replace(/\s+/g, ' ');
export const key = (client: string) => display(client).toLowerCase();

/** Clients & Terms and Conditions: client (A–Z) -> Corporate / Travel -> Full T&C / Coverage summary. Built from the client_terms fields. */
export function ClientDirectory({ articles }: { articles: ArticleSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [line, setLine] = useState<ClientLine | null>(null);
  // one article per client/line/document slot; archived ones never show, extras for a taken slot go to "Other documents"
  const slots = new Map<string, ArticleSummary>(), names = new Map<string, string>(), other: ArticleSummary[] = [];
  for (const a of articles) {
    if (a.status === 'archived') continue;
    const k = a.client && display(a.client) && a.line && a.docKind ? `${key(a.client)}|${a.line}|${a.docKind}` : null;
    const held = k ? slots.get(k) : undefined;
    if (!k || (held && (held.status === 'published' || a.status !== 'published'))) { other.push(a); continue; }
    if (held) other.push(held); // a published article takes the slot from a draft
    slots.set(k, a);
    if (!names.has(key(a.client!))) names.set(key(a.client!), display(a.client!));
  }
  const clients = [...names.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const find = (client: string, l: ClientLine, kind: string) => slots.get(`${key(client)}|${l}|${kind}`);

  return (
    <>
      <ul className="panel mt-8 divide-y divide-neutral-100 overflow-hidden">
        {clients.map((client, i) => {
          const isOpen = open === client;
          return (
            <li key={client}>
              <button type="button" aria-expanded={isOpen} aria-controls={isOpen ? `client-${i}` : undefined}
                onClick={() => { setOpen(isOpen ? null : client); setLine(null); }}
                className="group flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50/70">
                <ChevronRight size={16} aria-hidden className={clsx('shrink-0 text-neutral-400 transition-transform duration-200 motion-reduce:transition-none', isOpen && 'rotate-90 text-primary')} />
                <span className="group-hover:text-primary">{client}</span>
              </button>
              {isOpen && (
                <div id={`client-${i}`} role="group" aria-label={client} className="space-y-3 px-5 pb-5 pl-12">
                  <div className="flex flex-wrap gap-2">
                    {CLIENT_LINES.map((l) => (
                      <button key={l} type="button" aria-expanded={line === l} onClick={() => setLine(line === l ? null : l)}
                        className={clsx('rounded-full px-4 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors',
                          line === l ? 'bg-accent text-neutral-900 ring-primary' : 'bg-white text-neutral-700 ring-neutral-200 hover:bg-accent-soft hover:ring-neutral-300')}>
                        {CLIENT_LINE_LABELS[l]}
                      </button>
                    ))}
                  </div>
                  {line && (
                    <ul className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                      {CLIENT_DOC_KINDS.map((k) => {
                        const a = find(client, line, k);
                        return (
                          <li key={k}>
                            {a ? (
                              <Link to={`/article/${a.slug}`}
                                className="inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-[14px] font-medium text-primary ring-1 ring-inset ring-primary-line hover:bg-primary-soft">
                                <FileText size={15} aria-hidden /> {CLIENT_DOC_LABELS[k]}
                                {a.status !== 'published' && <StatusBadge status={a.status} />}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-2 rounded-[12px] px-3 py-2 text-[14px] text-ink-muted ring-1 ring-inset ring-neutral-200">
                                {CLIENT_DOC_LABELS[k]}: not available yet
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {clients.length === 0 && <li className="px-5 py-10 text-center text-sm text-neutral-500">No client documents yet.</li>}
      </ul>
      {other.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-neutral-500">Other documents</h2>
          <p className="mt-1 text-[13px] text-neutral-500">Not in the client list: Client name, Line or Document is not set, or another article already fills that slot.</p>
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
