import { useEffect, useRef, useState } from 'react';
import type { OutpostStatusPageData } from '../types';
import { fetchOutpostStatus } from './api';

export type UseOutpostStatusResult =
  | { status: 'loading' }
  | { status: 'ready'; data: OutpostStatusPageData; updatedAt: number }
  | { status: 'error'; error: string; data?: OutpostStatusPageData; updatedAt?: number };

let POLL_INTERVAL_MS = 15_000;

export let useOutpostStatus = (): UseOutpostStatusResult => {
  let [result, setResult] = useState<UseOutpostStatusResult>({ status: 'loading' });
  let lastKnown = useRef<{ data: OutpostStatusPageData; updatedAt: number } | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;

    let load = async () => {
      try {
        let data = await fetchOutpostStatus();
        if (cancelled) return;
        lastKnown.current = { data, updatedAt: Date.now() };
        setResult({ status: 'ready', ...lastKnown.current });
      } catch (err) {
        if (cancelled) return;
        setResult({
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to load outpost status',
          ...lastKnown.current
        });
      }
    };

    load();
    let interval = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return result;
};
