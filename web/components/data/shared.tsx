'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { DataError, Resource, Result } from '../../lib/data';
import { LoadingSkeleton } from '../ui/loading-skeleton';
import { Button } from '../ui/button';
export { naira } from '../../lib/data/money';
export const panel =
  'rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';
export function ResourceView<T>({
  resource,
  children,
}: {
  resource: Resource<T> & { retry: () => void };
  children: (data: T) => ReactNode;
}) {
  if (resource.status === 'loading') return <LoadingSkeleton />;
  if (resource.status === 'error')
    return (
      <div role="alert" className="rounded-xl border border-red-200 p-5 text-sm text-danger">
        <p>{resource.error.message}</p>
        <Button variant="outline" className="mt-3" onClick={resource.retry}>
          Retry
        </Button>
      </div>
    );
  return <>{children(resource.data)}</>;
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DataError | null>(null);
  async function run<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) setError(result.error);
      return result;
    } catch {
      const result: Result<T> = {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          message: 'Unable to complete the action. Please retry.',
          retryable: true,
        },
      };
      setError(result.error);
      return result;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
