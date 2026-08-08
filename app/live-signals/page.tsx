"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { getStatusBadge } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Radio,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  Shield,
  CheckCircle2,
  X,
  RotateCw
} from "lucide-react";

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

export default function LiveSignals() {
  const { data: rawSignals, loading, error, refetch } = useFetch<any[]>("/api/signals/live", []);
  const [selectedSignal, setSelectedSignal] = useState<any>(null);

  // Filter out any completed/closed signals if backend returns them
  const signals = (rawSignals || []).filter(s => {
    const st = (s.status || s.baseStatus || '').toUpperCase();
    return !['CLOSED', 'WIN', 'LOSS', 'FINISHED', 'EXPIRED', 'SL HIT', 'TP3 HIT'].includes(st);
  });

  return (
    <div className="space-y-3 relative h-full pb-10">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between border-b border-zinc-800/80 pb-3"
      >
        <div>
          <h2 className="text-[11px] font-extrabold text-zinc-100 flex items-center gap-2 tracking-wide font-mono uppercase">
            <div className="p-1 rounded-md bg-blue-500/10 border border-blue-500/20 shadow-sm">
              <Radio className="w-3 h-3 text-blue-400" />
            </div>
            LIVE SIGNALS
          </h2>
          <p className="text-[10px] text-zinc-400 tracking-wide font-medium mt-1">Active AI-Validated Signals Engine</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-[10px] font-bold tracking-wider uppercase text-zinc-300 hover:text-white transition-all shadow-sm active:scale-95"
          >
            <RotateCw className="w-3 h-3 text-blue-400" />
            Refresh
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-blue-500 rounded-full animate-spin mb-3 shadow-sm"></div>
          <p className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase">Scanning live signals...</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-rose-900/40 rounded-xl bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-8 h-8 text-rose-500/80 mb-3" />
          <p className="text-[11px] font-bold text-rose-400 mb-1 tracking-wide">
            {error?.message?.includes("Closed") ? "Market Closed" :
             error?.message?.includes("Stale") ? "Data Stale" :
             error?.message?.includes("Offline") ? "Provider Offline" :
             (error?.message?.includes("Supabase") || error?.message?.includes("Database") || error?.message?.includes("Postgres")) ? "Database Down" :
             error?.message?.includes("Redis") ? "Redis Down" :
             error?.message?.includes("AI") ? "AI Validation Failed" :
             "Backend Service Error"}
          </p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed mb-4 font-medium">
            {error?.message || "Unable to connect to trading engine backend service."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-wide rounded-lg transition-all shadow-sm active:scale-95"
          >
            Retry Connection
          </button>
        </motion.div>
      ) : !signals || signals.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/40 shadow-sm backdrop-blur-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-3 border border-zinc-800 relative overflow-hidden">
            <Radio className="w-5 h-5 text-zinc-600 relative z-10" />
          </div>
          <p className="text-[11px] font-bold text-zinc-300 mb-1 tracking-wider uppercase">
            No Active Live Signals
          </p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed font-medium">
            Scanner engine active. Signals will appear when full AI confluence setup is validated.
          </p>
        </motion.div>
      ) : (
        <motion.div 
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {signals.map((signal) => {
            const isBuy = signal.direction === "BUY" || signal.direction === "LONG";
            const rrRatio = signal.entry && signal.sl && signal.tp1 ? 
              Math.abs((signal.tp1 - signal.entry) / (signal.entry - signal.sl)).toFixed(2) : '--';

            return (
              <motion.div
                variants={itemVariants}
                key={signal.id || signal.signalKey || `${signal.pair || 'XAUUSD'}-${signal.strategyName || 'strategy'}-${signal.entry || 'target'}`}
                onClick={() => setSelectedSignal(signal)}
                className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900/70 transition-all group shadow-md backdrop-blur-sm relative overflow-hidden flex flex-col justify-between"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-2 pb-2 border-b border-zinc-800/60">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${isBuy ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                      >
                        {isBuy ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {isBuy ? "BUY" : "SELL"}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-100 font-mono tracking-wide">
                        {signal.pair}
                      </span>
                      {rrRatio !== '--' && (
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          R:R 1:{rrRatio}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 font-medium tracking-wide truncate max-w-[180px]">
                      {signal.strategyName}
                    </p>
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${getStatusBadge(signal.status)}`}>
                      {signal.status}
                    </span>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 font-medium">
                      <Clock className="w-2.5 h-2.5" />
                      {signal.age}
                    </div>
                  </div>
                </div>

                {/* Price Grid */}
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                      Entry Price
                    </div>
                    <div className="text-[10px] font-mono font-bold text-zinc-200">
                      {signal.entry}
                    </div>
                  </div>
                  <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Shield className="w-2.5 h-2.5 text-rose-500/80" /> SL
                    </div>
                    <div className="text-[10px] font-mono font-bold text-rose-400">
                      {signal.sl}
                    </div>
                  </div>
                  <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Target className="w-2.5 h-2.5 text-emerald-500/80" /> TP1
                    </div>
                    <div className="text-[10px] font-mono font-bold text-emerald-400">
                      {signal.tp1}
                    </div>
                  </div>
                </div>

                {(signal.tp2 || signal.tp3) && (
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {signal.tp2 && (
                      <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                          <Target className="w-2.5 h-2.5 text-emerald-500/80" /> TP2
                        </div>
                        <div className="text-[10px] font-mono font-bold text-emerald-400">
                          {signal.tp2}
                        </div>
                      </div>
                    )}
                    {signal.tp3 && (
                      <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                          <Target className="w-2.5 h-2.5 text-emerald-500/80" /> TP3
                        </div>
                        <div className="text-[10px] font-mono font-bold text-emerald-400">
                          {signal.tp3}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Metrics */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-bold tracking-wide text-blue-400 uppercase">
                      AI Verified ({signal.aiChecklist ? signal.aiChecklist.length : 0})
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider shadow-sm ${signal.freshness === 'live' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : signal.freshness === 'cached' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {signal.freshness}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-zinc-500 font-bold uppercase tracking-wider">Live Pips:</span>
                    <span
                      className={`font-mono font-bold ${signal.pips > 0 ? "text-emerald-400" : signal.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                    >
                      {signal.pips > 0 ? "+" : ""}
                      {signal.pips}
                    </span>
                  </div>
                </div>

                {/* TP Progress Bar */}
                <div className="mt-2.5 pt-1.5 border-t border-zinc-800/40">
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-zinc-500 mb-1 uppercase font-mono">
                    <span>Entry</span>
                    <span className={signal.status === 'TP1 HIT' ? 'text-emerald-400 font-bold' : ''}>TP1</span>
                    {signal.tp2 && <span className={signal.status === 'TP2 HIT' ? 'text-emerald-400 font-bold' : ''}>TP2</span>}
                    {signal.tp3 && <span className={signal.status === 'TP3 HIT' ? 'text-emerald-400 font-bold' : ''}>TP3</span>}
                  </div>
                  <div className="h-1.5 bg-zinc-950 rounded-full flex overflow-hidden border border-zinc-800/80 shadow-inner">
                    <div className={`h-full transition-all duration-700 ease-out ${['TP1 HIT', 'TP2 HIT', 'TP3 HIT'].includes(signal.status) ? 'bg-emerald-500 shadow-sm' : 'bg-zinc-700'}`} style={{ width: signal.tp2 ? '33.33%' : signal.tp3 ? '25%' : '100%' }}></div>
                    {signal.tp2 && (
                      <div className={`h-full transition-all duration-700 ease-out ${['TP2 HIT', 'TP3 HIT'].includes(signal.status) ? 'bg-emerald-500 shadow-sm' : 'bg-zinc-800'}`} style={{ width: signal.tp3 ? '25%' : '33.33%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
                    )}
                    {signal.tp3 && (
                      <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-sm' : 'bg-zinc-800'}`} style={{ width: '50%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedSignal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedSignal(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="live-signal-drawer-title"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-[300px] h-full bg-zinc-950/95 border-l border-zinc-800/80 shadow-2xl p-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                <h3 id="live-signal-drawer-title" className="text-[10px] font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider font-mono">
                  <div className="p-1 rounded bg-blue-500/10 border border-blue-500/20 shadow-sm">
                    <Radio className="w-3 h-3 text-blue-400" />
                  </div>
                  Live Signal Details
                </h3>
                <button
                  onClick={() => setSelectedSignal(null)}
                  aria-label="Close signal detail drawer"
                  className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border shadow-sm ${selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {(selectedSignal.direction === "LONG" ? "BUY" : selectedSignal.direction === "SHORT" ? "SELL" : selectedSignal.direction)} {selectedSignal.pair}
                    </span>
                    <span className="text-[10px] font-mono font-medium text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                      {selectedSignal.signalKey}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold tracking-wide text-zinc-100 mb-2">
                    {selectedSignal.strategyName}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-zinc-950/80 p-2 rounded-md border border-zinc-800/60">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                        Created
                      </span>
                      <span className="text-[10px] font-mono font-bold text-zinc-300">
                        {selectedSignal.age}
                      </span>
                    </div>
                    <div className="bg-zinc-950/80 p-2 rounded-md border border-zinc-800/60">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                        Status
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${getStatusBadge(selectedSignal.status)}`}>
                        {selectedSignal.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-zinc-800/60 pt-2.5 mt-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Entry Price</span>
                      <span className="font-mono font-bold text-zinc-200">
                        {selectedSignal.entry}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Stop Loss</span>
                      <span className="font-mono font-bold text-rose-400">
                        {selectedSignal.sl}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Take Profit 1</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {selectedSignal.tp1}
                      </span>
                    </div>
                    {selectedSignal.tp2 && (
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-500 font-medium tracking-wide">Take Profit 2</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp2}
                        </span>
                      </div>
                    )}
                    {selectedSignal.tp3 && (
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-500 font-medium tracking-wide">Take Profit 3</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp3}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    AI Validation Evidence
                  </h4>
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-2.5 space-y-2">
                    
                    {selectedSignal.confidenceScore !== null && (
                      <div className="bg-zinc-950/80 p-2.5 rounded-md border border-zinc-800/60 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AI Confluence Score</span>
                          <span className={`text-sm font-mono font-black tracking-tight ${selectedSignal.confidenceScore >= 80 ? 'text-emerald-400' : selectedSignal.confidenceScore >= 60 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {selectedSignal.confidenceScore}%
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 font-mono">
                        Rule Checklist ({selectedSignal.aiChecklist ? selectedSignal.aiChecklist.length : 0})
                      </span>
                      <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                        {selectedSignal.aiChecklist && selectedSignal.aiChecklist.length > 0 ? (
                          selectedSignal.aiChecklist.map((item: any) => {
                            const itemKey = item.rule || item.id || `${item.status}-${item.reason}`;
                            return (
                              <div key={itemKey} className="bg-zinc-950/80 p-2 rounded-md border border-zinc-800/60 flex flex-col gap-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-zinc-200 font-bold tracking-wide" title={item.rule}>{item.rule}</span>
                                  <span className={`font-mono font-bold ${
                                    item.status === 'PASS' ? 'text-emerald-400' : 
                                    item.status === 'FAIL' ? 'text-rose-400' : 
                                    'text-amber-400'
                                  }`}>
                                    {item.status}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-400 font-medium">
                                  {item.reason}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-[10px] text-zinc-500 font-medium italic text-center py-3 bg-zinc-950/40 rounded border border-zinc-800/40 border-dashed">No checklist available</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 font-mono">
                        AI Reasoning
                      </span>
                      <p className="text-[10px] text-zinc-300 leading-relaxed font-medium italic border-l-2 border-blue-500/80 pl-2 py-1 bg-blue-500/5 rounded-r">
                        &quot;{selectedSignal.aiReasoning || "No reasoning available"}&quot;
                      </p>
                    </div>

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

