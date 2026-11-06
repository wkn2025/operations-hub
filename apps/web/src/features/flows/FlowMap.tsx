import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { CircleHelp, FileText, Flag, Link2, Undo2 } from 'lucide-react';
import type { Flow, FlowNode } from '@ops/shared';
import { layout, SLOT, type MapBox, type Task } from './guide';

// portrait: depth runs down (layout col -> y), answers spread across (layout row -> x)
const W = 160, H = 56, GX = 14, GY = 60, U = W + GX; // box size, gap between siblings, gap between levels (room for the answer)
const bw = (b: MapBox) => (b.kind === 'open' || b.kind === 'repeat' ? SLOT * U - GX : W); // "?" and "back to" slots are narrow
const x = (b: MapBox) => b.row * U - (bw(b) + GX) / 2, y = (b: MapBox) => b.col * (H + GY);

const TONE: Record<string, string> = { success: 'bg-success-soft', warning: 'bg-warning-soft', info: 'bg-primary-soft' };

/** The live decision map beside the builder: grows top-down as the author answers, like an n8n canvas turned upright. */
export function FlowMap({ flow, task, onEdit }: { flow: Flow; task: Task; onEdit?: (nodeId: string) => void }) {
  const m = useMemo(() => layout(flow), [flow]);
  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  const still = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0); // width the map can use; it zooms out to fit (down to 60%) before scrolling
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current = m.boxes.find((b) => (task.kind === 'branch'
    ? b.kind === 'open' && b.from?.nodeId === task.nodeId && b.from.option === task.option
    : 'nodeId' in task && b.kind !== 'repeat' && b.kind !== 'open' && b.nodeId === task.nodeId))?.key;

  const width = Math.max(1, m.rows) * U - GX, height = Math.max(1, m.cols) * (H + GY) - GY;
  const k = avail > 0 ? Math.min(1, Math.max(0.8, avail / width)) : 1; // below 80% the text gets too small: scroll instead

  // keep the step being worked on in view, scrolling only when it is (partly) hidden, so the start stays put when it can
  useEffect(() => {
    const b = m.boxes.find((bx) => bx.key === current), el = box.current;
    if (!b || !el) return;
    const pad = 20, l = x(b) * k, t = (y(b) - GY / 2) * k, { scrollLeft: sl, scrollTop: st, clientWidth: cw, clientHeight: ch } = el;
    const left = l < sl ? l : l + bw(b) * k + pad * 2 > sl + cw ? l + bw(b) * k + pad * 2 - cw : sl;
    const tall = (H + GY / 2) * k; // the box plus its answer label
    const top = t < st ? t : t + tall + pad * 2 > st + ch ? t + tall + pad * 2 - ch : st;
    if (left !== sl || top !== st) el.scrollTo?.({ left, top, behavior: still ? 'auto' : 'smooth' });
  }, [current, m, still, k]);
  const at = new Map(m.boxes.map((b) => [b.key, b]));

  return (
    <section aria-labelledby="flow-map-title" className="rounded-[24px] bg-neutral-50 ring-1 ring-neutral-200/80">
      <h2 id="flow-map-title" className="px-5 pt-4 text-[12.5px] font-semibold uppercase tracking-wide text-neutral-500">Your flow so far</h2>
      <div ref={box} tabIndex={0} aria-label="Flow map, scrollable" className="relative max-h-[calc(100vh-200px)] min-h-[240px] overflow-auto rounded-b-[24px] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
        <div style={{ width: width * k, height: height * k }}>
        <div className="relative origin-top-left" style={{ width, height, transform: k < 1 ? `scale(${k})` : undefined }}>
          <svg aria-hidden width={width} height={height} className="absolute inset-0 overflow-visible">
            {m.edges.map((e) => {
              const a = at.get(e.from)!, b = at.get(e.to)!;
              const x1 = x(a) + bw(a) / 2, y1 = y(a) + H, x2 = x(b) + bw(b) / 2, y2 = y(b), my = (y1 + y2) / 2;
              return <path key={e.to} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" strokeWidth={1.5}
                className={clsx(b.kind === 'open' ? 'stroke-neutral-300 [stroke-dasharray:4_4]' : 'stroke-neutral-400')} />;
            })}
          </svg>
          {m.edges.map((e) => {
            const a = at.get(e.from)!, b = at.get(e.to)!;
            return (
              <span key={`l-${e.to}`} title={e.label} style={{ left: x(b) + bw(b) / 2, top: y(b) - GY / 3, maxWidth: bw(b) + GX - 6 }}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-white px-2 py-0.5 text-[11.5px] font-medium text-neutral-700 ring-1 ring-neutral-200">
                {e.label || '…'}<span className="sr-only"> (answer to {byId.get(a.nodeId!)?.text})</span>
              </span>
            );
          })}
          {m.boxes.map((b) => (
            <motion.div key={b.key} initial={still ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}
              style={{ left: x(b), top: y(b), width: bw(b), height: H }} className="absolute transition-[left,top] duration-300 motion-reduce:transition-none">
              <Box b={b} node={b.nodeId ? byId.get(b.nodeId) : undefined} current={b.key === current} onEdit={onEdit} />
            </motion.div>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}

function Box({ b, node, current, onEdit }: { b: MapBox; node?: FlowNode; current: boolean; onEdit?: (id: string) => void }) {
  const ring = current ? 'ring-2 ring-primary' : 'ring-1 ring-neutral-200';
  const shell = 'flex h-full w-full items-center gap-2.5 rounded-[14px] px-3 text-left text-[12.5px] leading-snug shadow-sm';
  if (b.kind === 'open') {
    return (
      <div aria-current={current ? 'step' : undefined} className={clsx(shell, 'justify-center gap-0 border-2 border-dashed px-1.5 text-center shadow-none', current ? 'border-primary bg-accent-soft font-medium text-neutral-900' : 'border-neutral-300 bg-white/60 text-neutral-500')}>
        {current ? 'You are here' : <><span aria-hidden className="text-[16px] font-semibold">?</span><span className="sr-only">Not decided yet</span></>}
      </div>
    );
  }
  if (b.kind === 'repeat' && node && node.kind !== 'question') {
    const label = `Same ending: ${node.text}`;
    const cls = clsx(shell, 'justify-center gap-1 px-1.5', node.kind === 'article' ? TONE.info : TONE[node.severity ?? 'success'] ?? TONE.success, 'ring-1 ring-neutral-200');
    return onEdit
      ? <button type="button" title={label} aria-label={`Map: change ending ${node.text} (also used by another answer)`} onClick={() => onEdit(node.id)} className={clsx(cls, 'hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}><Link2 size={14} aria-hidden className="shrink-0" /><span aria-hidden>Same</span></button>
      : <div title={label} className={cls}><Link2 size={14} aria-hidden className="shrink-0" /><span className="sr-only">{label}</span><span aria-hidden>Same</span></div>;
  }
  if (b.kind === 'repeat') {
    return <div title={`Back to: ${node?.text}`} className={clsx(shell, 'justify-center gap-1 bg-white px-1.5 text-neutral-500 ring-1 ring-neutral-200')}><Undo2 size={14} aria-hidden className="shrink-0" /><span className="sr-only">Back to: {node?.text}</span><span aria-hidden>Back</span></div>;
  }
  const Icon = b.kind === 'question' ? CircleHelp : b.kind === 'result' ? Flag : FileText;
  const text = node?.text.trim() ? <span className="line-clamp-2 text-neutral-900">{node.text}</span> : <span className="italic text-ink-muted">{b.kind === 'question' ? 'New question…' : 'New ending…'}</span>;
  const tone = b.kind === 'question' ? 'bg-white' : b.kind === 'article' ? TONE.info : TONE[node?.severity ?? 'success'] ?? TONE.success;
  const icon = <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]', b.kind === 'question' ? 'bg-accent text-primary' : 'bg-white/80 text-neutral-700')}><Icon size={15} aria-hidden /></span>;
  if (onEdit && node?.text.trim()) {
    return <button type="button" onClick={() => onEdit(b.nodeId!)} aria-label={`Map: change ${b.kind === 'question' ? 'question' : 'ending'} ${node.text}`} aria-current={current ? 'step' : undefined} className={clsx(shell, tone, ring, 'hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2')}>{icon}{text}</button>;
  }
  return <div className={clsx(shell, tone, ring)} aria-current={current ? 'step' : undefined}>{icon}{text}</div>;
}
