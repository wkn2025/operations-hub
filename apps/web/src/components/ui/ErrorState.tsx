import { CloudOff, RotateCw } from 'lucide-react';
import { IconTile } from './primitives';

/** Load failure that is not "not found": says what failed and offers a retry. */
export function ErrorState({ title, detail, onRetry, retrying, compact }: {
  title: string; detail?: string; onRetry: () => void; retrying?: boolean; compact?: boolean;
}) {
  return (
    <div role="alert" className={compact ? 'flex items-center gap-3 rounded-[14px] bg-danger-soft/60 px-4 py-3' : 'flex flex-col items-center px-6 py-16 text-center'}>
      {!compact && <IconTile icon={CloudOff} size="lg" tone="neutral" />}
      <div className={compact ? 'min-w-0 flex-1' : 'mt-4'}>
        <p className="text-[15px] font-medium text-neutral-900">{title}</p>
        <p className="mt-1 max-w-md text-sm text-ink-muted">{detail ?? 'The server did not respond as expected. Check your connection and try again.'}</p>
      </div>
      <button type="button" onClick={onRetry} disabled={retrying}
        className={'inline-flex items-center gap-2 rounded-[12px] bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 shadow-sm ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-60 ' + (compact ? '' : 'mt-5')}>
        <RotateCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden /> Retry
      </button>
    </div>
  );
}
