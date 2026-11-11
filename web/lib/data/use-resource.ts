'use client';
import { useEffect, useState, useRef } from 'react';
import type { Resource, Result } from './types';
import { useDataClient } from '../../components/data/provider';
export function useResource<T>(
  load: () => Promise<Result<T>>,
): Resource<T> & { retry: () => void } {
  const { revision } = useDataClient();
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<Resource<T>>({ status: 'loading', data: null, error: null });
  const previousLoad = useRef(load);
  useEffect(() => {
    let active = true;
    if (previousLoad.current !== load) {
      setState({ status: 'loading', data: null, error: null });
      previousLoad.current = load;
    }
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
