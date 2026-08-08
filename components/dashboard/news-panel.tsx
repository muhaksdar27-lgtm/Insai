"use client";

import { memo } from "react";
import { Globe } from "lucide-react";
import { NewsEvent } from "@/types";
import { ClientDate } from "@/components/client-date";

interface NewsPanelProps {
  newsEvents: NewsEvent[];
}

export const NewsPanel = memo(function NewsPanel({ newsEvents }: NewsPanelProps) {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide">
              ECONOMIC CALENDAR & HIGH IMPACT NEWS
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              Market Volatility Risk Filter
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 px-2.5 py-1 rounded-md uppercase font-bold">
          {newsEvents.length} Events Active
        </span>
      </div>

      {/* Events List */}
      {newsEvents.length > 0 ? (
        <div className="space-y-2">
          {newsEvents.slice(0, 6).map((event, idx) => (
            <div
              key={event.id || `news-${idx}`}
              className="p-2.5 bg-zinc-950/80 border border-zinc-800/80 rounded-lg flex items-center justify-between text-[10px] font-mono hover:border-zinc-700/80 transition-all"
            >
              <div className="min-w-0 pr-2">
                <span className="font-bold text-zinc-100 block truncate text-sm">
                  {event.title}
                </span>
                <span className="text-zinc-400 text-[10px] block mt-0.5">
                  <ClientDate date={event.publishedAt} />
                </span>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] border font-bold uppercase shrink-0 ${
                  event.impact === 'high'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : event.impact === 'medium'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                {event.impact || 'HIGH'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center bg-zinc-950/60 border border-dashed border-zinc-800/80 rounded-lg">
          <Globe className="w-6 h-6 text-zinc-600 mx-auto mb-1 opacity-60" />
          <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            NO ACTIVE HIGH-IMPACT NEWS EVENTS
          </p>
        </div>
      )}
    </div>
  );
});

