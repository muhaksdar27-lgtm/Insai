'use client';

import { useEffect, useRef } from 'react';
import { useAudioNotification } from '@/hooks/use-audio-notification';

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useAudioNotification();

  useEffect(() => {
    let evtSource: EventSource | null = null;
    let reconnectAttempts = 0;
    
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
        
        // Exponential backoff: 5s, 10s, 20s... max 60s
        const backoff = Math.min(5000 * Math.pow(2, reconnectAttempts), 60000);
        reconnectAttempts++;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      if (evtSource) {
        evtSource.close();
        evtSource = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}
