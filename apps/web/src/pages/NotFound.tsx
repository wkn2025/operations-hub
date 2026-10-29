import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { IconTile } from '../components/ui/primitives';

export function NotFound({ what = 'page' }: { what?: 'page' | 'article' | 'category' }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <IconTile icon={Compass} size="lg" />
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-neutral-900">This {what} isn’t available</h1>
      <p className="mt-2 max-w-md text-[15px] text-neutral-500">
        It may have been archived, moved, or you may not have access. Try searching with Ctrl K, or start from the home page.
      </p>
      <Link to="/" className="mt-6 rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">Go to home</Link>
    </div>
  );
}
