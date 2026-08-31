"use client";

import { memo } from "react";
import { Sparkles, BrainCircuit, Target, ShieldCheck, Compass, BarChart2, Layers } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";

export const AiIntelligencePanel = memo(function AiIntelligencePanel() {
  const { data: intel } = useFetch<any>("/api/ai/intelligence", null);

  const synthesis = intel?.aiSynthesis || {
    marketRegime: "Equilibrium / Order Flow Analysis",
    institutionalBias: "NEUTRAL",
    confidenceScore: 88,
    accumulationScore: 65,
    distributionScore: 35,
    keyActionableZone: "Calculated via OTE / OB",
    liquidityNarrative: "Monitoring multi-timeframe liquidity sweep & mitigation.",
    recommendation: "Align positions with higher timeframe bias and wait for displacement."
  };

  const dealingRange = intel?.dealingRange;
  const fibPercent = dealingRange ? Math.round(dealingRange.fibLevel * 100) : 50;
  const isDiscount = fibPercent <= 50;
  const isOte = dealingRange?.oteZone;

  return (
    <div className="bg-zinc-900/70 border border-blue-500/20 rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
              QUANTITATIVE AI INTELLIGENCE
              <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> GEMINI 3.7 FLASH
              </span>
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              Institutional Orderflow • SMC Liquidity Mapping • Realtime Confluence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5" /> BIAS: {synthesis.institutionalBias}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> CONFIDENCE: {synthesis.confidenceScore}%
          </span>
        </div>
      </div>

      {/* Grid Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Dealing Range Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5 text-blue-400" /> Dealing Range Matrix
            </span>
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isDiscount ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
              {dealingRange?.zone || (isDiscount ? 'DISCOUNT ZONE' : 'PREMIUM ZONE')}
            </span>
          </div>

          {/* Range Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] font-mono text-zinc-400">
              <span>Low: ${dealingRange?.swingLow ? dealingRange.swingLow.toFixed(1) : '---'}</span>
              <span className="text-amber-400 font-bold">Eq: ${dealingRange?.equilibrium ? dealingRange.equilibrium.toFixed(1) : '---'}</span>
              <span>High: ${dealingRange?.swingHigh ? dealingRange.swingHigh.toFixed(1) : '---'}</span>
            </div>
            <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden relative border border-zinc-700">
              {/* OTE Highlight Zone (61.8% to 78.6%) */}
              <div className="absolute left-[61.8%] right-[21.4%] top-0 bottom-0 bg-blue-500/30 border-x border-blue-400/50" title="OTE Zone (61.8% - 78.6%)" />
              {/* Equilibrium marker */}
              <div className="absolute left-[50%] top-0 bottom-0 w-0.5 bg-amber-400/80 z-10" />
              {/* Current Price Cursor */}
              <div 
                className="absolute top-0 bottom-0 w-2 -ml-1 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] z-20"
                style={{ left: `${Math.max(2, Math.min(98, fibPercent))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-zinc-300 pt-0.5">
              <span>Fib Level: <strong className="text-zinc-100">{fibPercent}%</strong></span>
              {isOte && <span className="text-blue-400 font-bold text-[9px] uppercase tracking-wider">⚡ In OTE Optimal Zone</span>}
            </div>
          </div>
        </div>

        {/* Institutional Orderflow Accumulation / Distribution */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Institutional Flow
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {intel?.displacement?.hasDisplacement ? `⚡ ${intel.displacement.direction.toUpperCase()} DISPLACEMENT` : 'BALANCED FLOW'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-emerald-400 font-bold">Accumulation: {synthesis.accumulationScore}%</span>
              <span className="text-rose-400 font-bold">Distribution: {synthesis.distributionScore}%</span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden flex">
              <div 
                className="bg-emerald-500 transition-all duration-500" 
                style={{ width: `${synthesis.accumulationScore}%` }} 
              />
              <div 
                className="bg-rose-500 transition-all duration-500" 
                style={{ width: `${synthesis.distributionScore}%` }} 
              />
            </div>
            <div className="text-[9px] font-mono text-zinc-400 flex items-center justify-between">
              <span>FVGs: {intel?.metrics?.fvgsCount ?? 0}</span>
              <span>OBs: {intel?.metrics?.orderBlocksCount ?? 0}</span>
              <span>Sweeps: {intel?.metrics?.recentSweepsCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Actionable Strategy Guidance */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-amber-400" /> Actionable Strategy POI
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-400">
              {synthesis.keyActionableZone}
            </span>
          </div>

          <p className="text-[11px] font-mono text-zinc-300 line-clamp-2 leading-relaxed">
            {synthesis.recommendation}
          </p>

          <p className="text-[9px] font-mono text-zinc-400 line-clamp-1 italic border-t border-zinc-800/60 pt-1">
            &ldquo;{synthesis.liquidityNarrative}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
});
