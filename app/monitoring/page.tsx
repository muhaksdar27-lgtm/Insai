"use client";

import {
  Activity,
  ListFilter,
  Clock,
  AlertTriangle,
  Crosshair,
  ChevronDown,
  ChevronUp,
  History,
  Timer,
  CheckSquare,
  FileSearch,
  X,
  Zap,
  TrendingUp,
  TrendingDown,
  RotateCw
} from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useState, useMemo, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getStatusBadge } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { StrategyResponse } from "@/types";
import { normalizeStrategy, buildSetup, buildRules, buildTimeline, buildProgress, getAllStrategiesWithFallback } from "@/lib/strategyViewModel";

import {
  TimelineCard,
  SetupCard,
  RuleTable
} from "@/components/strategy-ui";

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

const CANONICAL_ORDER = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

export default function Monitoring() {
  const { data: rawStrategies, loading, error, refetch } = useFetch<StrategyResponse[]>("/api/strategies", []);
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleAppUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === 'STRATEGY_TRANSITION' ) {
        // Debounce refetch to avoid massive rerenders if multiple transitions happen quickly
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

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drawerData, setDrawerData] = useState<ReturnType<typeof normalizeStrategy> | null>(null);
  const drawerSetup = drawerData ? buildSetup(drawerData as StrategyResponse) : null;
  const drawerRules = drawerData ? buildRules(drawerData as StrategyResponse) : null;

  const renderEvidence = (ruleId: string, evidence: Record<string, unknown> | null | undefined) => {
    if (!evidence || Object.keys(evidence).length === 0) {
      return <span className="text-[10px] text-zinc-600">No detailed evidence provided for {ruleId}.</span>;
    }
    
    return (
      <div className="grid grid-cols-2 gap-1.5 mt-1">
        {Object.entries(evidence).map(([k, v]: [string, unknown]) => {
          let displayVal = String(v);
          if (typeof v === 'object' && v !== null) {
            const objV = v as Record<string, any>;
            if (objV.price !== undefined) displayVal = `Price: ${objV.price}`;
            else if (objV.type && objV.top && objV.bottom) displayVal = `${String(objV.type).toUpperCase()} FVG (${Number(objV.bottom).toFixed(2)} - ${Number(objV.top).toFixed(2)})`;
            else displayVal = JSON.stringify(v);
          } else if (typeof v === 'number') {
            displayVal = v.toFixed(2);
          }
          return (
            <div key={k} className="flex flex-col bg-zinc-950/50 p-1.5 rounded-md border border-zinc-800/50 shadow-sm">
              <span className="text-[7px] text-zinc-500 font-medium uppercase tracking-widest">{k.replace(/_/g, ' ')}</span>
              <span className="text-[9px] text-zinc-300 font-mono font-medium truncate mt-[1px]">{displayVal}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredStrategies = useMemo(() => {
    const fullList = getAllStrategiesWithFallback(rawStrategies || []);
    const normalized = fullList.map(normalizeStrategy);
    return normalized.sort((a, b) => {
      const idxA = CANONICAL_ORDER.indexOf(a.id);
      const idxB = CANONICAL_ORDER.indexOf(b.id);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });
  }, [rawStrategies]);

  return (
    <div className="space-y-2.5 h-full pb-10 relative">
      {/* Compact canonical summary bar */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 border-b border-zinc-800/80 pb-2"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[9px] font-bold text-zinc-100 flex items-center gap-2 tracking-wide">
              <div className="p-1 rounded-md bg-zinc-900 border border-zinc-800 shadow-sm">
                <Activity className="w-2.5 h-2.5 text-blue-400" />
              </div>
              STRATEGY SETUP SCAN
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              <p className="text-[7px] text-zinc-500 tracking-wide">Showing exactly the 5 canonical strategies in sequential setup order</p>
              <span className="text-[9px] text-zinc-700">•</span>
              <span className="text-[6px] font-bold text-blue-400 tracking-wider bg-blue-500/10 px-1 py-[2px] rounded-[3px] border border-blue-500/20">{filteredStrategies?.length || 0} CANONICAL STRATEGIES</span>
            </div>
          </div>
          <button 
            onClick={refetch} 
            className="flex items-center gap-1 text-[7px] font-bold tracking-wider text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 px-2 py-1 rounded hover:bg-zinc-800 transition-colors uppercase"
          >
            <RotateCw className="w-2.5 h-2.5" /> Refresh
          </button>
        </div>
      </motion.div>

      {loading ? (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="flex flex-col gap-1.5">
          {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"].map((skKey) => (
            <div key={skKey} className="bg-zinc-900/30 border border-zinc-800/80 rounded-md p-3">
              <div className="flex justify-between items-center mb-2.5">
                 <div className="flex items-center gap-2">
                    <div className="h-4 bg-zinc-800/60 rounded w-32 animate-pulse"></div>
                    <div className="h-4 bg-zinc-800/60 rounded w-16 animate-pulse"></div>
                 </div>
                 <div className="h-4 bg-zinc-800/60 rounded w-6 animate-pulse"></div>
              </div>
              <div className="flex gap-2">
                 <div className="h-3 bg-zinc-800/60 rounded w-12 animate-pulse"></div>
                 <div className="h-3 bg-zinc-800/60 rounded w-16 animate-pulse"></div>
                 <div className="h-3 bg-zinc-800/60 rounded w-14 animate-pulse"></div>
              </div>
              <div className="h-1.5 bg-zinc-800/60 rounded w-full animate-pulse mt-3"></div>
            </div>
          ))}
        </motion.div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-rose-900/40 rounded-2xl bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-10 h-10 text-rose-500/80 mb-5" />
          <p className="text-[13px] font-bold text-rose-400 mb-2 tracking-wide">Connection Error</p>
          <p className="text-[11px] text-zinc-500 max-w-[280px] leading-relaxed mb-6 font-medium">
            Unable to connect to the database or service.
          </p>
          <button
            onClick={refetch}
            className="px-5 py-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[9px] font-bold tracking-wide rounded-xl transition-all shadow-sm active:scale-95"
          >
            Try Again
          </button>
        </motion.div>
      ) : filteredStrategies?.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20 shadow-sm"
        >
          <div className="w-14 h-14 rounded-2xl bg-zinc-900/80 flex items-center justify-center mb-5 border border-zinc-800/80 shadow-sm">
            <Activity className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-[13px] font-bold text-zinc-300 mb-2 tracking-wide">
            No strategies match filter
          </p>
          <p className="text-[11px] text-zinc-500 max-w-[300px] leading-relaxed font-medium">
            Adjust your filters or search term to see more strategies.
          </p>
        </motion.div>
      ) : (
        <motion.div 
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-1.5"
        >
          {filteredStrategies.slice(0, 50).map((strategy) => {
            const setup = buildSetup(strategy);
            const rulesArray = buildRules(strategy);
            const timeline = buildTimeline(strategy);
            const setupStatus = strategy.setupStatus;
            const isCollapsed = collapsed[strategy.id];
            
            // Calculate progress
            const progressInfo = buildProgress(strategy.id, strategy);
            const timeStr = <ClientDate date={strategy.updatedAt} format="toLocaleTimeString" />;

            return (
              <motion.div
                variants={itemVariants}
                key={strategy.id}
                className={`bg-zinc-900/30 border border-zinc-800/80 rounded-md flex flex-col transition-all hover:border-zinc-700/80 hover:bg-zinc-900/60 shadow-sm backdrop-blur-sm ${strategy.status === "stopped" ? "opacity-60 grayscale-[50%]" : ""}`}
              >
                {/* Header (Collapsible) */}
                <div 
                    className="p-2 border-b border-zinc-800/60 flex justify-between items-start cursor-pointer transition-colors group"
                    onClick={() => toggleCollapse(strategy.id)}
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-[8px] font-bold text-zinc-100 flex items-center gap-1 tracking-wide group-hover:text-white transition-colors">
                        {strategy.name || strategy.id}
                        </h3>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[6px] font-bold border uppercase py-[2px] px-1 rounded-[3px] tracking-wider shadow-sm ${getStatusBadge(setupStatus)}`}>
                        {setupStatus}
                        </span>
                        {strategy.freshness && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[6px] font-bold border uppercase py-[2px] px-1 rounded-[3px] tracking-wider shadow-sm ${getStatusBadge(strategy.freshness)}`}>
                            {strategy.freshness}
                            </span>
                        )}
                        {(setup.validationLogSummary && setup.validationLogSummary.toLowerCase().includes('suppressed')) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-bold border border-amber-500/20 text-amber-400 bg-amber-500/10 uppercase tracking-wider shadow-sm">
                            Suppressed
                            </span>
                        )}
                        {strategy.errors && strategy.errors.length > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[7px] font-bold border border-rose-500/20 text-rose-400 bg-rose-500/10 uppercase tracking-wider shadow-sm" title={strategy.errors.join(', ')}>
                            Error
                            </span>
                        )}
                    </div>
                    
                    {/* Mini Status Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[6px] text-zinc-500 font-medium">
                        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-zinc-600" /> TF: <span className="text-zinc-300 font-mono">{setup.timeframe || 'N/A'}</span></span>
                        <span className="flex items-center gap-1"><Timer className="w-2.5 h-2.5 text-zinc-600" /> Session: <span className="text-zinc-300">{setup.session || 'N/A'}</span></span>
                        <span className="flex items-center gap-1">
                            {setup.marketBias === 'buy' ? <TrendingUp className="w-2.5 h-2.5 text-emerald-500" /> : setup.marketBias === 'sell' ? <TrendingDown className="w-2.5 h-2.5 text-rose-500" /> : <Activity className="w-2.5 h-2.5 text-zinc-600" />}
                            Bias: <span className="text-zinc-300 capitalize">{setup.marketBias || setup.bias || 'N/A'}</span>
                        </span>
                        <span className="flex items-center gap-1"><History className="w-2.5 h-2.5 text-zinc-600" /> Updated: <span className="text-zinc-300 font-mono">{timeStr}</span></span>
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-zinc-950/80 rounded-full overflow-hidden border border-zinc-800/80 shadow-inner">
                            <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-700 ease-out relative" style={{ width: `${progressInfo.percentage}%` }}>
                                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                        <span className="text-[8px] text-zinc-400 font-mono font-bold w-6 text-right tracking-wide">{Math.round(progressInfo.percentage)}%</span>
                    </div>

                  </div>
                  
                  <div className="flex items-center pt-1">
                      <div className="p-1 rounded hover:bg-zinc-800 transition-colors">
                        {isCollapsed ? <ChevronDown className="w-2.5 h-2.5 text-zinc-500 group-hover:text-zinc-300" /> : <ChevronUp className="w-2.5 h-2.5 text-zinc-500 group-hover:text-zinc-300" />}
                      </div>
                  </div>
                </div>

                {/* Body Content */}
                <AnimatePresence>
                  {!isCollapsed && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-2 md:p-2.5 flex flex-col lg:flex-row gap-3 flex-1 bg-zinc-950/20">
                          
                          {/* Left Column: Timeline */}
                          <div className="flex flex-col gap-2 w-full lg:w-1/3">
                              {strategy.assumptions_flagged && (
                                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400/90 text-[7px] font-bold p-1.5 rounded-[3px] uppercase tracking-wider shadow-sm flex items-start gap-1">
                                      <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                                      <span>ASUMSI PERLU KONFIRMASI: {strategy.assumptions_flagged}</span>
                                  </div>
                              )}
                              <h4 className="text-[7px] font-bold text-zinc-400 flex items-center gap-1 uppercase tracking-widest">
                                <ListFilter className="w-2.5 h-2.5 text-zinc-500" /> Step Timeline
                              </h4>
                              <TimelineCard steps={timeline} />
                              
                              <h4 className="text-[7px] font-bold text-zinc-400 mt-2 flex items-center gap-1 uppercase tracking-widest">
                                <Crosshair className="w-2.5 h-2.5 text-zinc-500" /> Setup Params
                              </h4>
                              <SetupCard 
                                pair={setup.pair}
                                timeframe={setup.timeframe}
                                bias={setup.marketBias || setup.bias}
                                session={setup.session}
                                direction={setup.direction}
                                atrBuffer={setup.atrBuffer}
                                sweepStatus={setup.sweepStatus}
                                confirmationStatus={setup.confirmationStatus}
                                entry={setup.entry}
                                sl={setup.sl}
                                tp={setup.tp}
                                rr={setup.rr !== 'N/A' ? setup.rr : '--'}
                              />
                          </div>

                          {/* Right Column: Rules & AI */}
                          <div className="flex flex-col gap-2 w-full lg:w-2/3">
                              <div className="flex items-center justify-between">
                                  <h4 className="text-[8px] font-bold text-zinc-400 flex items-center gap-1 uppercase tracking-widest">
                                      <CheckSquare className="w-2.5 h-2.5 text-zinc-500" /> Rule Validations
                                  </h4>
                                  <button 
                                      onClick={() => setDrawerData(strategy)}
                                      className="flex items-center gap-1 text-[8px] font-bold tracking-wide text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-900/50 hover:bg-zinc-800 px-1.5 py-1 rounded border border-zinc-800/80 shadow-sm"
                                  >
                                      <FileSearch className="w-2.5 h-2.5" /> View Evidence
                                  </button>
                              </div>
                              <div className="flex-1 overflow-y-auto max-h-[300px]">
                                  <RuleTable rules={rulesArray} />
                              </div>

                              {/* Validation Engine Result */}
                              {(strategy.aiDecision || setup.confidence || setup.aiConfidence || setup.aiDecision) && (
                                  <div className="flex-shrink-0 mt-2">
                                      <h4 className="text-[8px] font-bold text-zinc-400 mb-1.5 flex items-center gap-1 uppercase tracking-widest">
                                          <Zap className="w-2.5 h-2.5 text-amber-500" /> Validation Engine Result
                                      </h4>
                                      <div className={`p-2.5 rounded-[3px] border shadow-sm ${(strategy.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20' : (strategy.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                                          <div className="flex items-center justify-between mb-1.5">
                                              <span className={`text-[9px] font-black tracking-wider uppercase ${(strategy.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'text-emerald-400' : (strategy.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'text-rose-400' : 'text-blue-400'}`}>
                                                  Engine Result: {strategy.aiDecision || setup.aiDecision || 'PENDING'}
                                              </span>
                                              {(setup.confidence || setup.aiConfidence) && (
                                                  <span className="text-[8px] font-mono font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded shadow-sm">
                                                      Confidence: {setup.confidence || setup.aiConfidence}%
                                                  </span>
                                              )}
                                          </div>
                                          <p className="text-[9px] text-zinc-300 font-medium italic opacity-80">
                                              Validation complete. Check evidence drawer for deep reasoning if rejected.
                                          </p>
                                      </div>
                                  </div>
                              )}
                          </div>
                        </div>
                      </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Detail Drawer */}
      <AnimatePresence>
        {drawerData && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerData(null)}
            >
                <motion.div 
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="w-full max-w-[280px] bg-zinc-950/95 border-l border-zinc-800/80 h-full flex flex-col shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-3 border-b border-zinc-800/80">
                        <h3 className="text-[9px] font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-widest">
                            <FileSearch className="w-3.5 h-3.5 text-zinc-400" />
                            Evidence & Details
                        </h3>
                        <button onClick={() => setDrawerData(null)} className="p-1.5 hover:bg-zinc-800/80 rounded-md transition-colors text-zinc-400 hover:text-zinc-200">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-3 flex-1 overflow-y-auto space-y-3">
                        
                        <div>
                            <h4 className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Strategy Details</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2 space-y-1.5 shadow-sm">
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Name</span>
                                    <span className="text-zinc-200 font-bold tracking-wide">{drawerData.name}</span>
                                </div>
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Signal Key</span>
                                    <span className="text-zinc-300 font-mono font-medium bg-zinc-950 px-1.5 py-[2px] rounded-[3px] border border-zinc-800">{drawerData.signal || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Timeframe</span>
                                    <span className="text-zinc-300 font-mono font-medium">{drawerSetup?.timeframe || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Risk & Target Section */}
                        <div>
                            <h4 className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Risk & Targets</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2 space-y-1.5 shadow-sm">
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Direction</span>
                                    <span className={`font-black tracking-wider uppercase ${drawerSetup?.direction === 'buy' ? 'text-emerald-400' : drawerSetup?.direction === 'sell' ? 'text-rose-400' : 'text-zinc-400'}`}>
                                        {drawerSetup?.direction || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Entry Price</span>
                                    <span className="text-zinc-300 font-mono font-bold tracking-wide">{drawerSetup?.entry !== '--' ? Number(drawerSetup?.entry).toFixed(2) : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Stop Loss</span>
                                    <span className="text-rose-400 font-mono font-bold tracking-wide">{drawerSetup?.sl !== '--' ? Number(drawerSetup?.sl).toFixed(2) : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[8px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Take Profit (TP1)</span>
                                    <span className="text-emerald-400 font-mono font-bold tracking-wide">{drawerSetup?.tp !== '--' ? Number(drawerSetup?.tp).toFixed(2) : 'N/A'}</span>
                                </div>

                            </div>
                        </div>

                        <div>
                            <h4 className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Engine Reasoning</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2.5 shadow-sm">
                                {(drawerData.aiDecision || drawerSetup?.aiDecision) && (
                                    <div className="mb-3 flex flex-wrap items-center gap-2.5 border-b border-zinc-800/80 pb-1.5">
                                        <span className={`text-[10px] font-black tracking-wider uppercase ${(drawerData.aiDecision || drawerSetup?.aiDecision)?.toLowerCase() === 'approved' ? 'text-emerald-400' : (drawerData.aiDecision || drawerSetup?.aiDecision)?.toLowerCase() === 'rejected' ? 'text-rose-400' : 'text-blue-400'}`}>
                                            Engine Result: {drawerData.aiDecision || drawerSetup?.aiDecision}
                                        </span>
                                        {(drawerSetup?.confidence || drawerSetup?.aiConfidence) && (
                                              <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shadow-sm">
                                                  Confidence: {drawerSetup?.confidence || drawerSetup?.aiConfidence}%
                                              </span>
                                        )}
                                    </div>
                                )}
                                {drawerSetup?.aiReasoning ? (
                                    <p className="text-[8px] text-zinc-300 leading-relaxed font-medium italic border-l-[1.5px] border-blue-500/60 pl-2 py-0.5 mt-1.5">
                                        &quot;{drawerSetup?.aiReasoning}&quot;
                                    </p>
                                ) : (
                                    <span className="text-[10px] text-zinc-500 font-medium">No AI reasoning recorded for this state.</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[7px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Rule Evidence Data</h4>
                            <div className="space-y-3">
                                {(drawerRules || []).map((rule: any) => (
                                    <div key={rule.ruleId || rule.id || rule.name} className="bg-zinc-900/40 border border-zinc-800/60 rounded-md p-2 shadow-sm">
                                        <div className="flex justify-between items-center mb-2.5 border-b border-zinc-800/50 pb-1.5">
                                            <span className="text-[9px] font-bold text-zinc-200 tracking-wide">{rule.ruleId}</span>
                                            <span className={`text-[6px] uppercase tracking-wider font-bold shadow-sm ${getStatusBadge(rule.status).split(' ')[0]}`}>{rule.status}</span>
                                        </div>
                                        <div className="mt-1.5">
                                            {renderEvidence(rule.ruleId, rule.evidence)}
                                        </div>
                                    </div>
                                ))}
                                {(drawerRules || []).length === 0 && (
                                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 text-center border-dashed">
                                        <span className="text-[10px] text-zinc-500 font-medium">No evidence data available.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
