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
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'MARKET_TICK' && e.detail?.payload) {
        setLocalMarketStatus(e.detail.payload);
        setPing(true);
        setTimeout(() => setPing(false), 300);
      }
    };
    const handleSseStatus = (e: any) => {
      setSseStatus(e.detail);
    };
    
    window.addEventListener('app-update', handleAppUpdate);
    window.addEventListener('sse-status', handleSseStatus);
    
    return () => {
      window.removeEventListener('app-update', handleAppUpdate);
      window.removeEventListener('sse-status', handleSseStatus);
    };
  }, []);

  const currentStatus = localMarketStatus || marketStatus;

  const dataConnectionStatus = loading && !currentStatus ? 'connecting' : (errorMarket || currentStatus?.status === 'error' || currentStatus?.status === 'not_configured' ? 'disconnected' : 'connected');
  const realtimeSyncStatus = sseStatus === 'connected' ? 'synced' : sseStatus === 'connecting' ? 'degraded' : 'disconnected';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider bg-white/5 border px-1.5 py-0.5 rounded transition-colors duration-300 ${ping ? 'border-emerald-500/50 text-emerald-400' : 'border-white/10 text-zinc-400'}`}>
        {dataConnectionStatus === 'connecting' ? (
           <><RefreshCw className="w-2.5 h-2.5 text-zinc-400 animate-spin" /> DATA</>
        ) : dataConnectionStatus === 'connected' ? (
           <><div className={`w-1.5 h-1.5 rounded-full ${ping ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-emerald-500'} transition-all`} /> DATA</>
        ) : (
           <><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> DATA</>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
        {realtimeSyncStatus === 'synced' ? (
           <><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> SYNC</>
        ) : realtimeSyncStatus === 'degraded' ? (
           <><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> SYNC</>
        ) : (
           <><div className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> SYNC</>
        )}
      </div>
    </div>
  );
}
