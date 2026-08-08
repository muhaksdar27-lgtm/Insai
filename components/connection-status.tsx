"use client";

import { useFetch } from "@/hooks/use-fetch";
import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

export default function ConnectionStatus() {
  const { data: marketStatus, error: errorMarket, loading } = useFetch<any>("/api/market/xauusd/latest", null);
  const [localMarketStatus, setLocalMarketStatus] = useState<any>(null);
  const [sseStatus, setSseStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [ping, setPing] = useState(false);
  
  useEffect(() => {
    let pingTimeout: NodeJS.Timeout | null = null;
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'MARKET_TICK' && e.detail?.payload) {
        setLocalMarketStatus(e.detail.payload);
        setPing(true);
        if (pingTimeout) clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => setPing(false), 300);
      }
    };
    const handleSseStatus = (e: any) => {
      setSseStatus(e.detail);
      if (e.detail === 'disconnected') {
        setLocalMarketStatus(null);
      }
    };
    
    window.addEventListener('app-update', handleAppUpdate);
    window.addEventListener('sse-status', handleSseStatus);
    
    return () => {
      window.removeEventListener('app-update', handleAppUpdate);
      window.removeEventListener('sse-status', handleSseStatus);
      if (pingTimeout) clearTimeout(pingTimeout);
    };
  }, []);

  const currentStatus = localMarketStatus || marketStatus;
  const hasError = !!errorMarket || currentStatus?.status === 'error' || currentStatus?.status === 'not_configured';

  const dataConnectionStatus = loading && !currentStatus ? 'connecting' : (hasError ? 'disconnected' : 'connected');
  const realtimeSyncStatus = sseStatus === 'connected' ? 'synced' : sseStatus === 'connecting' ? 'degraded' : 'disconnected';

  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900/90 border px-1.5 py-0.5 rounded transition-colors duration-300 ${ping ? 'border-emerald-500/50 text-emerald-400' : 'border-zinc-800 text-zinc-400'}`}>
        {dataConnectionStatus === 'connecting' ? (
           <><RefreshCw className="w-3 h-3 text-zinc-400 animate-spin shrink-0" /> DATA</>
        ) : dataConnectionStatus === 'connected' ? (
           <><div className={`w-2 h-2 rounded-full ${ping ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] scale-110' : 'bg-emerald-500'} transition-all shrink-0`} /> DATA</>
        ) : (
           <><div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /> DATA</>
        )}
      </div>
      <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-1.5 py-0.5 rounded">
        {realtimeSyncStatus === 'synced' ? (
           <><div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" /> SYNC</>
        ) : realtimeSyncStatus === 'degraded' ? (
           <><div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> SYNC</>
        ) : (
           <><div className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" /> SYNC</>
        )}
      </div>
    </div>
  );
}
