import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { CircleHelp, FileText, Flag, Undo2 } from 'lucide-react';
import type { Flow, FlowNode } from '@ops/shared';
import { layout, type MapBox, type Task } from './guide';

const W = 168, H = 56, GX = 52, GY = 16; // box size and gaps (px)
const x = (b: MapBox) => b.col * (W + GX), y = (b: MapBox) => b.row * (H + GY);

const TONE: Record<string, string> = { success: 'bg-success-soft', warning: 'bg-warning-soft', info: 'bg-primary-soft' };

/** The live decision map beside the builder: grows left to right as the author answers, like an n8n canvas. */
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

  const width = Math.max(1, m.cols) * (W + GX) - GX, height = Math.max(1, m.rows) * (H + GY) - GY;
  const k = avail > 0 ? Math.min(1, Math.max(0.6, avail / width)) : 1;

  // keep the step being worked on in view, scrolling only when it is (partly) hidden, so the start stays put when it can
  useEffect(() => {
    const b = m.boxes.find((k) => k.key === current), el = box.current;
    if (!b || !el) return;
    const pad = 20, l = x(b) * k, t = y(b) * k, { scrollLeft: sl, scrollTop: st, clientWidth: cw, clientHeight: ch } = el;
    const left = l < sl ? l : l + W * k + pad * 2 > sl + cw ? l + W * k + pad * 2 - cw : sl;
    const top = t < st ? t : t + H * k + pad * 2 > st + ch ? t + H * k + pad * 2 - ch : st;
    if (left !== sl || top !== st) el.scrollTo?.({ left, top, behavior: still ? 'auto' : 'smooth' });
  }, [current, m, still, k]);
  const at = new Map(m.boxes.map((b) => [b.key, b]));

  return (
    <section aria-label="Flow map" className="rounded-[24px] bg-neutral-50 ring-1 ring-neutral-200/80">
      <h2 className="px-5 pt-4 text-[12.5px] font-semibold uppercase tracking-wide text-neutral-500">Your flow so far</h2>
      <div ref={box} className="relative max-h-[70vh] overflow-auto p-5">
        <div style={{ width: width * k, height: height * k }}>
        <div className="relative origin-top-left" style={{ width, height, transform: k < 1 ? `scale(${k})` : undefined }}>
          <svg aria-hidden width={width} height={height} className="absolute inset-0 overflow-visible">
            {m.edges.map((e) => {
              const a = at.get(e.from)!, b = at.get(e.to)!;
              const x1 = x(a) + W, y1 = y(a) + H / 2, x2 = x(b), y2 = y(b) + H / 2, mx = (x1 + x2) / 2;
              return <path key={e.to} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" strokeWidth={1.5}
                className={clsx(b.kind === 'open' ? 'stroke-neutral-300 [stroke-dasharray:4_4]' : 'stroke-neutral-400')} />;
            })}
          </svg>
          {m.edges.map((e) => {
            const a = at.get(e.from)!, b = at.get(e.to)!;
            return (
              <span key={`l-${e.to}`} style={{ left: x(b) - GX / 2, top: y(b) + H / 2 }}
                className="absolute max-w-[96px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-white px-2 py-0.5 text-[11.5px] font-medium text-neutral-700 ring-1 ring-neutral-200">
                {e.label || '…'}<span className="sr-only"> (answer to {byId.get(a.nodeId!)?.text})</span>
              </span>
            );
          })}
          {m.boxes.map((b) => (
            <motion.div key={b.key} initial={still ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}
              style={{ left: x(b), top: y(b), width: W, height: H }} className="absolute">
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
      <div className={clsx(shell, 'border-2 border-dashed bg-white/60 text-neutral-500 shadow-none', current ? 'border-primary bg-accent-soft text-neutral-900' : 'border-neutral-300')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-neutral-100 text-[14px] font-semibold text-neutral-500">?</span>
        {current ? <span className="font-medium">You are here</span> : 'Not decided yet'}
      </div>
    );
  }
  if (b.kind === 'repeat') {
    return <div className={clsx(shell, 'bg-white text-neutral-500 ring-1 ring-neutral-200')}><Undo2 size={14} aria-hidden className="shrink-0" /><span className="line-clamp-2">Back to: {node?.text}</span></div>;
  }
  const Icon = b.kind === 'question' ? CircleHelp : b.kind === 'result' ? Flag : FileText;
  const text = node?.text.trim() ? <span className="line-clamp-2 text-neutral-900">{node.text}</span> : <span className="italic text-ink-muted">{b.kind === 'question' ? 'New question…' : 'New ending…'}</span>;
  const tone = b.kind === 'question' ? 'bg-white' : b.kind === 'article' ? TONE.info : TONE[node?.severity ?? 'success'] ?? TONE.success;
  const icon = <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]', b.kind === 'question' ? 'bg-accent text-primary' : 'bg-white/80 text-neutral-700')}><Icon size={15} aria-hidden /></span>;
  if (b.kind === 'question' && onEdit && node?.text.trim()) {
    return <button type="button" onClick={() => onEdit(b.nodeId!)} aria-label={`Map: change question ${node.text}`} className={clsx(shell, tone, ring, 'hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}>{icon}{text}</button>;
  }
  return <div className={clsx(shell, tone, ring)} aria-current={current ? 'step' : undefined}>{icon}{text}</div>;
}
