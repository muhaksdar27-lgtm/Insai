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
  const { data: signals, loading, error, refetch } = useFetch<any[]>("/api/signals/live", []);
  const [selectedSignal, setSelectedSignal] = useState<any>(null);

  return (
    <div className="space-y-2.5 relative h-full">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between border-b border-white/10 pb-2 mb-2"
      >
        <div>
          <h2 className="text-[8px] font-bold text-zinc-200 flex items-center gap-2 tracking-widest uppercase">
            <div className="p-1 rounded bg-blue-500/10 border border-blue-500/20 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl"></div>
              <Radio className="w-2.5 h-2.5 text-blue-400 relative z-10" />
            </div>
            Live Signals
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded text-[7px] font-bold tracking-widest uppercase text-zinc-300 hover:text-white transition-all shadow-sm"
          >
            <Radio className="w-2.5 h-2.5 text-blue-400" />
            Refresh Signals
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-5 h-5 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-3 shadow-sm"></div>
          <p className="text-[9px] text-zinc-500 font-bold tracking-widest uppercase">Scanning live signals...</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-rose-900/40 rounded-lg bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-6 h-6 text-rose-500/80 mb-2" />
          <p className="text-[10px] font-bold text-rose-400 mb-1 tracking-wide">Connection Error</p>
          <p className="text-[6px] text-zinc-500 max-w-[240px] leading-relaxed mb-2.5 font-medium">
            {error?.message || "Unable to connect."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[8px] font-bold tracking-wide rounded transition-all shadow-sm"
          >
            Retry Connection
          </button>
        </motion.div>
      ) : !signals || signals.length === 0 ? (
          <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/10 rounded-lg bg-white/5 shadow-sm backdrop-blur-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-3 border border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5 blur-xl"></div>
            <Radio className="w-4 h-4 text-zinc-600 relative z-10" />
          </div>
          <p className="text-[10px] font-bold text-zinc-400 mb-1 tracking-widest uppercase">
            No Active Signals
          </p>
          <p className="text-[6px] text-zinc-500 max-w-[240px] leading-relaxed font-medium">
            Waiting for AI validated setups.
          </p>
        </motion.div>
      ) : (
        <motion.div 
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-2 pb-10"
        >
          {signals.map((signal) => (
            <motion.div
              variants={itemVariants}
              key={signal.id || signal.signalKey || `${signal.pair || 'XAUUSD'}-${signal.strategyName || 'strategy'}-${signal.entry || 'target'}`}
              onClick={() => setSelectedSignal(signal)}
              className="bg-white/5 border border-white/10 rounded-md p-1.5 cursor-pointer hover:border-blue-500/30 hover:bg-white/10 transition-all group shadow-sm backdrop-blur-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
              <div className="flex justify-between items-start mb-1.5 pb-1 border-b border-white/10 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[6px] font-bold border uppercase tracking-widest ${signal.direction === "BUY" || signal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {signal.direction === "BUY" || signal.direction === "LONG" ? (
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      ) : (
                        <ArrowDownRight className="w-2.5 h-2.5" />
                      )}
                      {signal.direction === "LONG" ? "BUY" : signal.direction === "SHORT" ? "SELL" : signal.direction}
                    </span>
                    <span className="text-[8px] font-bold text-zinc-100 tracking-wide">
                      {signal.pair}
                    </span>
                  </div>
                  <p className="text-[6px] text-zinc-500 font-medium tracking-wide">
                    {signal.strategyName}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[6px] font-bold uppercase tracking-widest border shadow-sm ${getStatusBadge(signal.status)}`}>
                    {signal.status}
                  </span>
                  <div className="mt-1.5 flex items-center justify-end gap-1 text-[6px] text-zinc-500 font-bold">
                    <Clock className="w-2.5 h-2.5" />
                    {signal.age}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 mb-1 relative z-10">
                <div className="bg-black/40 border border-white/10 rounded-[3px] p-1 text-center shadow-inner">
                  <div className="text-[5px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">
                    Entry
                  </div>
                  <div className="text-[7px] font-mono font-bold text-zinc-300 tracking-wide">
                    {signal.entry}
                  </div>
                </div>
                <div className="bg-black/40 border border-white/10 rounded-[3px] p-1 text-center shadow-inner">
                  <div className="text-[5px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                    <Shield className="w-2 h-2 text-rose-500/70" /> SL
                  </div>
                  <div className="text-[8px] font-mono font-bold text-rose-400 tracking-wide">
                    {signal.sl}
                  </div>
                </div>
                <div className="bg-black/40 border border-white/10 rounded-[3px] p-1 text-center shadow-inner">
                  <div className="text-[5px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                    <Target className="w-2 h-2 text-emerald-500/70" /> TP1
                  </div>
                  <div className="text-[8px] font-mono font-bold text-emerald-400 tracking-wide">
                    {signal.tp1}
                  </div>
                </div>
              </div>

              {(signal.tp2 || signal.tp3) && (
                <div className="grid grid-cols-2 gap-1 mb-1 relative z-10">
                  {signal.tp2 && (
                    <div className="bg-black/40 border border-white/10 rounded-[3px] p-1 text-center shadow-inner">
                      <div className="text-[5px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                        <Target className="w-2 h-2 text-emerald-500/70" /> TP2
                      </div>
                      <div className="text-[8px] font-mono font-bold text-emerald-400 tracking-wide">
                        {signal.tp2}
                      </div>
                    </div>
                  )}
                  {signal.tp3 && (
                    <div className="bg-black/40 border border-white/10 rounded-[3px] p-1 text-center shadow-inner">
                      <div className="text-[5px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                        <Target className="w-2 h-2 text-emerald-500/70" /> TP3
                      </div>
                      <div className="text-[8px] font-mono font-bold text-emerald-400 tracking-wide">
                        {signal.tp3}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-white/10 relative z-10">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-blue-500 shadow-sm" />
                  <span className="text-[6px] font-bold tracking-wide text-blue-400 uppercase">
                    AI Verified ({signal.aiChecklist ? signal.aiChecklist.length : 0})
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[6px] font-bold border uppercase tracking-widest shadow-sm ${signal.freshness === 'live' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : signal.freshness === 'cached' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-white/5 text-zinc-400 border-white/10'}`}>
                      {signal.freshness}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[6px]">
                  <span className="text-zinc-500 font-bold uppercase tracking-widest">Pips:</span>
                  <span
                    className={`font-mono font-black ${signal.pips > 0 ? "text-emerald-400" : signal.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                  >
                    {signal.pips > 0 ? "+" : ""}
                    {signal.pips}
                  </span>
                </div>
              </div>

              {/* TP Progress Indicator */}
              <div className="mt-2 pt-2 border-t border-white/10 relative z-10">
                <div className="flex items-center justify-between text-[4px] font-bold tracking-widest text-zinc-500 mb-1 uppercase">
                  <span>Entry</span>
                  <span>TP1</span>
                  {signal.tp2 && <span>TP2</span>}
                  {signal.tp3 && <span>TP3</span>}
                </div>
                <div className="h-1 bg-black/40 rounded-full flex overflow-hidden border border-white/10 shadow-inner">
                    <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP1 HIT' || signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-sm' : 'bg-white/20'}`} style={{ width: signal.tp2 ? '33.33%' : signal.tp3 ? '25%' : '100%' }}></div>
                    {signal.tp2 && (
                        <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-sm' : 'bg-white/20'}`} style={{ width: signal.tp3 ? '25%' : '33.33%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
                    )}
                    {signal.tp3 && (
                        <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-sm' : 'bg-white/20'}`} style={{ width: '50%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
                    )}
                </div>
              </div>

            </motion.div>
          ))}
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
              className="w-full max-w-[240px] h-full bg-zinc-950/90 border-l border-white/10 shadow-2xl p-3 overflow-y-auto backdrop-blur-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2.5">
                <h3 id="live-signal-drawer-title" className="text-[8px] font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-widest">
                  <div className="p-1 rounded bg-blue-500/10 border border-blue-500/20 shadow-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/20 blur-xl"></div>
                    <Radio className="w-2.5 h-2.5 text-blue-400 relative z-10" />
                  </div>
                  Signal Detail
                </h3>
                <button
                  onClick={() => setSelectedSignal(null)}
                  aria-label="Close signal detail drawer"
                  className="p-1 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-6 -mr-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl"></div>
                  <div className="flex justify-between items-center mb-1 relative z-10">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[6px] font-bold tracking-widest uppercase border shadow-sm ${selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" ? (
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      ) : (
                        <ArrowDownRight className="w-2.5 h-2.5" />
                      )}
                      {(selectedSignal.direction === "LONG" ? "BUY" : selectedSignal.direction === "SHORT" ? "SELL" : selectedSignal.direction)} {selectedSignal.pair}
                    </span>
                    <span className="text-[6px] font-mono font-bold text-zinc-500 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                      {selectedSignal.signalKey}
                    </span>
                  </div>
                  <p className="text-[8px] font-bold tracking-wide text-white mb-2 relative z-10">
                    {selectedSignal.strategyName}
                  </p>

                  <div className="grid grid-cols-2 gap-1 mb-1 relative z-10">
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/10">
                      <span className="block text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                        Time Created
                      </span>
                      <span className="text-[7px] font-mono font-bold text-zinc-300">
                        {selectedSignal.age}
                      </span>
                    </div>
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/10">
                      <span className="block text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                        Status
                      </span>
                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[4px] font-bold uppercase tracking-widest border shadow-sm ${getStatusBadge(selectedSignal.status)}`}>
                        {selectedSignal.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-white/10 pt-2 mt-2 relative z-10">
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Entry Target</span>
                      <span className="font-mono font-bold text-white">
                        {selectedSignal.entry}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Stop Loss</span>
                      <span className="font-mono font-bold text-rose-400">
                        {selectedSignal.sl}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-zinc-500 font-medium tracking-wide">Take Profit 1</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {selectedSignal.tp1}
                      </span>
                    </div>
                    {selectedSignal.tp2 && (
                      <div className="flex justify-between items-center text-[8px]">
                        <span className="text-zinc-500 font-medium tracking-wide">Take Profit 2</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp2}
                        </span>
                      </div>
                    )}
                    {selectedSignal.tp3 && (
                      <div className="flex justify-between items-center text-[8px]">
                        <span className="text-zinc-500 font-medium tracking-wide">Take Profit 3</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp3}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[7px] font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5 uppercase tracking-widest">
                    <CheckCircle2 className="w-3 h-3 text-blue-500 shadow-sm" />
                    AI Validation Evidence
                  </h4>
                  <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm">
                    
                    {selectedSignal.confidenceScore !== null && (
                      <div className="mb-2 bg-black/40 p-2 rounded-lg border border-white/10 flex flex-col gap-1.5 shadow-inner relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl"></div>
                        <div className="flex items-center justify-between mb-0.5 border-b border-white/10 pb-1.5 relative z-10">
                          <span className="text-[6px] font-bold text-zinc-300 uppercase tracking-widest">AI Confidence</span>
                          <span className={`text-sm font-mono font-black tracking-tight ${selectedSignal.confidenceScore >= 80 ? 'text-emerald-400' : selectedSignal.confidenceScore >= 60 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {selectedSignal.confidenceScore}%
                          </span>
                        </div>
                        
                        {selectedSignal.marketConfidence !== undefined && (
                          <div className="flex items-center justify-between text-[6px] relative z-10">
                            <span className="text-zinc-500 font-bold uppercase tracking-widest">Market Confidence</span>
                            <span className={`font-mono font-bold ${selectedSignal.marketConfidence >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.marketConfidence}%
                            </span>
                          </div>
                        )}
                        {selectedSignal.dataQualityScore !== undefined && (
                          <div className="flex items-center justify-between text-[6px] relative z-10">
                            <span className="text-zinc-500 font-bold uppercase tracking-widest">Data Quality</span>
                            <span className={`font-mono font-bold ${selectedSignal.dataQualityScore >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.dataQualityScore}%
                            </span>
                          </div>
                        )}
                        {selectedSignal.signalQualityScore !== undefined && (
                          <div className="flex items-center justify-between text-[6px] relative z-10">
                            <span className="text-zinc-500 font-bold uppercase tracking-widest">Signal Quality</span>
                            <span className={`font-mono font-bold ${selectedSignal.signalQualityScore >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.signalQualityScore}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedSignal.probabilities && (
                      <div className="mb-3 space-y-2 bg-black/40 p-3 rounded-lg border border-white/10 shadow-inner">
                        <span className="text-[6px] font-bold uppercase tracking-widest text-zinc-600 block mb-1.5">
                          Probabilities
                        </span>
                        {Object.entries(selectedSignal.probabilities).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex flex-col gap-1">
                            <div className="flex justify-between text-[6px] font-bold text-zinc-300">
                              <span className="capitalize tracking-wide">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="font-mono font-bold">{value}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className={`h-full transition-all duration-1000 ${value >= 70 ? 'bg-emerald-500 shadow-sm' : value >= 40 ? 'bg-blue-500 shadow-sm' : 'bg-zinc-500'}`} 
                                style={{ width: `${value}%` }} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mb-3">
                      <span className="text-[6px] font-bold uppercase tracking-widest text-zinc-600 block mb-2">
                            Checklist
                          </span>
                          <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1.5 custom-scrollbar">
                            {selectedSignal.aiChecklist && selectedSignal.aiChecklist.length > 0 ? (
                              selectedSignal.aiChecklist.map((item: any) => {
                                const itemKey = item.rule || item.id || `${item.status}-${item.reason}`;
                                return (
                                  <div key={itemKey} className="flex flex-col gap-1 pb-2 mb-2 border-b border-white/5 last:border-0 last:pb-0 last:mb-0">
                                    <div className="flex items-center justify-between text-[8px]">
                                      <span className="text-zinc-200 font-bold tracking-wide" title={item.rule}>{item.rule}</span>
                                      <span className={`font-black tracking-widest shadow-sm ${
                                        item.status === 'PASS' ? 'text-emerald-400' : 
                                        item.status === 'FAIL' ? 'text-rose-400' : 
                                        'text-amber-400'
                                      }`}>
                                        {item.status}
                                      </span>
                                    </div>
                                    <div className="text-[6px] text-zinc-500 font-medium">
                                      <span className="text-zinc-600 uppercase tracking-widest text-[6px] mr-1">Reason:</span> {item.reason}
                                    </div>
                                    {item.details && (
                                      <div className="text-[6px] text-zinc-500 mt-1 font-medium bg-black/40 p-1.5 rounded border border-white/5">
                                        <span className="text-zinc-600 uppercase tracking-widest text-[6px] block mb-0.5">Details:</span> {item.details}
                                      </div>
                                    )}
                                    {(item.rulesExamined && item.rulesExamined.length > 0) && (
                                      <div className="text-[6px] text-zinc-500 mt-1 font-medium">
                                        <span className="text-zinc-600 uppercase tracking-widest text-[6px] mr-1">Examined:</span> {item.rulesExamined.join(', ')}
                                      </div>
                                    )}
                                    {(item.rulesFailed && item.rulesFailed.length > 0) && (
                                      <div className="text-[6px] text-rose-400 mt-1 font-medium bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                                        <span className="text-rose-500 uppercase tracking-widest text-[6px] mr-1">Failed:</span> {item.rulesFailed.join(', ')}
                                      </div>
                                    )}
                                    {(item.rulesPassed && item.rulesPassed.length > 0) && (
                                      <div className="text-[6px] text-emerald-400 mt-1 font-medium bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20">
                                        <span className="text-emerald-500 uppercase tracking-widest text-[6px] mr-1">Passed:</span> {item.rulesPassed.join(', ')}
                                      </div>
                                    )}
                                    {item.evidence && (
                                      <div className="text-[6px] text-zinc-500 font-mono font-medium mt-1.5 bg-black/60 p-1.5 rounded border border-white/10 break-words shadow-inner overflow-x-auto custom-scrollbar">
                                        {typeof item.evidence === 'object' ? JSON.stringify(item.evidence, null, 2) : String(item.evidence)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-[6px] text-zinc-500 font-medium italic text-center py-3 bg-black/20 rounded border border-white/5 border-dashed">No checklist</div>
                            )}
                          </div>
                    </div>
                    <div>
                      <span className="text-[6px] font-bold uppercase tracking-widest text-zinc-600 block mb-1.5">
                        AI Reasoning
                      </span>
                      <p className="text-[8px] text-zinc-400 leading-relaxed font-medium italic border-l-2 border-blue-500 pl-2 py-1 bg-gradient-to-r from-blue-500/10 to-transparent">
                        &quot;{selectedSignal.aiReasoning || "Not Available"}&quot;
                      </p>
                      
                      {selectedSignal.aiEvidence && (
                        <div className="mt-3">
                          <span className="text-[6px] font-bold uppercase tracking-widest text-zinc-600 block mb-1.5">
                            Evidence
                          </span>
                          <p className="text-[8px] text-zinc-400 leading-relaxed font-medium bg-black/40 p-2 rounded border border-white/10 shadow-inner">
                            {selectedSignal.aiEvidence}
                          </p>
                        </div>
                      )}

                      {selectedSignal.aiConflicts && (
                        <div className="mt-3">
                          <span className="text-[6px] font-bold uppercase tracking-widest text-amber-500 block mb-1.5">
                            Conflicts
                          </span>
                          <p className="text-[8px] text-amber-400 leading-relaxed font-medium bg-amber-500/10 p-2 rounded border border-amber-500/20 shadow-inner">
                            {selectedSignal.aiConflicts}
                          </p>
                        </div>
                      )}
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
