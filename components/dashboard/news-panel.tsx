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
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              ECONOMIC CALENDAR & HIGH IMPACT NEWS
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Market Volatility Risk Filter
            </p>
          </div>
        </div>

        <span className="text-[8px] font-mono text-zinc-500 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded uppercase">
          {newsEvents.length} Events Active
        </span>
      </div>

      {/* Events List */}
      {newsEvents.length > 0 ? (
        <div className="space-y-1.5">
          {newsEvents.slice(0, 6).map((event, idx) => (
            <div
              key={event.id || `news-${idx}`}
              className="p-2 bg-zinc-950/80 border border-zinc-800/80 rounded flex items-center justify-between text-[8px] font-mono hover:border-zinc-700/80 transition-all"
            >
              <div className="min-w-0 pr-2">
                <span className="font-bold text-zinc-200 block truncate">
                  {event.title}
                </span>
                <span className="text-zinc-500 text-[7px]">
                  <ClientDate date={event.publishedAt} />
                </span>
              </div>

              <span
                className={`px-1.5 py-0.5 rounded border font-bold uppercase shrink-0 ${
                  event.impact === 'high'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : event.impact === 'medium'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {event.impact || 'HIGH'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center bg-zinc-950/60 border border-dashed border-zinc-800/80 rounded-md">
          <Globe className="w-5 h-5 text-zinc-700 mx-auto mb-1 opacity-60" />
          <p className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
            NO ACTIVE HIGH-IMPACT NEWS EVENTS
          </p>
        </div>
      )}
    </div>
  );
});
