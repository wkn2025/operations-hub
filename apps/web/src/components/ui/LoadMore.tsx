/** "Showing n of total" + a Load more button for useArticlePages lists, so nothing is ever silently cut off. */
export function LoadMore({ q, noun = 'articles' }: {
  q: { data?: unknown[]; total: number; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }; noun?: string;
}) {
  const shown = q.data?.length ?? 0;
  if (!q.total) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
      <span role="status" className="tabular">Showing {shown} of {q.total} {noun}</span>
      {q.hasNextPage && (
        <button type="button" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}
          className="inline-flex items-center rounded-[10px] px-3 py-1.5 text-[13px] font-medium text-neutral-700 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-50 disabled:opacity-50">
          {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
