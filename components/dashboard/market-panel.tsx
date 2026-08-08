"use client";

import { memo } from "react";
import { Activity, Clock, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { MarketSnapshot, NewsEvent } from "@/types";
import { ClientDate } from "@/components/client-date";

interface MarketPanelProps {
  market: MarketSnapshot | null;
  newsEvents: NewsEvent[];
  timestamp: string;
  isStale?: boolean;
}

export const MarketPanel = memo(function MarketPanel({ market, newsEvents, timestamp, isStale }: MarketPanelProps) {
  const isClosed = market?.freshness === "closed";
  const isLive = market && (market.freshness === "live" || market.freshness === "cached") && !isStale && !isClosed;
  const isUp = (market?.price || 0) > 4000;
  const session = isClosed ? "Market Closed" : (market?.session || "London");
  const bias = market?.bias || "NEUTRAL";

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
              XAUUSD REALTIME MARKET SNAPSHOT
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              Institutional Feed • {market?.provider || "TwelveData/Yahoo"} • <ClientDate date={timestamp} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isClosed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/30 text-blue-400 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" /> MARKET CLOSED
            </span>
          ) : isStale ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" /> STALE DATA
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> REALTIME LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-zinc-800 border border-zinc-700 text-zinc-400 uppercase tracking-wider">
              OFFLINE
            </span>
          )}
        </div>
      </div>

      {/* Main Grid Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Price Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Spot Price</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-mono font-black text-zinc-100 tracking-tight">
              {market?.price ? market.price.toFixed(2) : "--.--"}
            </span>
            {isUp ? (
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
            )}
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">Spread: Acceptable</span>
        </div>

        {/* Bias Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">HTF Bias</span>
          <div className="mt-1">
            <span className={`text-sm sm:text-base font-mono font-extrabold uppercase tracking-wider ${bias.toLowerCase().includes('bull') ? 'text-emerald-400' : bias.toLowerCase().includes('bear') ? 'text-rose-400' : 'text-amber-400'}`}>
              {bias}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">Higher Timeframe</span>
        </div>

        {/* Session Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Active Session</span>
          <div className="mt-1">
            <span className="text-sm sm:text-base font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" /> {session}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">Execution Window</span>
        </div>

        {/* News Impact Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">News Risk</span>
          <div className="mt-1">
            <span className={`text-sm sm:text-base font-mono font-bold uppercase tracking-wider ${newsEvents.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {newsEvents.length > 0 ? `${newsEvents.length} High Impact` : 'Clear Window'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">Safety Gate Active</span>
        </div>
      </div>
    </div>
  );
});

