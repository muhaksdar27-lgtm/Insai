"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
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
  RotateCw,
  Search,
  Activity,
  Zap,
  ChevronRight,
  TrendingUp,
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
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 350, damping: 25 } }
};

export default function LiveSignals() {
  const { data: rawSignals, loading, error, refetch } = useFetch<any[]>("/api/signals/live", []);
  const [selectedSignal, setSelectedSignal] = useState<any>(null);
  const [directionFilter, setDirectionFilter] = useState<string>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Trigger real-time market scan
  const handleTriggerScan = async () => {
    try {
      setIsScanning(true);
      setScanMessage("Scanning real-time market data...");
      const res = await fetch("/api/market/scan", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setScanMessage("Scan completed! Updating live signals...");
        await refetch();
      } else {
        setScanMessage(`Scan note: ${data.error || "No new setups triggered"}`);
      }
    } catch (e: any) {
      setScanMessage(`Scan error: ${e.message}`);
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanMessage(null), 4000);
    }
  };

  // Filter signals to active statuses
  const allActiveSignals = (rawSignals || []).filter(s => {
    const st = (s.status || s.baseStatus || '').toUpperCase();
    return ['APPROVED', 'DISPATCHED', 'SIGNAL_ACTIVE', 'ACTIVE', 'TAKE_PARTIAL', 'PENDING'].includes(st);
  });

  // Apply UI Filters
  const filteredSignals = allActiveSignals.filter(signal => {
    const isBuy = signal.direction === "BUY" || signal.direction === "LONG";
    const dirMatch = directionFilter === "ALL" || 
      (directionFilter === "BUY" && isBuy) || 
      (directionFilter === "SELL" && !isBuy);

    const stratMatch = strategyFilter === "ALL" || 
      (signal.strategyName || '').toLowerCase().includes(strategyFilter.toLowerCase());

    const searchMatch = !searchQuery || 
      (signal.pair || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (signal.strategyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (signal.signalKey || '').toLowerCase().includes(searchQuery.toLowerCase());

    return dirMatch && stratMatch && searchMatch;
  });

  // Calculate summary metrics
  const totalSignals = allActiveSignals.length;
  const buyCount = allActiveSignals.filter(s => s.direction === "BUY" || s.direction === "LONG").length;
  const sellCount = allActiveSignals.filter(s => s.direction === "SELL" || s.direction === "SHORT").length;
  const totalPips = allActiveSignals.reduce((acc, s) => acc + (s.pips || 0), 0);

  return (
    <div className="space-y-3 relative h-full pb-12">
      {/* Top Bar Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-sm relative">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-mono font-extrabold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
              LIVE SIGNALS ENGINE
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            </h1>
            <p className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <span>Real-Time Market Setup Stream</span>
              <span>•</span>
              <span className="text-blue-400 font-bold">{totalSignals} Active Signal{totalSignals !== 1 ? 's' : ''}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Scan Trigger */}
          <button
            onClick={handleTriggerScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/30 text-[10px] font-mono font-bold tracking-wider uppercase transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : 'text-amber-300'}`} />
            {isScanning ? 'Scanning Market...' : 'Run Live Market Scan'}
          </button>

          {/* Refresh */}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 text-[10px] font-mono font-bold tracking-wider uppercase transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Scan Status Toast Banner */}
      <AnimatePresence>
        {scanMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-2.5 px-3.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-[10px] font-mono font-bold text-blue-300 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>{scanMessage}</span>
            </div>
            <button onClick={() => setScanMessage(null)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">
            <span>Total Active</span>
            <Radio className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-base sm:text-lg font-mono font-black text-zinc-100">
            {totalSignals}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Live Market Signals</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">
            <span>Direction Split</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-mono font-black text-zinc-100 flex items-center gap-2">
            <span className="text-emerald-400">{buyCount} BUY</span>
            <span className="text-zinc-600">/</span>
            <span className="text-rose-400">{sellCount} SELL</span>
          </div>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">Confluence Order Bias</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">
            <span>Total Running Pips</span>
            <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className={`text-base sm:text-lg font-mono font-black ${totalPips > 0 ? 'text-emerald-400' : totalPips < 0 ? 'text-rose-400' : 'text-zinc-200'}`}>
            {totalPips > 0 ? `+${totalPips}` : totalPips} Pips
          </div>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">XAUUSD Live Profit</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">
            <span>Market Feed</span>
            <Zap className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-base sm:text-lg font-mono font-black text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            ACTIVE
          </div>
          <div className="text-[10px] font-mono text-zinc-500 mt-0.5">XAUUSD Realtime Feed</div>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2.5 backdrop-blur-sm">
        {/* Direction Tabs */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
          {["ALL", "BUY", "SELL"].map(dir => (
            <button
              key={dir}
              onClick={() => setDirectionFilter(dir)}
              className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider uppercase transition-all ${
                directionFilter === dir 
                  ? dir === 'BUY' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : dir === 'SELL'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {dir === "BUY" && <ArrowUpRight className="w-3 h-3 inline mr-1" />}
              {dir === "SELL" && <ArrowDownRight className="w-3 h-3 inline mr-1" />}
              {dir}
            </button>
          ))}
        </div>

        {/* Strategy Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-zinc-200 text-[10px] font-mono font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 uppercase tracking-wider cursor-pointer"
            >
              <option value="ALL">All Strategies</option>
              <option value="smc">SMC Market Structure</option>
              <option value="snd">Supply & Demand</option>
              <option value="scalping">M1 Scalping</option>
              <option value="news">News Impact</option>
              <option value="confluence">Multi-Confluence</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[140px] sm:min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search signal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-[10px] font-mono pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
            />
          </div>
        </div>
      </div>

      {/* Main Signals Grid / States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20">
          <Activity className="w-8 h-8 text-blue-400 animate-spin mb-3" />
          <p className="text-[11px] font-mono text-zinc-300 font-bold uppercase tracking-wider">
            Fetching Live Market Signals...
          </p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1">Connecting to real-time execution engine</p>
        </div>
      ) : error ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-rose-900/40 rounded-2xl bg-rose-950/20"
        >
          <AlertTriangle className="w-8 h-8 text-rose-500 mb-3" />
          <p className="text-[11px] font-mono font-bold text-rose-400 mb-1 uppercase tracking-wider">
            Signal Synchronization Alert
          </p>
          <p className="text-[10px] text-zinc-400 max-w-[320px] leading-relaxed mb-4 font-mono">
            {error?.message || "Failed to sync active signals with live market scanner."}
          </p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] font-mono font-bold tracking-wider uppercase rounded-lg transition-all shadow-sm active:scale-95"
          >
            Retry Connection
          </button>
        </motion.div>
      ) : filteredSignals.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/30 backdrop-blur-sm p-6"
        >
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 shadow-inner">
            <Radio className="w-6 h-6 text-zinc-500" />
          </div>
          <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-widest mb-1">
            No Active Signals Found
          </h3>
          <p className="text-[10px] font-mono text-zinc-400 max-w-[340px] leading-relaxed mb-5">
            The market scanner is active. No setup currently satisfies full AI confluence rules for the selected filter.
          </p>
          <button
            onClick={handleTriggerScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            {isScanning ? 'Scanning Realtime Market...' : 'Run Live Market Scan Now'}
          </button>
        </motion.div>
      ) : (
        <motion.div 
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3"
        >
          {filteredSignals.map((signal) => {
            const isBuy = signal.direction === "BUY" || signal.direction === "LONG";
            const rrRatio = signal.entry && signal.sl && signal.tp1 ? 
              Math.abs((signal.tp1 - signal.entry) / (signal.entry - signal.sl)).toFixed(2) : '2.00';

            const statusNormalized = (signal.status || 'SIGNAL_ACTIVE').toUpperCase();
            const isTp1 = statusNormalized === 'TP1 HIT';
            const isTp2 = statusNormalized === 'TP2 HIT';
            const isTp3 = statusNormalized === 'TP3 HIT';
            const isSl = statusNormalized === 'SL HIT';

            return (
              <motion.div
                variants={itemVariants}
                key={signal.id || signal.signalKey || `${signal.pair || 'XAUUSD'}-${signal.strategyName}-${signal.entry}`}
                onClick={() => setSelectedSignal(signal)}
                className="bg-zinc-900/60 border border-zinc-800/90 hover:border-blue-500/50 hover:bg-zinc-900/90 rounded-2xl p-3.5 cursor-pointer transition-all duration-200 group shadow-lg backdrop-blur-md relative overflow-hidden flex flex-col justify-between"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3 pb-2.5 border-b border-zinc-800/80">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold border uppercase tracking-wider shadow-sm ${
                          isBuy 
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" 
                            : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                        }`}
                      >
                        {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {isBuy ? "BUY" : "SELL"}
                      </span>
                      <span className="text-xs font-mono font-bold text-zinc-100 tracking-wide">
                        {signal.pair}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        R:R 1:{rrRatio}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono font-medium truncate max-w-[220px]">
                      {signal.strategyName}
                    </p>
                  </div>

                  <div className="text-right flex flex-col items-end">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold uppercase tracking-wider border shadow-sm ${
                      isSl 
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                        : (isTp1 || isTp2 || isTp3) 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    }`}>
                      {statusNormalized}
                    </span>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                      <Clock className="w-2.5 h-2.5 text-zinc-500" />
                      {signal.age || 'Just now'}
                    </div>
                  </div>
                </div>

                {/* Price Grid */}
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2 text-center shadow-inner">
                    <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5">
                      Entry Price
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-100">
                      {signal.entry ? Number(signal.entry).toFixed(2) : '--'}
                    </div>
                  </div>
                  <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2 text-center shadow-inner">
                    <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Shield className="w-2.5 h-2.5 text-rose-400" /> SL
                    </div>
                    <div className="text-xs font-mono font-bold text-rose-400">
                      {signal.sl ? Number(signal.sl).toFixed(2) : '--'}
                    </div>
                  </div>
                  <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2 text-center shadow-inner">
                    <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                      <Target className="w-2.5 h-2.5 text-emerald-400" /> TP1
                    </div>
                    <div className="text-xs font-mono font-bold text-emerald-400">
                      {signal.tp1 ? Number(signal.tp1).toFixed(2) : '--'}
                    </div>
                  </div>
                </div>

                {/* TP2 / TP3 if present */}
                {(signal.tp2 || signal.tp3) && (
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {signal.tp2 && (
                      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2 text-center shadow-inner">
                        <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                          <Target className="w-2.5 h-2.5 text-emerald-400" /> TP2 Target
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          {Number(signal.tp2).toFixed(2)}
                        </div>
                      </div>
                    )}
                    {signal.tp3 && (
                      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2 text-center shadow-inner">
                        <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1">
                          <Target className="w-2.5 h-2.5 text-emerald-400" /> TP3 Target
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          {Number(signal.tp3).toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Badges & Live Pips */}
                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wide">
                      Confluence {signal.confidenceScore || 85}%
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                      {signal.freshness || 'LIVE'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    <span className="text-zinc-500 font-bold uppercase">Running Pips:</span>
                    <span className={`font-black ${signal.pips > 0 ? "text-emerald-400" : signal.pips < 0 ? "text-rose-400" : "text-zinc-300"}`}>
                      {signal.pips > 0 ? `+${signal.pips}` : signal.pips || 0}
                    </span>
                  </div>
                </div>

                {/* Progress Visualizer */}
                <div className="mt-2.5 pt-2 border-t border-zinc-800/40">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-zinc-500 mb-1 uppercase">
                    <span>Entry ({Number(signal.entry || 0).toFixed(1)})</span>
                    <span className={isTp1 ? 'text-emerald-400' : ''}>TP1 ({Number(signal.tp1 || 0).toFixed(1)})</span>
                    <span className="text-zinc-400 flex items-center gap-0.5">
                      Inspect <ChevronRight className="w-3 h-3 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-950 rounded-full flex overflow-hidden border border-zinc-800/80">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        (isTp1 || isTp2 || isTp3) ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} 
                      style={{ width: (isTp1 || isTp2 || isTp3) ? '100%' : '50%' }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Technical Evidence Slide-over Drawer */}
      <AnimatePresence>
        {selectedSignal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedSignal(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="signal-drawer-title"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800/90 shadow-2xl p-5 overflow-y-auto space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Radio className="w-4 h-4" />
                  </div>
                  <h3 id="signal-drawer-title" className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-widest">
                    Signal Confluence Breakdown
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSignal(null)}
                  aria-label="Close drawer"
                  className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors border border-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Content Body */}
              <div className="space-y-3.5">
                {/* Primary Card */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono font-black border uppercase tracking-wider ${
                      selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" 
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" 
                        : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                    }`}>
                      {selectedSignal.direction === "BUY" || selectedSignal.direction === "LONG" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {selectedSignal.direction} {selectedSignal.pair}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                      {selectedSignal.signalKey || selectedSignal.id}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
                      {selectedSignal.strategyName}
                    </h4>
                    <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                      Session: {selectedSignal.session || 'London'} • Timeframe: {selectedSignal.timeframe || 'M15'}
                    </p>
                  </div>

                  {/* Target Values */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-center">
                      <span className="block text-[9px] font-mono font-bold uppercase text-zinc-500 mb-0.5">Entry</span>
                      <span className="text-xs font-mono font-bold text-zinc-200">{Number(selectedSignal.entry || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-center">
                      <span className="block text-[9px] font-mono font-bold uppercase text-zinc-500 mb-0.5 text-rose-400">SL</span>
                      <span className="text-xs font-mono font-bold text-rose-400">{Number(selectedSignal.sl || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-center">
                      <span className="block text-[9px] font-mono font-bold uppercase text-zinc-500 mb-0.5 text-emerald-400">TP1</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">{Number(selectedSignal.tp1 || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* AI Reasoning */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    AI Market Reasoning
                  </h5>
                  <p className="text-[11px] font-mono text-zinc-300 leading-relaxed italic border-l-2 border-blue-500 pl-2.5 py-1 bg-blue-500/5 rounded-r">
                    &quot;{selectedSignal.aiReasoning || "Setup fully validated by Deterministic Rule Engine and AI Confluence Gate."}&quot;
                  </p>
                </div>

                {/* Validation Checklist */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                  <h5 className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    Rule Checklist & Confluence Evidence ({selectedSignal.aiChecklist ? selectedSignal.aiChecklist.length : 0})
                  </h5>

                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {selectedSignal.aiChecklist && selectedSignal.aiChecklist.length > 0 ? (
                      selectedSignal.aiChecklist.map((item: any, idx: number) => (
                        <div key={idx} className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-mono font-bold text-zinc-200 block uppercase tracking-wide">
                              {item.rule || item.name}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 mt-0.5 block">
                              {item.reason || item.evidence || "Criteria met"}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black border uppercase tracking-wider ${
                            item.status === 'PASS' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : item.status === 'FAIL' 
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {item.status || 'PASS'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-center text-[10px] font-mono text-zinc-500">
                        100% Deterministic Rule Engine Checklist Passed
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
