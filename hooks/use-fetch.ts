import { useState, useCallback, useMemo } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';

const cache = new Map<string, { data: any, timestamp: number }>();
const inflight = new Map<string, Promise<any>>();
const CACHE_DURATION = 5000; // 5 seconds cache

export function useFetch<T>(url: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);  
  const [loading, setLoading] = useState(true);  
  const [error, setError] = useState<string | null>(null);

  const doFetchInternal = useCallback(async () => {
    let fetchPromise = inflight.get(url);
    if (!fetchPromise) {
      fetchPromise = fetch(url).then(async res => {
        if (res.status === 401) throw new Error("Unauthorized (401)");
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const json = await res.json();
          if (!res.ok || json.success === false) {
            const errMsg = json.error?.message || json.error || json.message || `API Error: ${res.status}`;
            throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
          }
          return json.data !== undefined && json.data !== null ? json.data : json;
        } else {
          if (!res.ok) throw new Error(`API Error: ${res.status}`);
          return await res.text();
        }
      });
      inflight.set(url, fetchPromise);
      fetchPromise.finally(() => {
        if (inflight.get(url) === fetchPromise) inflight.delete(url);
      });
    }
    return fetchPromise;
  }, [url]);

  const fetchData = useCallback(async (ignoreCache = false) => {
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
    setLoading(true);
    try {
      const finalData = await doFetchInternal();
      cache.set(url, { data: finalData, timestamp: Date.now() });
      setData(finalData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [url, doFetchInternal]);

  useIsomorphicLayoutEffect(() => {
    let isMounted = true;
    
    const handleRefetch = () => {
      if (isMounted) fetchData(true);
    };
    window.addEventListener('app-refetch', handleRefetch);
    
    const doFetch = async () => {
      try {
        const finalData = await doFetchInternal();
        
        cache.set(url, { data: finalData, timestamp: Date.now() });
        
        if (isMounted) {
          setData(finalData);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load data.");
          setLoading(false);
        }
      }
    };

    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      if (isMounted) {
        setData(cached.data);
        setLoading(false);
        setError(null);
      }
    } else {
       doFetch();
    }
    
    return () => {
      isMounted = false;
      window.removeEventListener('app-refetch', handleRefetch);
    };
  }, [url, doFetchInternal, fetchData]);

  return useMemo(() => ({
    data,
    loading,
    error,
    refetch: () => fetchData(true)
  }), [data, loading, error, fetchData]);
}
