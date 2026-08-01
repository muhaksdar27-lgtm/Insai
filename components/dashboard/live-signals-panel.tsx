"use client";

import { memo } from "react";
import { Zap, TrendingUp, TrendingDown, ArrowRight, Shield, Target } from "lucide-react";
import { Signal } from "@/types";
import { useRouter } from "next/navigation";
import { ClientDate } from "@/components/client-date";

interface LiveSignalsPanelProps {
  signals: Signal[];
}

export const LiveSignalsPanel = memo(function LiveSignalsPanel({ signals }: LiveSignalsPanelProps) {
  const router = useRouter();

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              LIVE SIGNALS DISPATCH ({signals.length})
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Validated Signal Output Stream
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/live-signals")}
          className="flex items-center gap-1 text-[8px] font-mono font-bold tracking-wider text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/20 transition-all uppercase"
        >
          View Live Signals <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Signals List */}
      {signals.length > 0 ? (
        <div className="space-y-2">
          {signals.map((sig) => {
            const isBuy = sig.direction === 'buy' || sig.direction === 'LONG';
            return (
              <div
                key={sig.id || sig.signalKey}
                className="bg-zinc-950/80 border border-zinc-800/80 rounded-md p-2.5 flex flex-col gap-2 hover:border-zinc-700/80 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                      {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {sig.direction.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-100">
                      {sig.symbol || 'XAUUSD'}
                    </span>
                  </div>

                  <span className="text-[8px] font-mono text-zinc-500">
                    <ClientDate date={sig.createdAt} />
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[8px] font-mono">
                  <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                    <span className="text-zinc-500 block uppercase">Entry</span>
                    <span className="font-bold text-zinc-200">{sig.entryPrice || '--'}</span>
                  </div>
                  <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                    <span className="text-zinc-500 block uppercase flex items-center gap-0.5">
                      <Shield className="w-2 h-2 text-rose-400" /> SL
                    </span>
                    <span className="font-bold text-rose-400">{sig.slPrice || '--'}</span>
                  </div>
                  <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                    <span className="text-zinc-500 block uppercase flex items-center gap-0.5">
                      <Target className="w-2 h-2 text-emerald-400" /> TP1
                    </span>
                    <span className="font-bold text-emerald-400">{sig.tp1Price || '--'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center bg-zinc-950/60 border border-dashed border-zinc-800/80 rounded-md">
          <Zap className="w-6 h-6 text-zinc-700 mx-auto mb-2 opacity-60" />
          <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            NO ACTIVE SIGNALS DISPATCHED
          </p>
          <p className="text-[8px] text-zinc-600 mt-1">
            Engine is continuously scanning canonical rules for setup confluences
          </p>
        </div>
      )}
    </div>
  );
});
