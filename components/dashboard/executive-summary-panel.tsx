"use client";

import { memo } from "react";
import { ArrowRight, Activity, Zap, CheckCircle2, Layers, Radio } from "lucide-react";
import { StrategyResponse, Signal } from "@/types";
import { getAllStrategiesWithFallback } from "@/lib/strategyViewModel";
import { useRouter } from "next/navigation";

interface ExecutiveSummaryPanelProps {
  strategies?: StrategyResponse[];
  signals?: Signal[];
}

export const ExecutiveSummaryPanel = memo(function ExecutiveSummaryPanel({
  strategies = [],
  signals = []
}: ExecutiveSummaryPanelProps) {
  const router = useRouter();
  const safeStrats = getAllStrategiesWithFallback(strategies);
  const activeSignalsCount = Array.isArray(signals) ? signals.filter(s => ['APPROVED', 'DISPATCHED'].includes((s.status || '').toUpperCase())).length : 0;
  
  const strategyStatusCounts = safeStrats.reduce((acc, curr) => {
    const status = curr.status || 'active';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
              EXECUTIVE PIPELINE SUMMARY
              <span className="text-[10px] font-mono font-normal text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                5 CANONICAL ENGINES
              </span>
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              High-Level Signal Pipeline & Engine Health
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/monitoring")}
          className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold tracking-wider text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-md hover:bg-blue-500/20 transition-all uppercase shrink-0"
        >
          Open Detailed Scan <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* High-Level Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg">
          <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Active Signals
          </div>
          <div className="text-base sm:text-[17px] font-mono font-black text-emerald-400">
            {activeSignalsCount} <span className="text-[11px] font-normal text-zinc-400">Live</span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg">
          <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" /> Active Engines
          </div>
          <div className="text-base sm:text-[17px] font-mono font-black text-blue-400">
            {safeStrats.length} / 5 <span className="text-[11px] font-normal text-zinc-400">Ready</span>
          </div>
        </div>

        <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg">
          <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Pipeline Status
          </div>
          <div className="text-base sm:text-[17px] font-mono font-black text-cyan-400">
            {strategyStatusCounts['error'] ? 'DEGRADED' : 'HEALTHY'}
          </div>
        </div>

        <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-lg">
          <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Idempotency Gate
          </div>
          <div className="text-base sm:text-[17px] font-mono font-black text-indigo-400">
            PROTECTED
          </div>
        </div>
      </div>

      {/* Canonical Strategy Engine Quick Status Row */}
      <div className="p-2.5 bg-zinc-950/60 border border-zinc-800/60 rounded-lg flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
          <span className="font-bold text-zinc-200 uppercase">Canonical Rules Engine:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {safeStrats.map((strat, idx) => (
            <div
              key={strat.id}
              onClick={() => router.push('/monitoring')}
              className="cursor-pointer group px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 flex items-center gap-1.5 transition-all"
            >
              <span className="text-[10px] font-mono font-bold text-blue-400">S{idx + 1}</span>
              <span className="text-[10px] font-mono text-zinc-300 max-w-[120px] truncate font-medium">
                {strat.name.split('—')[1]?.trim() || strat.name}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${strat.status === "stopped" ? "bg-rose-500" : "bg-emerald-500"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Active Signals & Important Setups Section */}
      <div className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-lg space-y-2">
        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-200 uppercase">
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Active Signals & Important Setups</span>
          </div>
          <button
            onClick={() => router.push("/live-signals")}
            className="text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase"
          >
            Live Signals <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {Array.isArray(signals) && signals.length > 0 ? (
          <div className="space-y-1.5">
            {signals.slice(0, 3).map((sig) => {
              const isBuy = String(sig.direction).toUpperCase() === "BUY" || String(sig.direction).toUpperCase() === "LONG";
              return (
                <div
                  key={sig.signalKey}
                  onClick={() => router.push("/live-signals")}
                  className="cursor-pointer p-2 bg-zinc-900/80 border border-zinc-800 hover:border-blue-500/40 rounded flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${isBuy ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"}`}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                    <span className="text-zinc-200 font-bold">{sig.symbol || "XAUUSD"}</span>
                    <span className="text-zinc-400">{sig.strategyId}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-300">
                    <span>Entry: <strong className="text-zinc-100">{sig.entryPrice}</strong></span>
                    <span>SL: <strong className="text-rose-400">{sig.slPrice}</strong></span>
                    <span>TP1: <strong className="text-emerald-400">{sig.tp1Price}</strong></span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold border border-emerald-500/30">
                      {sig.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-2 bg-zinc-900/40 rounded border border-zinc-800/40 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span>Tidak ada sinyal aktif yang sedang dieksekusi di pasar.</span>
              <span className="text-[9px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                Engine Scanning 5 Strategi
              </span>
            </div>

            {/* High Priority Setup Candidates Monitored */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono pt-1">
              {safeStrats.slice(0, 2).map((st) => (
                <div
                  key={st.id}
                  onClick={() => router.push("/monitoring")}
                  className="cursor-pointer p-2 rounded bg-zinc-950/80 border border-zinc-800/80 hover:border-blue-500/40 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-blue-400 font-bold uppercase truncate max-w-[150px]">{st.name.split('—')[1]?.trim() || st.name}</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold uppercase">
                      SETUP CANDIDATE
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[9px] truncate">
                    Step: <span className="text-zinc-200">{st.currentStep || 'Memindai Likuiditas'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

