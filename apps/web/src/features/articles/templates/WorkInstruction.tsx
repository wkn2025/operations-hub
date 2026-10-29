import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BadgeCheck } from 'lucide-react';
import type { PmNode } from '@ops/shared';
import type { Article } from '../../../api/client';
import { ArticleRenderer, StepStateCtx } from '../ArticleRenderer';
import { Body, Facts, Lede, MetaRow, Title } from './parts';

const stepsOf = (n: PmNode, out: PmNode[] = []) => {
  if (n?.type === 'step') out.push(n);
  (n?.content ?? []).forEach((c) => stepsOf(c, out));
  return out;
};

export function WorkInstruction({ article: a }: { article: Article }) {
  const all = useMemo(() => stepsOf(a.content), [a.content]);
  // progress is a reading aid for this visit only; nothing is stored
  const [done, setDone] = useState<Set<PmNode>>(() => new Set());
  const state = useMemo(() => ({
    isDone: (n: PmNode) => done.has(n),
    toggle: (n: PmNode) => setDone((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; }),
  }), [done]);
  const f = a.fields, pct = all.length ? done.size / all.length : 0;

  return (
    <article data-template="work_instruction">
      <header>
        <Title>{a.title}</Title>
        {f.summary && <Lede>{f.summary}</Lede>}
        <MetaRow article={a} />
        <div className="panel mt-8 overflow-hidden">
          <Facts className="px-5" rows={[['Purpose', f.purpose], ['Scope', f.scope], ['Who uses this', f.audience]]} />
          {all.length > 0 && (
            <div className="flex items-center gap-4 border-t border-neutral-100 bg-neutral-50/70 px-5 py-3.5">
              <div role="progressbar" aria-label="Steps completed" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done.size}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200/80">
                <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 220, damping: 30 }} />
              </div>
              <p className="shrink-0 text-[13px] text-neutral-500 tabular" title="Tick the step numbers as you work through the procedure. Progress is not saved.">
                {done.size === all.length ? <span className="font-medium text-neutral-800">All {all.length} steps done</span> : <>{done.size} of {all.length} steps done</>}
              </p>
            </div>
          )}
        </div>
      </header>
      <Body>
        <StepStateCtx.Provider value={state}>
          <ArticleRenderer doc={a.content} links={a.linkTargets} />
        </StepStateCtx.Provider>
      </Body>
      {f.verification && (
        <section aria-labelledby="wi-verify" className="mt-12 rounded-[18px] bg-success-soft/70 p-5 ring-1 ring-inset ring-success/15">
          <h2 id="wi-verify" className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
            <BadgeCheck size={18} className="text-success" aria-hidden /> Verification
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">{f.verification}</p>
        </section>
      )}
    </article>
  );
}
