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
  BarChart2,
  Download
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

  const handleExportCSV = () => {
    if (!filteredHistory || filteredHistory.length === 0) return;
    const headers = ["Signal Key", "Pair", "Direction", "Strategy", "Outcome", "Pips", "Closed At", "Reason"];
    const rows = filteredHistory.map(item => [
      item.signalKey || item.id || '',
      item.pair || 'XAUUSD',
      item.direction || '',
      `"${(item.strategyName || '').replace(/"/g, '""')}"`,
      item.outcome || '',
      item.pips || 0,
      `"${item.closedAt || ''}"`,
      `"${(item.reason || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `trade-history-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    }
  };

  return (
    <div className="space-y-2.5 h-full pb-10 relative">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1.5 border-b border-white/10 pb-2 mb-2"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
            <h2 className="text-[8px] font-bold text-zinc-200 flex items-center gap-1.5 tracking-widest uppercase">
                <div className="p-1 rounded bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                  <HistoryIcon className="w-2.5 h-2.5 text-zinc-300 relative z-10" />
                </div>
                Portfolio History
            </h2>
            <div className="flex items-center gap-1 mt-1">
                <p className="text-[8px] text-zinc-500 tracking-wide font-medium">Arsip outcome, pips, dan evaluasi</p>
                {!loading && history && (
                    <>
                        <span className="text-[8px] text-zinc-600">•</span>
                        <span className="px-1.5 py-0.5 rounded text-[6px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-widest shadow-sm">
                        Synced
                        </span>
                    </>
                )}
            </div>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-2 py-1 min-h-[24px] shadow-sm focus-within:border-white/30 focus-within:bg-white/10 transition-colors">
                    <Search className="w-2.5 h-2.5 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search history..." 
                      className="bg-transparent border-none outline-none text-[8px] font-medium text-white w-24 md:w-32 placeholder:text-zinc-600 focus:ring-0 tracking-wide"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1 px-2 py-1 border rounded text-[6px] font-bold tracking-widest uppercase transition-colors shadow-sm min-h-[24px] ${showFilters ? 'bg-white/20 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20'}`}
                >
                    <ListFilter className="w-2.5 h-2.5" />
                    Filters
                </button>
                <button 
                    onClick={handleExportCSV}
                    disabled={!filteredHistory || filteredHistory.length === 0}
                    className="flex items-center gap-1 px-2 py-1 border rounded text-[6px] font-bold tracking-widest uppercase transition-colors shadow-sm min-h-[24px] bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Download className="w-2.5 h-2.5 text-emerald-400" />
                    CSV
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
                    <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
                    <select 
                        value={timeframeFilter} 
                        onChange={(e) => setTimeframeFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-300 text-[8px] font-bold tracking-wide rounded px-2 py-1 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[24px] shadow-sm appearance-none"
                    >
                        <option value="ALL">All Time</option>
                        <option value="TODAY">Last 24 Hours</option>
                        <option value="WEEK">Last 7 Days</option>
                        <option value="MONTH">Last 30 Days</option>
                    </select>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-300 text-[8px] font-bold tracking-wide rounded px-2 py-1 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[24px] shadow-sm appearance-none"
                    >
                        <option value="ALL">All Outcomes</option>
                        <option value="WIN">Wins Only</option>
                        <option value="LOSS">Losses Only</option>
                    </select>
                    <select 
                        value={strategyFilter} 
                        onChange={(e) => setStrategyFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-zinc-300 text-[8px] font-bold tracking-wide rounded px-2 py-1 focus:outline-none focus:border-white/30 hover:bg-white/10 transition-colors cursor-pointer min-h-[24px] shadow-sm max-w-full sm:max-w-[150px] truncate appearance-none"
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
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-5 h-5 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin mb-3 shadow-sm"></div>
          <p className="text-[9px] text-zinc-500 font-bold tracking-widest uppercase">Loading history...</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-rose-900/40 rounded-lg bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-6 h-6 text-rose-500/80 mb-2" />
          <p className="text-[8px] font-bold text-rose-400 mb-1 tracking-wide">
            {error?.message?.includes("Closed") ? "Market Closed" :
             error?.message?.includes("Stale") ? "Data Stale" :
             error?.message?.includes("Offline") ? "Provider Offline" :
             error?.message?.includes("Supabase") ? "Supabase Down" :
             error?.message?.includes("Redis") ? "Redis Down" :
             error?.message?.includes("AI") ? "AI Validation Failed" :
             "Backend Service Error"}
          </p>
          <p className="text-[8px] text-zinc-500 max-w-[240px] leading-relaxed mb-2.5 font-medium">
            {error?.message || "Unable to connect to database."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[8px] font-bold tracking-wide rounded transition-all shadow-sm"
          >
            Try Again
          </button>
        </motion.div>
      ) : !history || history.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800/80 rounded-lg bg-white/5 shadow-sm backdrop-blur-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-3 border border-white/10 shadow-sm relative overflow-hidden">
            <HistoryIcon className="w-4 h-4 text-zinc-600 relative z-10" />
          </div>
          <p className="text-[8px] font-bold text-zinc-400 mb-1 tracking-wide">No Trade History</p>
          <p className="text-[8px] text-zinc-500 max-w-[240px] leading-relaxed font-medium">
            Completed or closed signals will appear here.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-6 pb-16">
          
          {/* Summary Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-1.5"
          >
            <div className="bg-white/5 border border-white/10 rounded-md p-1.5 flex flex-col items-center justify-center shadow-sm backdrop-blur-md">
              <span className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1"><Activity className="w-2.5 h-2.5" /> Win Rate</span>
              <span className="text-[10px] font-black text-white tracking-tight">{summary.winRate}%</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-md p-1.5 flex flex-col items-center justify-center shadow-sm backdrop-blur-md">
              <span className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1"><BarChart2 className="w-2.5 h-2.5" /> Total Pips</span>
              <span className={`text-[10px] font-black font-mono tracking-tight ${summary.totalPips > 0 ? "text-emerald-400" : summary.totalPips < 0 ? "text-rose-400" : "text-zinc-300"}`}>
                {summary.totalPips > 0 ? "+" : ""}{summary.totalPips}
              </span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-1.5 flex flex-col items-center justify-center shadow-sm backdrop-blur-md">
              <span className="text-[6px] text-emerald-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Wins</span>
              <span className="text-[10px] font-black text-emerald-400 tracking-tight">{summary.win}</span>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-md p-1.5 flex flex-col items-center justify-center shadow-sm backdrop-blur-md">
              <span className="text-[6px] text-rose-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> Losses</span>
              <span className="text-[10px] font-black text-rose-400 tracking-tight">{summary.loss}</span>
            </div>
          </motion.div>

          {/* Strategy Ranking */}
          {strategyRanking.length > 0 && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white/5 border border-white/10 rounded-md p-1.5 md:p-3 shadow-sm backdrop-blur-md"
            >
              <h3 className="text-[6px] font-bold text-zinc-400 mb-1.5 uppercase tracking-widest flex items-center gap-1">
                <Activity className="w-2.5 h-2.5 text-blue-400" />
                Performance By Strategy
              </h3>
              <div className="space-y-1.5">
                {strategyRanking.map((strat, idx) => (
                  <div key={strat.name} className="flex items-center justify-between bg-black/40 border border-white/10 rounded p-1.5 text-[8px] hover:bg-white/10 transition-colors shadow-inner relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
                    <span className="text-zinc-200 font-bold tracking-wide truncate pr-2 flex-1 text-[8px] relative z-10">
                      {idx + 1}. {strat.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0 relative z-10">
                      <span className="text-zinc-500 font-medium w-12 text-right uppercase tracking-widest text-[6px]">{strat.wins}/{strat.total} Won</span>
                      <div className="w-10 text-right">
                        <span className={`px-1.5 py-0.5 rounded font-bold text-[6px] uppercase tracking-widest ${strat.winRate >= 50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{strat.winRate}%</span>
                      </div>
                      <span className={`w-10 text-right font-mono font-bold text-[9px] ${strat.pips > 0 ? 'text-emerald-400' : strat.pips < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {strat.pips > 0 ? '+' : ''}{strat.pips}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <h3 className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <HistoryIcon className="w-2.5 h-2.5 text-blue-400" />
              Trade History Log
            </h3>
            {filteredHistory.length === 0 ? (
               <div className="text-center py-10 text-[9px] text-zinc-500 border border-dashed border-white/10 rounded-lg bg-white/5 shadow-sm backdrop-blur-sm">
                 <p className="font-bold text-zinc-400 mb-1 tracking-widest uppercase">No Matches Found</p>
                 <p className="font-medium text-[8px]">Adjust your filters.</p>
               </div>
            ) : (
              <motion.div 
                variants={listVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-1.5"
              >
                {filteredHistory.slice(0, 100).map((item) => (
                  <motion.div
                    variants={itemVariants}
                    key={item.id || item.signalKey || `${item.pair}-${item.strategyName}-${item.closedAtTimestamp || item.closedAt}`}
                    onClick={() => setSelectedHistory(item)}
                    className="bg-white/5 border border-white/10 rounded-md p-1.5 cursor-pointer hover:border-blue-500/30 hover:bg-white/10 transition-all group shadow-sm backdrop-blur-md relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
                    <div className="flex justify-between items-start mb-1.5 relative z-10">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[6px] font-bold uppercase tracking-widest border shadow-sm ${item.direction === "BUY" || item.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                          >
                            {item.direction === "BUY" || item.direction === "LONG" ? (
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            ) : (
                              <ArrowDownRight className="w-2.5 h-2.5" />
                            )}
                            {item.direction === "LONG" ? "BUY" : item.direction === "SHORT" ? "SELL" : item.direction}
                          </span>
                          <span className="text-[8px] font-bold text-zinc-100 tracking-wide">
                            {item.pair}
                          </span>
                        </div>
                        <p className="text-[8px] text-zinc-500 font-medium line-clamp-1 tracking-wide">
                          {item.strategyName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[6px] font-bold uppercase tracking-widest border shadow-sm ${item.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : item.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                        >
                          {item.outcome === "WIN" ? (
                            <Target className="w-2.5 h-2.5" />
                          ) : item.outcome === "LOSS" ? (
                            <Shield className="w-2.5 h-2.5" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5" />
                          )}
                          {item.outcome === "WIN"
                            ? "TP"
                            : item.outcome === "LOSS"
                              ? "SL"
                              : "Closed"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[8px] relative z-10">
                      <div className="flex items-center gap-1 text-zinc-500 font-mono font-medium">
                        <Clock className="w-2.5 h-2.5 text-zinc-500" />
                        {item.closedAt}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500 font-bold tracking-widest uppercase text-[6px]">Net Pips:</span>
                        <span
                          className={`font-mono font-black text-[10px] ${item.pips > 0 ? "text-emerald-400" : item.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
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
            className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedHistory(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-[240px] h-full bg-zinc-950/90 border-l border-white/10 shadow-2xl p-3 overflow-y-auto backdrop-blur-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[8px] font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-widest">
                  <div className="p-1 rounded bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                      <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                      <HistoryIcon className="w-2.5 h-2.5 text-zinc-300 relative z-10" />
                  </div>
                  Trade Record
                </h3>
                <button
                  onClick={() => setSelectedHistory(null)}
                  className="p-1 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-6 -mr-6 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
                  <div className="flex justify-between items-center mb-1.5 relative z-10">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[6px] font-bold tracking-widest uppercase border shadow-sm ${selectedHistory.direction === "BUY" || selectedHistory.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedHistory.direction === "BUY" || selectedHistory.direction === "LONG" ? (
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      ) : (
                        <ArrowDownRight className="w-2.5 h-2.5" />
                      )}
                      {(selectedHistory.direction === "LONG" ? "BUY" : selectedHistory.direction === "SHORT" ? "SELL" : selectedHistory.direction)} {selectedHistory.pair}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[6px] font-bold uppercase tracking-widest border shadow-sm ${selectedHistory.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : selectedHistory.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                    >
                      {selectedHistory.outcome}
                    </span>
                  </div>
                  <span className="text-[6px] font-mono font-bold text-zinc-500 bg-black/40 px-1.5 py-0.5 rounded border border-white/10 block w-fit mb-1.5 relative z-10">
                    {selectedHistory.signalKey}
                  </span>
                  <p className="text-[8px] font-bold tracking-wide text-white relative z-10">
                    {selectedHistory.strategyName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2">
                  <div className="bg-black/40 p-1.5 rounded-md border border-white/10">
                    <span className="block text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                      Time Closed
                    </span>
                    <span className="text-[7px] font-mono font-bold text-white">
                      {selectedHistory.closedAt}
                    </span>
                  </div>
                  <div className="bg-black/40 p-1.5 rounded-md border border-white/10">
                    <span className="block text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                      Duration
                    </span>
                    <span className="text-[8px] text-white font-mono font-bold">
                      {selectedHistory.duration || '-'}
                    </span>
                  </div>
                  <div className="col-span-2 bg-black/40 p-1.5 rounded-md border border-white/10">
                    <span className="block text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                      Final Status
                    </span>
                    <span className="text-[8px] text-white font-bold uppercase">
                      {selectedHistory.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 py-2 border-y border-white/10">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center shadow-sm">
                    <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Entry</div>
                    <div className="text-[8px] font-mono font-bold text-white">{selectedHistory.entry || '-'}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center shadow-sm">
                    <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-1 flex justify-center items-center gap-1">
                      <Shield className="w-2 h-2 text-rose-500/70" /> SL
                    </div>
                    <div className="text-[8px] font-mono font-bold text-rose-400">{selectedHistory.sl || '-'}</div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center shadow-sm">
                    <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-1 flex justify-center items-center gap-1">
                      <Target className="w-2 h-2 text-emerald-500/70" /> TP1
                    </div>
                    <div className="text-[8px] font-mono font-bold text-emerald-400">{selectedHistory.tp1 || '-'}</div>
                  </div>
                </div>

                <div className={`border rounded-lg p-3 text-center shadow-sm ${selectedHistory.pips > 0 ? "bg-emerald-500/10 border-emerald-500/20" : selectedHistory.pips < 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-white/5 border-white/10"}`}>
                  <span className={`block text-[6px] font-bold uppercase tracking-widest mb-1.5 ${selectedHistory.pips > 0 ? "text-emerald-500" : selectedHistory.pips < 0 ? "text-rose-500" : "text-zinc-500"}`}>
                    Net Result (Pips)
                  </span>
                  <span
                    className={`text-xl font-mono font-black tracking-tight ${selectedHistory.pips > 0 ? "text-emerald-400" : selectedHistory.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                  >
                    {selectedHistory.pips > 0 ? "+" : ""}
                    {selectedHistory.pips}
                  </span>
                </div>

                <div>
                  <span className="text-[6px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                    <Search className="w-2.5 h-2.5" />
                    Outcome Analysis
                  </span>
                  <div className="bg-black/40 border border-white/10 rounded-lg p-3 text-[9px] text-zinc-400 leading-relaxed font-medium italic shadow-inner border-l-2 border-l-blue-500">
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
