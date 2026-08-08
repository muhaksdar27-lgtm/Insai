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
    <div className="space-y-3 h-full pb-10 relative">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 border-b border-zinc-800/80 pb-3"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
            <h2 className="text-[11px] font-extrabold text-zinc-100 flex items-center gap-2 tracking-wide font-mono uppercase">
                <div className="p-1 rounded-md bg-zinc-800 border border-zinc-700 shadow-sm">
                  <HistoryIcon className="w-3 h-3 text-zinc-300" />
                </div>
                PORTFOLIO HISTORY
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
                <p className="text-[10px] text-zinc-400 tracking-wide font-medium">Outcome Archive & Strategy Ranking Evaluation</p>
                {!loading && history && (
                    <>
                        <span className="text-[10px] text-zinc-600">•</span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider shadow-sm">
                          Synced ({history.length})
                        </span>
                    </>
                )}
            </div>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 shadow-sm focus-within:border-zinc-700 transition-colors">
                    <Search className="w-3 h-3 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search pair/strategy..." 
                      className="bg-transparent border-none outline-none text-[10px] font-medium text-zinc-200 w-28 sm:w-36 placeholder:text-zinc-600 focus:ring-0 tracking-wide"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-[10px] font-bold tracking-wider uppercase transition-all shadow-sm active:scale-95 ${showFilters ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                >
                    <ListFilter className="w-3 h-3" />
                    Filters
                </button>
                <button 
                    onClick={handleExportCSV}
                    disabled={!filteredHistory || filteredHistory.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-[10px] font-bold tracking-wider uppercase transition-all shadow-sm bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                    <Download className="w-3 h-3 text-emerald-400" />
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
                    <div className="flex flex-wrap gap-2 pt-2">
                    <select 
                        value={timeframeFilter} 
                        onChange={(e) => setTimeframeFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold tracking-wide rounded-md px-2.5 py-1.5 focus:outline-none focus:border-zinc-700 transition-colors cursor-pointer shadow-sm"
                    >
                        <option value="ALL">All Time</option>
                        <option value="TODAY">Last 24 Hours</option>
                        <option value="WEEK">Last 7 Days</option>
                        <option value="MONTH">Last 30 Days</option>
                    </select>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold tracking-wide rounded-md px-2.5 py-1.5 focus:outline-none focus:border-zinc-700 transition-colors cursor-pointer shadow-sm"
                    >
                        <option value="ALL">All Outcomes</option>
                        <option value="WIN">Wins Only</option>
                        <option value="LOSS">Losses Only</option>
                    </select>
                    <select 
                        value={strategyFilter} 
                        onChange={(e) => setStrategyFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-bold tracking-wide rounded-md px-2.5 py-1.5 focus:outline-none focus:border-zinc-700 transition-colors cursor-pointer shadow-sm max-w-[200px] truncate"
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-zinc-400 rounded-full animate-spin mb-3 shadow-sm"></div>
          <p className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase">Loading trade history...</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-rose-900/40 rounded-xl bg-rose-950/20 shadow-sm"
        >
          <AlertTriangle className="w-8 h-8 text-rose-500/80 mb-3" />
          <p className="text-[11px] font-bold text-rose-400 mb-1 tracking-wide">
            {error?.message || "Unable to retrieve portfolio history."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-wider rounded-md transition-all shadow-sm active:scale-95"
          >
            Try Again
          </button>
        </motion.div>
      ) : !history || history.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/40 shadow-sm backdrop-blur-sm"
        >
          <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-3 border border-zinc-800 relative overflow-hidden">
            <HistoryIcon className="w-5 h-5 text-zinc-600 relative z-10" />
          </div>
          <p className="text-[11px] font-bold text-zinc-300 mb-1 tracking-wider uppercase">No Trade History Found</p>
          <p className="text-[10px] text-zinc-500 max-w-[280px] leading-relaxed font-medium">
            Completed or closed signals will appear here once executed.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-4 pb-16">
          
          {/* Summary Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-2"
          >
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center justify-center shadow-md backdrop-blur-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Activity className="w-3 h-3 text-blue-400" /> Win Rate</span>
              <span className="text-base font-black text-zinc-100 font-mono tracking-tight">{summary.winRate}%</span>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center justify-center shadow-md backdrop-blur-sm">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><BarChart2 className="w-3 h-3 text-amber-400" /> Total Pips</span>
              <span className={`text-base font-black font-mono tracking-tight ${summary.totalPips > 0 ? "text-emerald-400" : summary.totalPips < 0 ? "text-rose-400" : "text-zinc-300"}`}>
                {summary.totalPips > 0 ? "+" : ""}{summary.totalPips}
              </span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col items-center justify-center shadow-md backdrop-blur-sm">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Total Wins</span>
              <span className="text-base font-black text-emerald-400 font-mono tracking-tight">{summary.win}</span>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex flex-col items-center justify-center shadow-md backdrop-blur-sm">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><XCircle className="w-3 h-3 text-rose-400" /> Total Losses</span>
              <span className="text-base font-black text-rose-400 font-mono tracking-tight">{summary.loss}</span>
            </div>
          </motion.div>

          {/* Strategy Ranking */}
          {strategyRanking.length > 0 && (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 shadow-md backdrop-blur-sm"
            >
              <h3 className="text-[10px] font-bold text-zinc-300 mb-2.5 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                Strategy Performance Ranking
              </h3>
              <div className="space-y-2">
                {strategyRanking.map((strat, idx) => (
                  <div key={strat.name} className="flex items-center justify-between bg-zinc-950/70 border border-zinc-800/60 rounded-lg p-2 hover:bg-zinc-900 transition-colors shadow-inner">
                    <span className="text-zinc-200 font-bold tracking-wide truncate pr-2 flex-1 text-[10px]">
                      {idx + 1}. {strat.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-zinc-400 font-mono font-bold text-[10px]">{strat.wins}/{strat.total} Won</span>
                      <div className="w-12 text-right">
                        <span className={`px-2 py-0.5 rounded font-bold font-mono text-[10px] uppercase tracking-wider ${strat.winRate >= 50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{strat.winRate}%</span>
                      </div>
                      <span className={`w-14 text-right font-mono font-bold text-[10px] ${strat.pips > 0 ? 'text-emerald-400' : strat.pips < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {strat.pips > 0 ? '+' : ''}{strat.pips} Pips
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <HistoryIcon className="w-3.5 h-3.5 text-blue-400" />
              Historical Trade Logs
            </h3>
            {filteredHistory.length === 0 ? (
               <div className="text-center py-10 text-[10px] text-zinc-500 border border-dashed border-zinc-800/80 rounded-xl bg-zinc-900/40 shadow-sm backdrop-blur-sm">
                 <p className="font-bold text-zinc-300 mb-1 tracking-wider uppercase">No Matches Found</p>
                 <p className="font-medium text-[10px]">Try adjusting search terms or filters.</p>
               </div>
            ) : (
              <motion.div 
                variants={listVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
              >
                {filteredHistory.slice(0, 100).map((item) => {
                  const isBuy = item.direction === "BUY" || item.direction === "LONG";
                  return (
                    <motion.div
                      variants={itemVariants}
                      key={item.id || item.signalKey || `${item.pair}-${item.strategyName}-${item.closedAtTimestamp || item.closedAt}`}
                      onClick={() => setSelectedHistory(item)}
                      className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3 cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900/70 transition-all group shadow-md backdrop-blur-sm relative overflow-hidden flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start mb-2 pb-2 border-b border-zinc-800/60">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${isBuy ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                            >
                              {isBuy ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3" />
                              )}
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                            <span className="text-[10px] font-bold text-zinc-100 font-mono tracking-wide">
                              {item.pair}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 font-medium truncate max-w-[180px]">
                            {item.strategyName}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${item.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : item.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                          >
                            {item.outcome === "WIN" ? (
                              <Target className="w-3 h-3" />
                            ) : item.outcome === "LOSS" ? (
                              <Shield className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {item.outcome === "WIN"
                              ? "TP HIT"
                              : item.outcome === "LOSS"
                                ? "SL HIT"
                                : "CLOSED"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <div className="flex items-center gap-1 text-zinc-500 font-medium">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {item.closedAt}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 font-bold tracking-wider uppercase text-[10px]">Result:</span>
                          <span
                            className={`font-mono font-bold text-[11px] ${item.pips > 0 ? "text-emerald-400" : item.pips < 0 ? "text-rose-400" : "text-zinc-400"}`}
                          >
                            {item.pips > 0 ? "+" : ""}
                            {item.pips} Pips
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
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
              className="w-full max-w-[300px] h-full bg-zinc-950/95 border-l border-zinc-800/80 shadow-2xl p-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                <h3 className="text-[10px] font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider font-mono">
                  <div className="p-1 rounded bg-zinc-800 border border-zinc-700 shadow-sm">
                      <HistoryIcon className="w-3 h-3 text-zinc-300" />
                  </div>
                  Trade Record
                </h3>
                <button
                  onClick={() => setSelectedHistory(null)}
                  className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border shadow-sm ${selectedHistory.direction === "BUY" || selectedHistory.direction === "LONG" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"}`}
                    >
                      {selectedHistory.direction === "BUY" || selectedHistory.direction === "LONG" ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {(selectedHistory.direction === "LONG" ? "BUY" : selectedHistory.direction === "SHORT" ? "SELL" : selectedHistory.direction)} {selectedHistory.pair}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${selectedHistory.outcome === "WIN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : selectedHistory.outcome === "LOSS" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                    >
                      {selectedHistory.outcome}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 block w-fit mb-2">
                    {selectedHistory.signalKey}
                  </span>
                  <p className="text-[10px] font-bold tracking-wide text-zinc-100">
                    {selectedHistory.strategyName}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-950/80 p-2 rounded-md border border-zinc-800/60">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                      Closed At
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-300">
                      {selectedHistory.closedAt}
                    </span>
                  </div>
                  <div className="bg-zinc-950/80 p-2 rounded-md border border-zinc-800/60">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-0.5">
                      Duration
                    </span>
                    <span className="text-[10px] text-zinc-300 font-mono font-bold">
                      {selectedHistory.duration || '-'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-zinc-950/80 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5">Entry</div>
                    <div className="text-[10px] font-mono font-bold text-zinc-200">{selectedHistory.entry || '-'}</div>
                  </div>
                  <div className="bg-zinc-950/80 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Shield className="w-2.5 h-2.5 text-rose-500/80" /> SL
                    </div>
                    <div className="text-[10px] font-mono font-bold text-rose-400">{selectedHistory.sl || '-'}</div>
                  </div>
                  <div className="bg-zinc-950/80 border border-zinc-800/60 rounded-md p-1.5 text-center shadow-inner">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Target className="w-2.5 h-2.5 text-emerald-500/80" /> TP1
                    </div>
                    <div className="text-[10px] font-mono font-bold text-emerald-400">{selectedHistory.tp1 || '-'}</div>
                  </div>
                </div>

                <div className={`border rounded-lg p-3 text-center shadow-sm ${selectedHistory.pips > 0 ? "bg-emerald-500/10 border-emerald-500/20" : selectedHistory.pips < 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-zinc-900 border-zinc-800"}`}>
                  <span className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${selectedHistory.pips > 0 ? "text-emerald-400" : selectedHistory.pips < 0 ? "text-rose-400" : "text-zinc-500"}`}>
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1 font-mono">
                    <Search className="w-3 h-3" />
                    Outcome Evaluation
                  </span>
                  <div className="bg-zinc-950/80 border border-zinc-800/60 rounded-md p-2.5 text-[10px] text-zinc-300 leading-relaxed font-medium italic border-l-2 border-l-blue-500">
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

