export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-slate-300 p-6 dark:border-slate-600"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
