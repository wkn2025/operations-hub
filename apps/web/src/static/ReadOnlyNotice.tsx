import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { READ_ONLY_EVENT } from './demo';

/** Static (Pages) demo only: when a change is refused, say why for a few seconds, next to whatever the page itself reports. */
export function ReadOnlyNotice() {
  const [shown, setShown] = useState(0); // bumps on each refusal so the timer restarts
  useEffect(() => {
    const on = () => setShown((n) => n + 1);
    window.addEventListener(READ_ONLY_EVENT, on);
    return () => window.removeEventListener(READ_ONLY_EVENT, on);
  }, []);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(0), 5000);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {shown > 0 && (
        <p className="flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-accent-ink shadow-md ring-1 ring-inset ring-accent/50">
          <Eye size={15} aria-hidden /> Read-only demo: changes are not saved here.
        </p>
      )}
    </div>
  );
}
