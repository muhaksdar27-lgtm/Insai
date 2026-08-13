"use client";

import { useEffect, useMemo } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { 
  Activity, Clock, Timer, History, 
  TrendingUp, TrendingDown, Target, Shield,
  CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle
} from "lucide-react";
import { StrategyResponse, StrategyStep } from "@/types";
import { getAllStrategiesWithFallback, normalizeStrategy, buildTimeline, buildSetup } from "@/lib/strategyViewModel";

const CANONICAL_ORDER = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

function formatTime(dateString?: string | Date | null) {
  if (!dateString) return "--:--:--";
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString();
}

function StepBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === 'approved') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">APPROVED</span>;
  if (s === 'validated') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">VALIDATED</span>;
  if (s === 'active') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest animate-pulse">ACTIVE</span>;
  if (s === 'rejected') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-widest">REJECTED</span>;
  if (s === 'expired') return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-widest">EXPIRED</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase tracking-widest">AWAITING</span>;
}

function SetupSequence({ steps }: { steps: StrategyStep[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, idx) => {
        const s = (step.status || '').toLowerCase();
        const isActive = s === 'active';
        const isApproved = s === 'approved';
        const isValidated = s === 'validated';
        const isRejected = s === 'rejected';
        const isExpired = s === 'expired';

        let bgCls = 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500';
        let icon = <span className="w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[7px]">{idx + 1}</span>;

        if (isApproved) {
          bgCls = 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400';
          icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
        } else if (isValidated) {
          bgCls = 'bg-blue-950/20 border-blue-500/20 text-blue-400';
          icon = <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />;
        } else if (isActive) {
          bgCls = 'bg-amber-950/20 border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]';
          icon = <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
        } else if (isRejected) {
          bgCls = 'bg-rose-950/20 border-rose-500/20 text-rose-400';
          icon = <XCircle className="w-3.5 h-3.5 text-rose-500" />;
        } else if (isExpired) {
          bgCls = 'bg-orange-950/20 border-orange-500/20 text-orange-400';
          icon = <XCircle className="w-3.5 h-3.5 text-orange-500" />;
        }

        return (
          <div key={step.id || idx} className={`flex items-center justify-between p-2 rounded-md border ${bgCls} transition-all`}>
            <div className="flex items-center gap-2.5">
              {icon}
              <span className="text-[11px] font-bold tracking-wide">{step.name}</span>
            </div>
            <StepBadge status={s} />
          </div>
        );
      })}
    </div>
  );
}

