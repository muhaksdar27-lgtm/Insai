'use client';

import { useEffect, useRef } from 'react';
import { useAudioNotification } from '@/hooks/use-audio-notification';

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useAudioNotification();

  useEffect(() => {
    let evtSource: EventSource | null = null;
    let reconnectAttempts = 0;
    const refetchDebounceTimers: Record<string, NodeJS.Timeout> = {};

    const triggerDebouncedRefetch = (urls: string[], delayMs = 400) => {
      urls.forEach(url => {
        if (refetchDebounceTimers[url]) {
          clearTimeout(refetchDebounceTimers[url]);
        }
        refetchDebounceTimers[url] = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('app-refetch', { detail: { url } }));
          delete refetchDebounceTimers[url];
        }, delayMs);
      });
    };
    
    const connect = () => {
      if (evtSource) {
        evtSource.close();
      }

      evtSource = new EventSource('/api/stream');
      
      evtSource.onopen = () => {
        reconnectAttempts = 0; // reset on success
        window.dispatchEvent(new CustomEvent('sse-status', { detail: 'connected' }));
        // Trigger deterministic targeted data refresh on reconnect without fan-out flooding
        window.dispatchEvent(new CustomEvent('app-refetch', { detail: { source: 'sse-reconnect' } }));
      };

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ping) return;
          const customEvent = new CustomEvent('app-update', { detail: data });
          window.dispatchEvent(customEvent);

          // Route event to targeted endpoints
          const type = String(data.type || data.event || '').toUpperCase();
          if (['SIGNAL_APPROVED', 'NEW_SIGNAL', 'SIGNAL_ACTIVE', 'SIGNAL_READY'].includes(type)) {
            triggerDebouncedRefetch(['/api/signals/live', '/api/dashboard/snapshot', '/api/strategies']);
          } else if (['SIGNAL_CLOSED', 'POSITION_CLOSED', 'TAKE_PROFIT', 'STOP_LOSS', 'HISTORICAL_UPDATE'].includes(type)) {
            triggerDebouncedRefetch(['/api/signals/live', '/api/signals/history', '/api/dashboard/snapshot']);
          } else if (['STRATEGY_TRANSITION', 'SETUP_FOUND', 'SETUP_DETECTED', 'SCAN_COMPLETED'].includes(type)) {
            triggerDebouncedRefetch(['/api/strategies', '/api/dashboard/snapshot']);
          } else if (['MARKET_UPDATE', 'MARKET_TICK', 'CANDLE_CLOSE'].includes(type)) {
            triggerDebouncedRefetch(['/api/dashboard/snapshot']);
          } else if (['CONFIG_UPDATE', 'SETTINGS_SAVED'].includes(type)) {
            triggerDebouncedRefetch(['/api/config/status', '/api/system/health', '/api/dashboard/snapshot']);
          }
        } catch {
          // Ignore invalid JSON messages silently
        }
      };

      evtSource.onerror = () => {
        window.dispatchEvent(new CustomEvent('sse-status', { detail: 'disconnected' }));
        if (evtSource) {
          evtSource.close();
          evtSource = null;
        }
        
        // If navigator is offline, do not keep retrying until online
        if (typeof window !== 'undefined' && !navigator.onLine) {
          return;
        }

        // Exponential backoff: 5s, 10s, 20s... max 60s
        const backoff = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
        reconnectAttempts++;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, backoff);
      };
    };

    const handleOnline = () => {
      reconnectAttempts = 0;
      window.dispatchEvent(new CustomEvent('sse-status', { detail: 'reconnecting' }));
      connect();
    };

    const handleOffline = () => {
      window.dispatchEvent(new CustomEvent('sse-status', { detail: 'disconnected' }));
      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    connect();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      Object.values(refetchDebounceTimers).forEach(clearTimeout);
    };
  }, []);

  return <>{children}</>;
}
