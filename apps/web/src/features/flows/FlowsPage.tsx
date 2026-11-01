import { Link } from 'react-router';
import { ArrowRight, FileText, Plus, Route } from 'lucide-react';
import { isEditorRole, useFlows, useSession, type FlowSummary } from '../../api/client';
import { ErrorState } from '../../components/ui/ErrorState';
import { IconTile, Skeleton, StatusBadge } from '../../components/ui/primitives';

export function FlowsPage() {
  const me = useSession().data!.user!;
  const flows = useFlows();
  const editor = isEditorRole(me.role);
  return (
    <div>
      <section className="animate-rise pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[34px] font-semibold tracking-[-0.025em] text-neutral-900">Guided flows</h1>
            <p className="mt-2 max-w-[56ch] text-[17px] text-neutral-500">Answer a few questions and get to the fix. Pick the problem you are looking at.</p>
          </div>
          {editor && (
            <Link to="/flows/new/edit" className="mt-1.5 inline-flex shrink-0 items-center gap-2 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white shadow-button transition-colors hover:bg-primary-hover">
              <Plus size={16} aria-hidden /> New flow
            </Link>
          )}
        </div>
      </section>
      {flows.isError ? (
        <div className="panel mt-10"><ErrorState title="Couldn’t load the guided flows" onRetry={() => flows.refetch()} retrying={flows.isFetching} /></div>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {flows.isPending && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-[190px] rounded-[20px]" /></li>)}
          {[...(flows.data ?? [])].sort((a, b) => a.title.localeCompare(b.title)).map((f) => <FlowCard key={f.id} flow={f} editor={editor} />)}
          {flows.data?.length === 0 && (
            <li className="panel col-span-full p-8 text-center text-[15px] text-neutral-500">
              No guided flows yet.{editor ? ' Create the first one with New flow.' : ' Ask an editor to add one.'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function FlowCard({ flow: f, editor }: { flow: FlowSummary; editor: boolean }) {
  return (
    <li className="group relative flex flex-col rounded-[20px] bg-white p-6 shadow-sm ring-1 ring-neutral-200/80 transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/20">
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={Route} className="transition-colors duration-300 group-hover:bg-primary group-hover:text-white" />
        {f.status !== 'published' && <StatusBadge status={f.status} />}
      </div>
      <h2 className="mt-4 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-neutral-900">
        <Link to={`/flows/${f.slug}`} className="after:absolute after:inset-0 after:rounded-[20px] focus-visible:after:ring-2 focus-visible:after:ring-primary">{f.title}</Link>
      </h2>
      {f.startText && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-neutral-500">Starts with: {f.startText}</p>}
      <div className="mt-auto flex items-center gap-3 pt-5 text-[13px] text-ink-muted">
        <span>{f.nodeCount} steps</span>
        {f.article && <span className="inline-flex min-w-0 items-center gap-1"><FileText size={13} aria-hidden /><span className="truncate">{f.article.title}</span></span>}
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary">Start <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" /></span>
      </div>
      {editor && <Link to={`/flows/${f.id}/edit`} className="relative z-10 mt-3 self-start text-[13px] font-medium text-neutral-600 underline-offset-2 hover:text-primary hover:underline">Edit flow</Link>}
    </li>
  );
}
