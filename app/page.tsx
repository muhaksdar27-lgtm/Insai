"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { DashboardSnapshot } from "@/types";
import { MarketPanel } from "@/components/dashboard/market-panel";
import { AiIntelligencePanel } from "@/components/dashboard/ai-intelligence-panel";
import { EngineStatusPanel } from "@/components/dashboard/engine-status-panel";
import { ExecutiveSummaryPanel } from "@/components/dashboard/executive-summary-panel";
import { SystemHealthPanel } from "@/components/dashboard/system-health-panel";
import { NewsPanel } from "@/components/dashboard/news-panel";
import { ClientDate } from "@/components/client-date";
import { RefreshCw, AlertTriangle, ShieldCheck, Activity, Terminal } from "lucide-react";

export default function DashboardPage() {
  const { data: snapshot, loading, error, refetch } = useFetch<DashboardSnapshot | null>("/api/dashboard/snapshot", null);
  const [ping, setPing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced Event Bus Subscription to prevent SSE refetch thrashing
  const handleUpdate = useCallback(() => {
    setPing(true);
    setTimeout(() => setPing(false), 300);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      refetch();
    }, 500); // 500ms debounce
  }, [refetch]);

  useEffect(() => {
    window.addEventListener("app-update", handleUpdate);
    window.addEventListener("app-refetch", handleUpdate);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      window.removeEventListener("app-update", handleUpdate);
      window.removeEventListener("app-refetch", handleUpdate);
    };
  }, [handleUpdate]);

  const masterTimestamp = snapshot?.timestamp || new Date().toISOString();
  const isStale = snapshot?.market?.freshness === "stale";

  return (
    <div className="space-y-3 pb-12 relative min-h-screen">
      {/* Top Command Center Status Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-mono font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
              EXECUTIVE COMMAND CENTER
              <span className={`w-2 h-2 rounded-full ${ping ? 'bg-emerald-400 scale-125' : 'bg-emerald-500'} transition-all shrink-0`} />
            </h2>
            <p className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
              Synchronized Realtime Snapshot: <ClientDate date={masterTimestamp} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error ? (
            <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase">
              <AlertTriangle className="w-3.5 h-3.5" /> API DEGRADED
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase">
              <ShieldCheck className="w-3.5 h-3.5" /> SYNCHRONIZED
            </span>
          )}

          <button
            onClick={() => handleUpdate()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 text-[10px] font-mono font-bold tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Error Alert Banner */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-[10px] font-mono text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Snapshot Error: {error.message || "Failed to sync realtime snapshot"}</span>
          </div>
          <button
            onClick={() => refetch()}
            className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded border border-rose-500/40 text-rose-200 font-bold uppercase transition-all"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading State Skeleton overlay for initial load */}
      {loading && !snapshot && (
        <div className="p-8 text-center bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-2">
          <Activity className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
          <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest font-bold">
            Synchronizing Command Center Realtime Snapshot...
          </p>
        </div>
      )}

      {/* Main Realtime Dashboard Grid */}
      {snapshot && (
        <div className="space-y-3">
          {/* Market Overview */}
          <MarketPanel
            market={snapshot.market}
            newsEvents={snapshot.news?.active_events || []}
            timestamp={snapshot.timestamp}
            isStale={isStale}
          />

          {/* AI Quantitative Intelligence */}
          <AiIntelligencePanel />

          {/* Engine & Infrastructure */}
          <EngineStatusPanel
            engine={snapshot.engine}
            system={snapshot.system}
          />

          {/* Core Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="space-y-3">
              <ExecutiveSummaryPanel
                strategies={snapshot.strategies}
                signals={snapshot.signals}
              />
              <NewsPanel
                newsEvents={snapshot.news?.active_events || []}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <SystemHealthPanel
                system={snapshot.system}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
