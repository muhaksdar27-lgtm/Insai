"use client";

import { useFetch } from "@/hooks/use-fetch";
import { Wifi, WifiOff, RefreshCw, X } from "lucide-react";
import { useState, useEffect } from "react";

export default function ConnectionStatus() {
  const { data: marketStatus, error: errorMarket, loading } = useFetch<any>("/api/market/xauusd/latest", null);
  const [localMarketStatus, setLocalMarketStatus] = useState<any>(null);
  
  useEffect(() => {
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'MARKET_TICK' && e.detail?.payload) {
        // Use the SSE payload directly to update status instead of hitting the API
        setLocalMarketStatus(e.detail.payload);
      }
    };
    window.addEventListener('app-update', handleAppUpdate);
    return () => window.removeEventListener('app-update', handleAppUpdate);
  }, []);

  const currentStatus = localMarketStatus || marketStatus;

  const dataConnectionStatus = loading && !currentStatus ? 'connecting' : (errorMarket || currentStatus?.status === 'error' || currentStatus?.status === 'not_configured' ? 'disconnected' : 'connected');
  const realtimeSyncStatus = currentStatus?.freshness === 'live' ? 'synced' : currentStatus?.freshness === 'cached' ? 'degraded' : 'disconnected';

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg shadow-sm">
        {dataConnectionStatus === 'connecting' ? (
           <><RefreshCw className="w-3 h-3 text-zinc-400 animate-spin" /> Data: Connecting</>
        ) : dataConnectionStatus === 'connected' ? (
           <><Wifi className="w-3 h-3 text-emerald-400" /> Data: Connected</>
        ) : (
           <><WifiOff className="w-3 h-3 text-rose-400" /> Data: Disconnected</>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg shadow-sm">
        {realtimeSyncStatus === 'synced' ? (
           <><RefreshCw className="w-3 h-3 text-blue-400" /> Sync: Live</>
        ) : realtimeSyncStatus === 'degraded' ? (
           <><RefreshCw className="w-3 h-3 text-amber-400" /> Sync: Degraded</>
        ) : (
           <><X className="w-3 h-3 text-zinc-500" /> Sync: Offline</>
        )}
      </div>
    </div>
  );
}
