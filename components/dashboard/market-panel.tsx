"use client";

import { memo } from "react";
import { Activity, Clock, TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
  const session = isClosed ? "Market Closed" : (market?.session || "N/A");
  const bias = market?.bias || "NEUTRAL";
  
  const price = market?.price || 0;
  const change = market?.change ?? 0;
  const changePercent = market?.changePercent ?? 0;
  const isPositive = change >= 0;
  const high24h = market?.high24h;
  const low24h = market?.low24h;
  const spread = market?.spread !== undefined ? market.spread : 0.25;

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
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
              <span>Feed: <strong className="text-zinc-200">{market?.provider || "TwelveData/Yahoo"}</strong></span>
              <span>•</span>
              <span>Age: <strong className="text-zinc-200">{market?.ageMs !== undefined ? `${Math.round(market.ageMs)}ms` : "Live"}</strong></span>
              <span>•</span>
              <ClientDate date={timestamp} />
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
        {/* Spot Price & 24h Change Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Live Spot Price</span>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-mono font-black text-zinc-100 tracking-tight">
                {price > 0 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--.--"}
              </span>
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
              )}
            </div>
            {change !== 0 && (
              <div className={`flex items-center text-[10px] font-mono font-bold mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
              </div>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">
            Spread: <strong className="text-zinc-300">${spread.toFixed(2)}</strong> ({Math.round(spread * 10)} pips)
          </span>
        </div>

        {/* HTF Bias Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">HTF Bias (H4/H1)</span>
          <div className="mt-1">
            <span className={`text-sm sm:text-base font-mono font-extrabold uppercase tracking-wider ${bias.toLowerCase().includes('bull') ? 'text-emerald-400' : bias.toLowerCase().includes('bear') ? 'text-rose-400' : 'text-amber-400'}`}>
              {bias}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono mt-1 flex justify-between">
            <span>Structure: <strong className="text-zinc-300">Aligned</strong></span>
          </div>
        </div>

        {/* Session & Liquidity Window Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Active Session</span>
          <div className="mt-1">
            <span className="text-sm sm:text-base font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" /> {session}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">
            {session.includes('London') || session.includes('NY') ? '🔥 High Volatility Window' : '📊 Range Liquidity Phase'}
          </span>
        </div>

        {/* News Impact Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Macro & News Gate</span>
          <div className="mt-1">
            <span className={`text-sm sm:text-base font-mono font-bold uppercase tracking-wider ${newsEvents.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {newsEvents.length > 0 ? `${newsEvents.length} High Impact` : 'Clear Window'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono mt-1">
            {newsEvents.length > 0 ? '⚠️ News Spike Protocol' : '✅ Standard Risk Level'}
          </span>
        </div>
      </div>

      {/* 24h High/Low Stats bar if available */}
      {(high24h || low24h) && (
        <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-4 text-zinc-400">
            <span>24h Low: <strong className="text-zinc-200">${low24h ? low24h.toFixed(2) : '---'}</strong></span>
            <span>24h High: <strong className="text-zinc-200">${high24h ? high24h.toFixed(2) : '---'}</strong></span>
          </div>
          <div className="text-zinc-400 flex items-center gap-3">
            <span>Bid: <strong className="text-zinc-200">${market?.bid ? market.bid.toFixed(2) : (price > 0 ? (price - spread / 2).toFixed(2) : '---')}</strong></span>
            <span>Ask: <strong className="text-zinc-200">${market?.ask ? market.ask.toFixed(2) : (price > 0 ? (price + spread / 2).toFixed(2) : '---')}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
});

