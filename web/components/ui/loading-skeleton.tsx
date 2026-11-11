export function LoadingSkeleton({ label = 'Loading workspace' }: { label?: string }) {
  return (
    <section role="status" aria-label={label} aria-busy="true" className="space-y-4">
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-4 h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-3 h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </section>
  );
}
