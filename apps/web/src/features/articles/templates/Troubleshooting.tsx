import { Link } from 'react-router';
import clsx from 'clsx';
import { ChevronRight, CircleAlert, Play, Search, Wrench, type LucideIcon } from 'lucide-react';
import type { Article } from '../../../api/client';
import { ArticleRenderer } from '../ArticleRenderer';
import { Body, Lede, MetaRow, Title } from './parts';

const STAGES: { key: 'symptom' | 'cause' | 'fix'; label: string; icon: LucideIcon; tone: string }[] = [
  { key: 'symptom', label: 'Symptom', icon: CircleAlert, tone: 'text-danger bg-danger-soft' },
  { key: 'cause', label: 'Cause', icon: Search, tone: 'text-warning bg-warning-soft' },
  { key: 'fix', label: 'Fix', icon: Wrench, tone: 'text-success bg-success-soft' },
];

export function Troubleshooting({ article: a }: { article: Article }) {
  const f = a.fields;
  // a published flow linked from the flow editor wins; the older free-text flowId field still works
  const flowKey = a.flow?.slug ?? f.flowId;
  const stages = STAGES.filter((s) => f[s.key]);
  return (
    <article data-template="troubleshooting">
      <header>
        <Title>{a.title}</Title>
        {f.summary && <Lede>{f.summary}</Lede>}
        <MetaRow article={a} />
        {stages.length > 0 && (
          <ol aria-label="Diagnosis" className="mt-8 grid gap-3 md:grid-cols-3 md:gap-6">
            {stages.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.key} className="panel relative p-4">
                  {i < stages.length - 1 && (
                    <span aria-hidden className="absolute -right-[21px] top-1/2 z-[1] hidden h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-400 shadow-sm ring-1 ring-neutral-200 md:flex">
                      <ChevronRight size={12} strokeWidth={2.5} />
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={clsx('flex h-7 w-7 items-center justify-center rounded-[9px]', s.tone)}><Icon size={15} strokeWidth={2} aria-hidden /></span>
                    <span className="text-[13px] font-semibold text-neutral-900">{s.label}</span>
                  </div>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-neutral-700">{f[s.key]}</p>
                </li>
              );
            })}
          </ol>
        )}
        {flowKey && (
          <Link to={`/flows/${encodeURIComponent(flowKey)}`}
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-primary-hover">
            <Play size={15} aria-hidden /> Start guided flow
          </Link>
        )}
      </header>
      <Body><ArticleRenderer doc={a.content} links={a.linkTargets} /></Body>
    </article>
  );
}
