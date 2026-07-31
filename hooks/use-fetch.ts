import { useState, useCallback, useRef } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';

export type FetchErrorCategory = 'NETWORK' | 'TIMEOUT' | 'HTTP_ERROR' | 'API_ERROR' | 'OFFLINE';

export interface FetchError {
  category: FetchErrorCategory;
  message: string;
  status?: number;
  code?: string;
}

export interface UseFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const cache = new Map<string, { data: any; timestamp: number }>();
const inflight = new Map<string, Promise<any>>();
const CACHE_DURATION = 5000;

export function useFetch<T>(url: string, initialData: T, options?: UseFetchOptions) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FetchError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  const timeoutMs = options?.timeoutMs ?? 10000;
  const maxRetries = options?.retries ?? 1;
  const retryDelay = options?.retryDelayMs ?? 1000;

  const executeFetchWithRetry = useCallback(async (signal: AbortSignal): Promise<any> => {
    let attempt = 0;
    while (true) {
      if (signal.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }

      let fetchPromise = inflight.get(url);
      if (!fetchPromise) {
        fetchPromise = fetch(url, { signal }).then(async (res) => {
          if (!res.ok) {
            let errJson: any = null;
            try {
              const contentType = res.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                errJson = await res.json();
              }
            } catch {
              // Ignore body parse error
            }

            const fetchErr: FetchError = {
              category: res.status >= 500 ? 'HTTP_ERROR' : 'API_ERROR',
              message: errJson?.error?.message || errJson?.error || errJson?.message || `HTTP ${res.status}: ${res.statusText}`,
              status: res.status,
              code: errJson?.error?.code
            };
            const customErr = new Error(fetchErr.message);
            (customErr as any).fetchError = fetchErr;
            throw customErr;
          }

          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const json = await res.json();
            if (json.success === false) {
              const fetchErr: FetchError = {
                category: 'API_ERROR',
                message: typeof json.error === 'string' ? json.error : (json.error?.message || 'API request failed'),
                code: json.error?.code
              };
              const customErr = new Error(fetchErr.message);
              (customErr as any).fetchError = fetchErr;
              throw customErr;
            }
            return json.data !== undefined ? json.data : json;
          } else {
            return await res.text();
          }
        });

        inflight.set(url, fetchPromise);
        fetchPromise.finally(() => {
          if (inflight.get(url) === fetchPromise) {
            inflight.delete(url);
          }
        });
      }

      try {
        return await fetchPromise;
      } catch (err: any) {
        if (err.name === 'AbortError' || signal.aborted) {
          throw err;
        }

        const fetchErr: FetchError | undefined = err.fetchError;
        const isTransient = !fetchErr || fetchErr.category === 'NETWORK' || (fetchErr.status !== undefined && fetchErr.status >= 500);
        if (attempt < maxRetries && isTransient) {
          attempt++;
          await new Promise(res => setTimeout(res, retryDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        throw err;
      }
    }
  }, [url, maxRetries, retryDelay]);

  const fetchData = useCallback(async (ignoreCache = false) => {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      setError({
        category: 'OFFLINE',
        message: 'No connection (Offline)'
      });
      setLoading(false);
      return;
    }

    if (ignoreCache) {
      cache.delete(url);
    } else {
      const cached = cache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        setError(null);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }

    setLoading(true);

    timeoutIdRef.current = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const finalData = await executeFetchWithRetry(controller.signal);
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);

      cache.set(url, { data: finalData, timestamp: Date.now() });
      setData(finalData);
      setError(null);
    } catch (err: any) {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        if (controller.signal.aborted) {
          setError({
            category: 'TIMEOUT',
            message: `Request timed out after ${timeoutMs}ms`
          });
        }
        return;
      }

      if (err.fetchError) {
        setError(err.fetchError);
      } else {
        setError({
          category: 'NETWORK',
          message: err.message || 'Network request failed'
        });
      }
    } finally {
      setLoading(false);
    }
  }, [url, timeoutMs, executeFetchWithRetry]);

  useIsomorphicLayoutEffect(() => {
    let isMounted = true;

    const handleRefetch = (e: Event) => {
      if (!isMounted) return;
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.url) {
        if (Array.isArray(customEvt.detail.url)) {
          if (!customEvt.detail.url.includes(url)) return;
        } else if (customEvt.detail.url !== url) {
          return;
        }
      }
      fetchData(true);
    };

    window.addEventListener('app-refetch', handleRefetch);

    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      if (isMounted) {
        setData(cached.data);
        setLoading(false);
        setError(null);
      }
    } else {
      fetchData(false);
    }

    return () => {
      isMounted = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      window.removeEventListener('app-refetch', handleRefetch);
    };
  }, [url, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: useCallback(() => fetchData(true), [fetchData]),
  };
}


