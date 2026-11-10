'use client';
import { useEffect, useState } from 'react';
import type { Resource, Result } from './types';
import { useDataClient } from '../../components/data/provider';
export function useResource<T>(
  load: () => Promise<Result<T>>,
): Resource<T> & { retry: () => void } {
  const { revision } = useDataClient();
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<Resource<T>>({ status: 'loading', data: null, error: null });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    void load()
      .then((result) => {
        if (active)
          setState(
            result.ok
              ? { status: 'success', data: result.data, error: null }
              : { status: 'error', data: null, error: result.error },
          );
      })
      .catch(() => {
        if (active)
          setState({
            status: 'error',
            data: null,
            error: {
              code: 'UNAVAILABLE',
              message: 'Unable to load data. Please retry.',
              retryable: true,
            },
          });
      });
    return () => {
      active = false;
    };
  }, [load, revision, attempt]);
  return { ...state, retry: () => retry((n) => n + 1) };
}
