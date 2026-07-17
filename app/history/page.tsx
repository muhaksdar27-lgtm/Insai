"use client";

import { useState, useMemo, useEffect } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { motion, AnimatePresence } from "motion/react";
import {
  History as HistoryIcon,
  Target,
  Shield,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ListFilter,
  X,
  Search,
  Activity,
  CheckCircle2,
  XCircle,
  BarChart2
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

export default function History() {
  const { data: history, loading, error, refetch } = useFetch<any[]>("/api/signals/history", []);
  
  const [selectedHistory, setSelectedHistory] = useState<any>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTimestamp(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Derived stats
  const { filteredHistory, summary, strategyRanking, uniqueStrategies } = useMemo(() => {
    const safeHistoryArr = Array.isArray(history) ? history : [];
    if (!safeHistoryArr.length) return { filteredHistory: [], summary: { win: 0, loss: 0, totalPips: 0, winRate: 0 }, strategyRanking: [], uniqueStrategies: [], safeHistory: [] };
    
    let timeFiltered = safeHistoryArr;
    if (timeframeFilter !== "ALL") {
      const now = nowTimestamp;
      const msPerDay = 24 * 60 * 60 * 1000;
      let limit = 0;
      if (timeframeFilter === "TODAY") limit = now - msPerDay;
      else if (timeframeFilter === "WEEK") limit = now - 7 * msPerDay;
      else if (timeframeFilter === "MONTH") limit = now - 30 * msPerDay;
      timeFiltered = timeFiltered.filter(h => (h.closedAtTimestamp || 0) >= limit);
    }

    let filtered = timeFiltered;
    if (filter === "WIN") filtered = filtered.filter(h => h.outcome === "WIN");
    if (filter === "LOSS") filtered = filtered.filter(h => h.outcome === "LOSS");
    if (strategyFilter !== "ALL") filtered = filtered.filter(h => h.strategyName === strategyFilter);
    if (search) filtered = filtered.filter(h => h.pair?.toLowerCase().includes(search.toLowerCase()) || h.strategyName?.toLowerCase().includes(search.toLowerCase()));

    const wins = filtered.filter(h => h.outcome === "WIN").length;
    const losses = filtered.filter(h => h.outcome === "LOSS").length;
    const totalPips = filtered.reduce((acc, h) => acc + (Number(h.pips) || 0), 0);
    const winRate = filtered.length > 0 ? Math.round((wins / (wins + losses || 1)) * 100) : 0;

    // Strategy ranking based on timeFiltered
    const stratMap: Record<string, { name: string, wins: number, total: number, pips: number }> = {};
    timeFiltered.forEach(h => {
      if (!stratMap[h.strategyName]) stratMap[h.strategyName] = { name: h.strategyName, wins: 0, total: 0, pips: 0 };
      stratMap[h.strategyName].total += 1;
      if (h.outcome === "WIN") stratMap[h.strategyName].wins += 1;
      stratMap[h.strategyName].pips += (Number(h.pips) || 0);
    });

    const ranking = Object.values(stratMap)
      .map(s => ({ ...s, winRate: Math.round((s.wins / (s.total || 1)) * 100) }))
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    return { 
      filteredHistory: filtered, 
      summary: { win: wins, loss: losses, totalPips: Math.round(totalPips * 10) / 10, winRate },
      strategyRanking: ranking,
      uniqueStrategies: Object.keys(stratMap),
      safeHistory: safeHistoryArr
    };
  }, [history, filter, strategyFilter, timeframeFilter, nowTimestamp, search]);

  return (
    <div className="space-y-8 h-full pb-20 relative">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-5 border-b border-white/10 pb-6 mb-6"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
            <h2 className="text-[14px] font-bold text-white flex items-center gap-2.5 tracking-widest uppercase">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                  <HistoryIcon className="w-4 h-4 text-zinc-300 relative z-10" />
                </div>
                Portfolio History
            </h2>
            <div className="flex items-center gap-2 mt-2.5">
                <p className="text-[11px] text-zinc-400 tracking-wide font-medium">Arsip outcome, pips, dan evaluasi</p>
                {!loading && history && (
                    <>
                        <span className="text-[11px] text-zinc-600">•</span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-widest shadow-sm">
                        Synced
                        </span>
                    </>
                )}
            </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 min-h-[40px] shadow-sm focus-within:border-white/30 focus-within:bg-white/10 transition-colors">
                    <Search className="w-4 h-4 text-zinc-400" />
                    <input 
                      type="text" 
                      placeholder="Search history..." 
                      className="bg-transparent border-none outline-none text-[11px] font-medium text-white w-32 md:w-48 placeholder:text-zinc-500 focus:ring-0 tracking-wide"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-[11px] font-bold tracking-widest uppercase transition-colors shadow-sm min-h-[40px] ${showFilters ? 'bg-white/20 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20'}`}
                >
                    <ListFilter className="w-3.5 h-3.5" />
                    Filters
                </button>
            </div>
        </div>

        <AnimatePresence>
            {showFilters && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                >
                    <div className="flex flex-wrap gap-3 pt-2">
                    <select 
                        value={timeframeFilter} 
                        onChange={(e) => setTimeframeFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold tracking-wide rounded-xl px-4 py-2.5 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[40px] shadow-sm appearance-none"
                    >
                        <option value="ALL">All Time</option>
                        <option value="TODAY">Last 24 Hours</option>
                        <option value="WEEK">Last 7 Days</option>
                        <option value="MONTH">Last 30 Days</option>
                    </select>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold tracking-wide rounded-xl px-4 py-2.5 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[40px] shadow-sm appearance-none"
                    >
                        <option value="ALL">All Outcomes</option>
                        <option value="WIN">Wins Only</option>
                        <option value="LOSS">Losses Only</option>
                    </select>
                    <select 
                        value={strategyFilter} 
                        onChange={(e) => setStrategyFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold tracking-wide rounded-xl px-4 py-2.5 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[40px] shadow-sm max-w-full sm:max-w-[250px] truncate appearance-none"
                    >
                        <option value="ALL">All Strategies</option>
                        {uniqueStrategies.map(strat => (
                        <option key={strat} value={strat}>{strat}</option>
                        ))}
                    </select>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin mb-5 shadow-sm"></div>
          <p className="text-[12px] text-zinc-500 font-bold tracking-widest uppercase">Loading history...</p>
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
            Unable to connect to the database or service.
          </p>
          <button
            onClick={refetch}
            className="px-5 py-2.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-bold tracking-wide rounded-xl transition-all shadow-sm active:scale-95"
          >
            Try Again
          </button>
        </motion.div>
      ) : history.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20 shadow-sm"
        >
          <div className="w-14 h-14 rounded-2xl bg-zinc-900/80 flex items-center justify-center mb-5 border border-zinc-800/80 shadow-sm">
            <HistoryIcon className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-[13px] font-bold text-zinc-300 mb-2 tracking-wide">No Trade History</p>
          <p className="text-[11px] text-zinc-500 max-w-[300px] leading-relaxed font-medium">
            Completed or closed signals will appear here for evaluation.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8 pb-20">
          
          {/* Summary Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Win Rate</span>
              <span className="text-2xl font-black text-white tracking-tight">{summary.winRate}%</span>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Total Pips</span>
              <span className={`text-2xl font-black font-mono tracking-tight ${summary.totalPips > 0 ? "text-emerald-400" : summary.totalPips < 0 ? "text-rose-400" : "text-white"}`}>
                {summary.totalPips > 0 ? "+" : ""}{summary.totalPips}
              </span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Wins</span>
              <span className="text-2xl font-black text-emerald-400 tracking-tight">{summary.win}</span>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 flex flex-col items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
              <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Losses</span>
              <span className="text-2xl font-black text-rose-400 tracking-tight">{summary.loss}</span>
            </div>
          </motion.div>

          {/* Strategy Ranking */}
          {strategyRanking.length > 0 && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl"
            >
              <h3 className="text-[12px] font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Performance By Strategy
              </h3>
              <div className="space-y-4">
                {strategyRanking.map((strat, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-5 text-[11px] hover:bg-white/10 transition-colors shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                    <span className="text-white font-bold tracking-wide truncate pr-4 flex-1 text-[13px] relative z-10">
                      {idx + 1}. {strat.name}
                    </span>
                    <div className="flex items-center gap-5 shrink-0 relative z-10">
                      <span className="text-zinc-400 font-medium w-16 text-right uppercase tracking-widest text-[9px]">{strat.wins}/{strat.total} Won</span>
                      <div className="w-16 text-right">
                        <span className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-widest ${strat.winRate >= 50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{strat.winRate}%</span>
                      </div>
                      <span className={`w-14 text-right font-mono font-bold text-[13px] ${strat.pips > 0 ? 'text-emerald-400' : strat.pips < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {strat.pips > 0 ? '+' : ''}{strat.pips}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="space-y-6">
            <h3 className="text-[12px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <HistoryIcon className="w-4 h-4 text-blue-400" />
              Trade History Log
            </h3>
            {filteredHistory.length === 0 ? (
               <div className="text-center py-16 text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-3xl bg-black/40 shadow-sm backdrop-blur-2xl">
                 <p className="font-bold text-zinc-400 mb-2 tracking-widest uppercase">No Matches Found</p>
                 <p className="font-medium">Adjust your filters or search to see more results.</p>
               </div>
            ) : (
              <motion.div 
                variants={listVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-5"
              >
                {filteredHistory.slice(0, 100).map((item, idx) => (
                  <motion.div
                    variants={itemVariants}
                    key={idx}
                    onClick={() => setSelectedHistory(item)}
                    className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 cursor-pointer hover:border-blue-500/30 hover:bg-white/5 transition-all group shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all"></div>
                    <div className="flex justify-between items-start mb-5 relative z-10">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm ${item.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                          >
                            {item.direction === "LONG" ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {item.direction}
                          </span>
                          <span className="text-[14px] font-bold text-white tracking-wide">
                            {item.pair}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 font-medium line-clamp-1 tracking-wide">
                          {item.strategyName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${item.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : item.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                        >
                          {item.outcome === "WIN" ? (
                            <Target className="w-3.5 h-3.5" />
                          ) : item.outcome === "LOSS" ? (
                            <Shield className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {item.outcome === "WIN"
                            ? "Take Profit"
                            : item.outcome === "LOSS"
                              ? "Stop Loss"
                              : "Closed"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-5 border-t border-white/10 text-[11px] relative z-10">
                      <div className="flex items-center gap-2 text-zinc-500 font-mono font-medium">
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        {item.closedAt}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-zinc-500 font-bold tracking-widest uppercase text-[9px]">Net Pips:</span>
                        <span
                          className={`font-mono font-black text-[13px] ${item.pips > 0 ? "text-emerald-400" : item.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                        >
                          {item.pips > 0 ? "+" : ""}
                          {item.pips}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
            onClick={() => setSelectedHistory(null)}
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
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                      <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                      <HistoryIcon className="w-4 h-4 text-zinc-300 relative z-10" />
                  </div>
                  Trade Record
                </h3>
                <button
                  onClick={() => setSelectedHistory(null)}
                  className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                  <div className="flex justify-between items-center mb-4 relative z-10">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black tracking-widest uppercase border shadow-sm ${selectedHistory.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedHistory.direction === "LONG" ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {selectedHistory.direction} {selectedHistory.pair}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm ${selectedHistory.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : selectedHistory.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                    >
                      {selectedHistory.outcome}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-zinc-400 bg-black/40 px-2.5 py-1 rounded-lg border border-white/10 block w-fit mb-3 relative z-10">
                    {selectedHistory.signalKey}
                  </span>
                  <p className="text-[13px] font-bold tracking-wide text-white relative z-10">
                    {selectedHistory.strategyName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                  <div className="bg-black/40 p-4 rounded-xl border border-white/10">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                      Time Closed
                    </span>
                    <span className="text-[12px] font-mono font-bold text-white">
                      {selectedHistory.closedAt}
                    </span>
                  </div>
                  <div className="bg-black/40 p-4 rounded-xl border border-white/10">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                      Duration
                    </span>
                    <span className="text-[12px] text-white font-mono font-bold">
                      {selectedHistory.duration || '-'}
                    </span>
                  </div>
                  <div className="col-span-2 bg-black/40 p-4 rounded-xl border border-white/10">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                      Final Status
                    </span>
                    <span className="text-[12px] text-white font-bold uppercase">
                      {selectedHistory.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 py-6 border-y border-white/10">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Entry</div>
                    <div className="text-[13px] font-mono font-bold text-white">{selectedHistory.entry || '-'}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-rose-500/70" /> SL
                    </div>
                    <div className="text-[13px] font-mono font-bold text-rose-400">{selectedHistory.sl || '-'}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center shadow-sm">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-emerald-500/70" /> TP1
                    </div>
                    <div className="text-[13px] font-mono font-bold text-emerald-400">{selectedHistory.tp1 || '-'}</div>
                  </div>
                </div>

                <div className={`border rounded-2xl p-6 text-center shadow-sm ${selectedHistory.pips > 0 ? "bg-emerald-500/10 border-emerald-500/20" : selectedHistory.pips < 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-white/5 border-white/10"}`}>
                  <span className={`block text-[10px] font-bold uppercase tracking-widest mb-3 ${selectedHistory.pips > 0 ? "text-emerald-500" : selectedHistory.pips < 0 ? "text-rose-500" : "text-zinc-500"}`}>
                    Net Result (Pips)
                  </span>
                  <span
                    className={`text-3xl font-mono font-black tracking-tight ${selectedHistory.pips > 0 ? "text-emerald-400" : selectedHistory.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                  >
                    {selectedHistory.pips > 0 ? "+" : ""}
                    {selectedHistory.pips}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5" />
                    Outcome Analysis
                  </span>
                  <div className="bg-black/40 border border-white/10 rounded-xl p-5 text-[12px] text-zinc-300 leading-relaxed font-medium italic shadow-inner border-l-2 border-l-blue-500">
                    {selectedHistory.reason 
                      ? selectedHistory.reason
                      : selectedHistory.outcome === "WIN"
                        ? "Trade hit target profit successfully."
                        : selectedHistory.outcome === "LOSS"
                          ? "Trade hit stop loss and was invalidated."
                          : "Trade was manually or systemically closed."}
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
