"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { getStatusBadge } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Radio,
  ListFilter,
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
    <div className="space-y-6 relative h-full">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between border-b border-white/10 pb-6 mb-6"
      >
        <div>
          <h2 className="text-[14px] font-bold text-white flex items-center gap-2.5 tracking-widest uppercase">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl"></div>
              <Radio className="w-4 h-4 text-blue-400 relative z-10" />
            </div>
            Live Signals
          </h2>
          <p className="text-[11px] text-zinc-400 mt-2.5 tracking-wide font-medium leading-relaxed">
            Active setups validated by AI and currently in play.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-[11px] font-bold tracking-widest uppercase text-zinc-300 hover:text-white transition-all shadow-sm">
            <ListFilter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-5 shadow-sm"></div>
          <p className="text-[12px] text-zinc-500 font-bold tracking-widest uppercase">Scanning for live signals...</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-rose-900/40 rounded-2xl bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-10 h-10 text-rose-500/80 mb-5" />
          <p className="text-[13px] font-bold text-rose-400 mb-2 tracking-wide">Connection Error</p>
          <p className="text-[11px] text-zinc-500 max-w-[280px] leading-relaxed mb-6 font-medium">
            {error || "Unable to connect to the signal database."}
          </p>
          <button
            onClick={refetch}
            className="px-5 py-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-bold tracking-wide rounded-xl transition-all shadow-sm active:scale-95"
          >
            Retry Connection
          </button>
        </motion.div>
      ) : signals.length === 0 ? (
          <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-white/10 rounded-3xl bg-black/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/10 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5 blur-xl"></div>
            <Radio className="w-6 h-6 text-zinc-500 relative z-10" />
          </div>
          <p className="text-[13px] font-bold text-white mb-2 tracking-widest uppercase">
            No Active Signals
          </p>
          <p className="text-[11px] text-zinc-500 max-w-[320px] leading-relaxed font-medium">
            Rule engine is actively scanning the market. Setups must pass all AI validations before appearing here.
          </p>
        </motion.div>
      ) : (
        <motion.div 
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24"
        >
          {signals.map((signal, idx) => (
            <motion.div
              variants={itemVariants}
              key={idx}
              onClick={() => setSelectedSignal(signal)}
              className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 cursor-pointer hover:border-blue-500/30 hover:bg-white/5 transition-all group shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all"></div>
              <div className="flex justify-between items-start mb-6 pb-5 border-b border-white/10 relative z-10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-widest shadow-sm ${signal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {signal.direction === "LONG" ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {signal.direction}
                    </span>
                    <span className="text-[14px] font-bold text-white tracking-wide">
                      {signal.pair}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-medium tracking-wide">
                    {signal.strategyName}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusBadge(signal.status)}`}>
                    {signal.status}
                  </span>
                  <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-zinc-500 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    {signal.age}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-5 relative z-10">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm hover:bg-white/10 transition-colors">
                  <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2">
                    Entry
                  </div>
                  <div className="text-[13px] font-mono font-bold text-white tracking-wide">
                    {signal.entry}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm hover:bg-white/10 transition-colors">
                  <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                    <Shield className="w-3 h-3 text-rose-500/70" /> SL
                  </div>
                  <div className="text-[13px] font-mono font-bold text-rose-400 tracking-wide">
                    {signal.sl}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm hover:bg-white/10 transition-colors">
                  <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                    <Target className="w-3 h-3 text-emerald-500/70" /> TP1
                  </div>
                  <div className="text-[13px] font-mono font-bold text-emerald-400 tracking-wide">
                    {signal.tp1}
                  </div>
                </div>
              </div>

              {(signal.tp2 || signal.tp3) && (
                <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                  {signal.tp2 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm hover:bg-white/10 transition-colors">
                      <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                        <Target className="w-3 h-3 text-emerald-500/70" /> TP2
                      </div>
                      <div className="text-[13px] font-mono font-bold text-emerald-400 tracking-wide">
                        {signal.tp2}
                      </div>
                    </div>
                  )}
                  {signal.tp3 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm hover:bg-white/10 transition-colors">
                      <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                        <Target className="w-3 h-3 text-emerald-500/70" /> TP3
                      </div>
                      <div className="text-[13px] font-mono font-bold text-emerald-400 tracking-wide">
                        {signal.tp3}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-5 border-t border-white/10 relative z-10">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-blue-500 shadow-sm" />
                  <span className="text-[11px] font-bold tracking-wide text-blue-400">
                    AI Verified ({signal.aiChecklist ? signal.aiChecklist.length : 0} Rules)
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border uppercase tracking-widest shadow-sm ${signal.freshness === 'live' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : signal.freshness === 'cached' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-white/5 text-zinc-400 border-white/10'}`}>
                      {signal.freshness}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
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
              <div className="mt-6 pt-5 border-t border-white/10 relative z-10">
                <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-zinc-500 mb-3 uppercase">
                  <span>Entry</span>
                  <span>TP1</span>
                  {signal.tp2 && <span>TP2</span>}
                  {signal.tp3 && <span>TP3</span>}
                </div>
                <div className="h-2.5 bg-black/40 rounded-full flex overflow-hidden border border-white/10 shadow-inner">
                    <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP1 HIT' || signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white/20'}`} style={{ width: signal.tp2 ? '33.33%' : signal.tp3 ? '25%' : '100%' }}></div>
                    {signal.tp2 && (
                        <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP2 HIT' || signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white/20'}`} style={{ width: signal.tp3 ? '25%' : '33.33%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
                    )}
                    {signal.tp3 && (
                        <div className={`h-full transition-all duration-700 ease-out ${signal.status === 'TP3 HIT' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white/20'}`} style={{ width: '50%', borderLeft: '1px solid rgba(255,255,255,0.1)' }}></div>
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
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
            onClick={() => setSelectedSignal(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md h-full bg-black/80 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 overflow-y-auto backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[12px] font-bold text-white flex items-center gap-2.5 uppercase tracking-widest">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 shadow-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/20 blur-xl"></div>
                    <Radio className="w-4 h-4 text-blue-400 relative z-10" />
                  </div>
                  Signal Detail
                </h3>
                <button
                  onClick={() => setSelectedSignal(null)}
                  className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
                  <div className="flex justify-between items-center mb-4 relative z-10">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black tracking-widest uppercase border shadow-sm ${selectedSignal.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedSignal.direction === "LONG" ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {selectedSignal.direction} {selectedSignal.pair}
                    </span>
                    <span className="text-[10px] font-mono font-medium text-zinc-400 bg-black/40 px-2.5 py-1 rounded-lg border border-white/10">
                      {selectedSignal.signalKey}
                    </span>
                  </div>
                  <p className="text-[13px] font-bold tracking-wide text-white mb-6 relative z-10">
                    {selectedSignal.strategyName}
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-5 relative z-10">
                    <div className="bg-black/40 p-4 rounded-xl border border-white/10">
                      <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                        Time Created
                      </span>
                      <span className="text-[12px] font-mono font-bold text-zinc-300">
                        {selectedSignal.age}
                      </span>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/10">
                      <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                        Status
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusBadge(selectedSignal.status)}`}>
                        {selectedSignal.status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-white/10 pt-5 mt-2 relative z-10">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-400 font-medium tracking-wide">Entry Target</span>
                      <span className="font-mono font-bold text-white">
                        {selectedSignal.entry}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-400 font-medium tracking-wide">Stop Loss</span>
                      <span className="font-mono font-bold text-rose-400">
                        {selectedSignal.sl}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-400 font-medium tracking-wide">Take Profit 1</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {selectedSignal.tp1}
                      </span>
                    </div>
                    {selectedSignal.tp2 && (
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-zinc-400 font-medium tracking-wide">Take Profit 2</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp2}
                        </span>
                      </div>
                    )}
                    {selectedSignal.tp3 && (
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-zinc-400 font-medium tracking-wide">Take Profit 3</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {selectedSignal.tp3}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[12px] font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shadow-sm" />
                    AI Validation Evidence
                  </h4>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-sm">
                    
                    {selectedSignal.confidenceScore !== null && (
                      <div className="mb-6 bg-black/40 p-5 rounded-2xl border border-white/10 flex flex-col gap-4 shadow-inner relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
                        <div className="flex items-center justify-between mb-2 border-b border-white/10 pb-4 relative z-10">
                          <span className="text-[11px] font-black text-white uppercase tracking-widest">AI Confidence Score</span>
                          <span className={`text-2xl font-mono font-black tracking-tight ${selectedSignal.confidenceScore >= 80 ? 'text-emerald-400' : selectedSignal.confidenceScore >= 60 ? 'text-blue-400' : 'text-amber-400'}`}>
                            {selectedSignal.confidenceScore}%
                          </span>
                        </div>
                        
                        {selectedSignal.marketConfidence !== undefined && (
                          <div className="flex items-center justify-between text-[11px] relative z-10">
                            <span className="text-zinc-400 font-bold uppercase tracking-widest">Market Confidence</span>
                            <span className={`font-mono font-bold ${selectedSignal.marketConfidence >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.marketConfidence}%
                            </span>
                          </div>
                        )}
                        {selectedSignal.dataQualityScore !== undefined && (
                          <div className="flex items-center justify-between text-[11px] relative z-10">
                            <span className="text-zinc-400 font-bold uppercase tracking-widest">Data Quality Score</span>
                            <span className={`font-mono font-bold ${selectedSignal.dataQualityScore >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.dataQualityScore}%
                            </span>
                          </div>
                        )}
                        {selectedSignal.signalQualityScore !== undefined && (
                          <div className="flex items-center justify-between text-[11px] relative z-10">
                            <span className="text-zinc-400 font-bold uppercase tracking-widest">Signal Quality Score</span>
                            <span className={`font-mono font-bold ${selectedSignal.signalQualityScore >= 80 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {selectedSignal.signalQualityScore}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedSignal.probabilities && (
                      <div className="mb-6 space-y-4 bg-black/40 p-5 rounded-2xl border border-white/10 shadow-inner">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-3">
                          Probabilistic Analysis
                        </span>
                        {Object.entries(selectedSignal.probabilities).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex flex-col gap-2">
                            <div className="flex justify-between text-[11px] font-medium text-white">
                              <span className="capitalize tracking-wide">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="font-mono font-bold">{value}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className={`h-full transition-all duration-1000 ${value >= 70 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : value >= 40 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-zinc-500'}`} 
                                style={{ width: `${value}%` }} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mb-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-4">
                            AI Checklist
                          </span>
                          <div className="flex flex-col gap-3 max-h-[250px] overflow-y-auto pr-3 custom-scrollbar">
                            {selectedSignal.aiChecklist && selectedSignal.aiChecklist.length > 0 ? (
                              selectedSignal.aiChecklist.map((item: any, idx: number) => (
                                <div key={idx} className="flex flex-col gap-2 pb-4 mb-4 border-b border-white/5 last:border-0 last:pb-0 last:mb-0">
                                  <div className="flex items-center justify-between text-[12px]">
                                    <span className="text-white font-bold tracking-wide" title={item.rule}>{item.rule}</span>
                                    <span className={`font-black tracking-widest shadow-sm ${
                                      item.status === 'PASS' ? 'text-emerald-400' : 
                                      item.status === 'FAIL' ? 'text-rose-400' : 
                                      'text-amber-400'
                                    }`}>
                                      {item.status}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-zinc-400 font-medium">
                                    <span className="text-zinc-500 uppercase tracking-widest text-[9px] mr-1">Reason:</span> {item.reason}
                                  </div>
                                  {item.details && (
                                    <div className="text-[11px] text-zinc-400 mt-2 font-medium bg-black/40 p-3 rounded-xl border border-white/5">
                                      <span className="text-zinc-500 uppercase tracking-widest text-[9px] block mb-1">Details:</span> {item.details}
                                    </div>
                                  )}
                                  {(item.rulesExamined && item.rulesExamined.length > 0) && (
                                    <div className="text-[11px] text-zinc-400 mt-2 font-medium">
                                      <span className="text-zinc-500 uppercase tracking-widest text-[9px] mr-1">Rules Examined:</span> {item.rulesExamined.join(', ')}
                                    </div>
                                  )}
                                  {(item.rulesFailed && item.rulesFailed.length > 0) && (
                                    <div className="text-[11px] text-rose-400 mt-2 font-medium bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                                      <span className="text-rose-500 uppercase tracking-widest text-[9px] mr-1">Failed:</span> {item.rulesFailed.join(', ')}
                                    </div>
                                  )}
                                  {(item.rulesPassed && item.rulesPassed.length > 0) && (
                                    <div className="text-[11px] text-emerald-400 mt-2 font-medium bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                                      <span className="text-emerald-500 uppercase tracking-widest text-[9px] mr-1">Passed:</span> {item.rulesPassed.join(', ')}
                                    </div>
                                  )}
                                  {item.evidence && (
                                    <div className="text-[10px] text-zinc-400 font-mono font-medium mt-3 bg-black/60 p-3 rounded-xl border border-white/10 break-words shadow-inner overflow-x-auto custom-scrollbar">
                                      {typeof item.evidence === 'object' ? JSON.stringify(item.evidence, null, 2) : String(item.evidence)}
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-[11px] text-zinc-500 font-medium italic text-center py-6 bg-black/20 rounded-2xl border border-white/5 border-dashed">No checklist data</div>
                            )}
                          </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-3">
                        AI Reasoning
                      </span>
                      <p className="text-[12px] text-zinc-300 leading-relaxed font-medium italic border-l-2 border-blue-500 pl-4 py-2 bg-gradient-to-r from-blue-500/10 to-transparent">
                        &quot;{selectedSignal.aiReasoning || "Not Available"}&quot;
                      </p>
                      
                      {selectedSignal.aiEvidence && (
                        <div className="mt-5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-3">
                            Market Evidence
                          </span>
                          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium bg-black/40 p-4 rounded-xl border border-white/10 shadow-inner">
                            {selectedSignal.aiEvidence}
                          </p>
                        </div>
                      )}

                      {selectedSignal.aiConflicts && (
                        <div className="mt-5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 block mb-3">
                            Detected Conflicts
                          </span>
                          <p className="text-[11px] text-amber-400 leading-relaxed font-medium bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 shadow-inner">
                            {selectedSignal.aiConflicts}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[12px] font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    Event History
                  </h4>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-sm border-dashed">
                      <p className="text-[12px] text-zinc-500 font-bold uppercase tracking-widest text-center py-6">
                          No event history
                      </p>
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
