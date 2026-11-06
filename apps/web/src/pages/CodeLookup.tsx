import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Search, SearchX } from 'lucide-react';
import { api, HttpError } from '../api/client';
import { ErrorState } from '../components/ui/ErrorState';
import { IconTile, Skeleton } from '../components/ui/primitives';

type CodeSystem = 'ICD-10-CM' | 'CPT' | 'HCPCS';
interface CodeResult { query: string; matches: { system: CodeSystem; code: string; billable: boolean; description: string }[] }

const SYSTEM_TONE: Record<CodeSystem, string> = {
  'ICD-10-CM': 'bg-primary-soft text-primary',
  CPT: 'bg-accent-soft text-accent-ink',
  HCPCS: 'bg-neutral-100 text-neutral-700',
};

/** Diagnosis & Service codes: paste one or many ICD-10, CPT or HCPCS codes, get their descriptions. Text lives in ?q= for Back/sharing. */
export function CodeLookup() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = text.trim();
  const [term, setTerm] = useState(q);
  const urlQ = params.get('q') ?? '';
  // the address changed from outside (sidebar link, Back): show what it says
  useEffect(() => { setText((t) => (t.trim() === urlQ ? t : urlQ)); }, [urlQ]);
  useEffect(() => { // look up once typing pauses; keep the text in the address
    const t = window.setTimeout(() => { setTerm(q); if (q !== urlQ) setParams(q ? { q } : {}, { replace: true }); }, 300);
    return () => window.clearTimeout(t);
  }, [q, urlQ, setParams]);

  const look = useQuery({
    queryKey: ['codes', term], enabled: term.length > 0, staleTime: Infinity, placeholderData: (prev) => prev,
    queryFn: () => api<{ results: CodeResult[] }>(`/api/codes?q=${encodeURIComponent(term)}`).then((r) => r.results),
  });
  const results = term ? look.data : undefined;
  const found = results?.filter((r) => r.matches.length).length ?? 0;

  return (
    <section className="mt-8">
      <label htmlFor="code-q" className="text-[15px] font-medium text-neutral-900">Codes</label>
      <div className="relative mt-2">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input id="code-q" type="search" value={text} onChange={(e) => setText(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
          aria-describedby="code-q-help" placeholder="e.g. S33.0XXA, 99214 - A4565"
          className="w-full rounded-[14px] bg-white py-3.5 pl-11 pr-4 text-[16px] text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-200 placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <p id="code-q-help" className="mt-2 text-[13px] text-neutral-500">
        ICD-10, CPT and HCPCS. Several at once: separate them with spaces, commas or dashes. ICD-10 dots are optional (S33.0XXA = S330XXA). A CPT modifier (99214-25) shows as its own “no match” row.
      </p>

      <div className="mt-6">
        {/* only short status lines are announced, never the whole list */}
        {term && look.isError && (look.error instanceof HttpError && look.error.status === 400
          ? <p role="status" className="text-[14px] text-neutral-700">Up to 100 codes at a time. Split the list and look them up in parts.</p>
          : <div className="panel"><ErrorState title="Couldn’t look up the codes" onRetry={() => look.refetch()} retrying={look.isFetching} /></div>)}
        {term && look.isPending && <div className="panel space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-2/3" />)}</div>}
        {results && !look.isError && (
          <>
            <p role="status" className="mb-2 text-[13px] text-neutral-500 tabular">{found} of {results.length} found</p>
            <ul aria-label="Code results" className={clsx('panel divide-y divide-neutral-100 overflow-hidden transition-opacity', look.isPlaceholderData && 'opacity-60')}>
              {results.map((r) => (
                <li key={r.query} className="px-5 py-4">
                  {r.matches.length === 0 ? (
                    <div className="flex items-center gap-3 text-[15px]">
                      <IconTile icon={SearchX} size="sm" tone="neutral" />
                      <span className="font-semibold text-neutral-900 tabular">{r.query}</span>
                      <span className="text-ink-muted">No match in ICD-10-CM, CPT or HCPCS</span>
                    </div>
                  ) : r.matches.map((m) => (
                    <div key={m.system} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-0.5">
                      <span className="w-24 shrink-0 text-[16px] font-semibold text-neutral-900 tabular">{m.code}</span>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', SYSTEM_TONE[m.system])}>{m.system}</span>
                      <span className="min-w-0 flex-1 basis-64 text-[15px] text-neutral-800">
                        {m.description}
                        {!m.billable && <span className="ml-2 text-[13px] text-ink-muted">(category, not billable: use a more specific code)</span>}
                      </span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