function SetupDetails({ setup }: { setup: any }) {
  const isBuy = setup.direction === 'BUY' || setup.direction === 'LONG';
  const isSell = setup.direction === 'SELL' || setup.direction === 'SHORT';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/80 flex flex-col justify-center items-center">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Direction</span>
        <span className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-1 ${isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-zinc-400'}`}>
           {isBuy && <TrendingUp className="w-3 h-3" />}
           {isSell && <TrendingDown className="w-3 h-3" />}
           {setup.direction || '--'}
        </span>
      </div>
      <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/80 flex flex-col justify-center items-center">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Entry</span>
        <span className="text-[11px] font-mono font-bold text-zinc-200">{setup.entry && setup.entry !== '--' ? setup.entry : '--'}</span>
      </div>
      <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/80 flex flex-col justify-center items-center">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><Shield className="w-2.5 h-2.5 text-rose-500"/> Stop Loss</span>
        <span className="text-[11px] font-mono font-bold text-rose-400">{setup.sl && setup.sl !== '--' ? setup.sl : '--'}</span>
      </div>
      <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/80 flex flex-col justify-center items-center">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1"><Target className="w-2.5 h-2.5 text-emerald-500"/> Take Profit</span>
        <span className="text-[11px] font-mono font-bold text-emerald-400">{setup.tp && setup.tp !== '--' ? setup.tp : '--'}</span>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const { data: rawStrategies, loading, error, refetch } = useFetch<StrategyResponse[]>("/api/strategies", []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleAppUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === 'STRATEGY_TRANSITION' ) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          refetch();
        }, 1000);
      }
    };
    window.addEventListener('app-update', handleAppUpdate as EventListener);
    return () => {
      window.removeEventListener('app-update', handleAppUpdate as EventListener);
      clearTimeout(timeout);
    };
  }, [refetch]);

  const strategies = useMemo(() => {
    const fullList = getAllStrategiesWithFallback(rawStrategies || []);
    const normalized = fullList.map(normalizeStrategy);
    return normalized.sort((a, b) => {
      const idxA = CANONICAL_ORDER.indexOf(a.id);
      const idxB = CANONICAL_ORDER.indexOf(b.id);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });
  }, [rawStrategies]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col p-10">
         <AlertTriangle className="w-12 h-12 text-rose-500 mb-4" />
         <h2 className="text-sm font-bold text-rose-400 tracking-wide uppercase">Connection Error</h2>
         <p className="text-xs text-zinc-500 mt-2">{error.message}</p>
         <button onClick={refetch} className="mt-6 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded border border-zinc-700">Reconnect</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 pb-10">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h1 className="text-[13px] font-black text-zinc-100 flex items-center gap-2 tracking-widest uppercase font-mono">
            <Activity className="w-4 h-4 text-blue-500" />
            Scanner & Monitoring
          </h1>
          <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-widest font-bold">
            Real-time Setup Detection Engine
          </p>
        </div>
        <button 
          onClick={refetch}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded hover:bg-zinc-800 hover:text-white transition-all text-zinc-400"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Strategies Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {strategies.map((strat, idx) => {
          const steps = buildTimeline(strat);
          const setup = buildSetup(strat);
          
          return (
            <div key={strat.id} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col shadow-lg">
               
               {/* Strategy Header */}
               <div className="bg-zinc-900/50 p-3 border-b border-zinc-800 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-black uppercase tracking-widest rounded">
                        STRAT {idx + 1}/5
                      </span>
                      <h2 className="text-[11px] font-bold text-zinc-200 tracking-wide uppercase">{strat.name || strat.id}</h2>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono font-bold">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> TF: <span className="text-zinc-300">{setup.timeframe || '--'}</span></span>
                      <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> Sess: <span className="text-zinc-300">{setup.session || '--'}</span></span>
                      <span className="flex items-center gap-1"><History className="w-3 h-3" /> Updated: <span className="text-zinc-300">{formatTime(strat.updatedAt)}</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">Signal Key</span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-black px-1.5 py-0.5 rounded border border-zinc-800">{strat.signal || 'AWAITING'}</span>
                  </div>
               </div>

               {/* Body */}
               <div className="p-3 flex flex-col lg:flex-row gap-4 flex-1">
                  
                  {/* Sequence Timeline */}
                  <div className="flex-1 min-w-[240px]">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-zinc-800/50 pb-1">Setup Sequence</h3>
                    <SetupSequence steps={steps} />
                  </div>

                  {/* Parameters & Validation Result */}
                  <div className="flex-1 flex flex-col gap-3">
                     <div>
                       <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-zinc-800/50 pb-1">Parameters</h3>
                       <SetupDetails setup={setup} />
                     </div>

                     <div className="flex-1">
                       <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-zinc-800/50 pb-1">Validation Engine</h3>
                       
                       {/* AI Decision Box */}
                       {(strat.aiDecision || setup.aiDecision) ? (
                         <div className={`p-3 rounded border flex flex-col gap-2 ${
                            (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'bg-emerald-500/10 border-emerald-500/30' : 
                            (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'bg-rose-500/10 border-rose-500/30' : 
                            'bg-blue-500/10 border-blue-500/30'
                         }`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-black uppercase tracking-widest ${
                                 (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'text-emerald-400' : 
                                 (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'text-rose-400' : 
                                 'text-blue-400'
                              }`}>
                                RESULT: {strat.aiDecision || setup.aiDecision}
                              </span>
                              {(setup.confidence || setup.aiConfidence) && (
                                <span className="text-[10px] font-mono font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                  CONF: {setup.confidence || setup.aiConfidence}%
                                </span>
                              )}
                            </div>
                            {setup.aiReasoning && (
                               <p className="text-[10px] text-zinc-300 italic opacity-90 border-l-2 border-zinc-500/30 pl-2 leading-relaxed">
                                 &quot;{setup.aiReasoning}&quot;
                               </p>
                            )}
                         </div>
                       ) : (
                         <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded p-4 text-center">
                           <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                             <Loader2 className="w-3 h-3 animate-spin" />
                             Waiting for AI Gate
                           </span>
                         </div>
                       )}

                     </div>
                  </div>
               </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
