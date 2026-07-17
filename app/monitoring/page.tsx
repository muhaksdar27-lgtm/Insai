"use client";

import {
  Activity,
  ListFilter,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Info,
  
  Crosshair,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  Timer,
  Zap,
  CheckSquare,
  Square,
  FileSearch,
  X
} from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useState, useMemo, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getStatusBadge } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

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

export default function Monitoring() {
  const { data: strategies, loading, error, refetch } = useFetch<any[]>("/api/strategies", []);
  
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'STRATEGY_TRANSITION' ) {
        // Debounce refetch to avoid massive rerenders if multiple transitions happen quickly
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          refetch();
        }, 1000);
      }
    };
    window.addEventListener('app-update', handleAppUpdate);
    return () => {
      window.removeEventListener('app-update', handleAppUpdate);
      clearTimeout(timeout);
    };
  }, [refetch]);

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drawerData, setDrawerData] = useState<any | null>(null);

  const renderEvidence = (ruleId: string, evidence: any) => {
    if (!evidence || Object.keys(evidence).length === 0) {
      return <span className="text-[10px] text-zinc-600">No detailed evidence provided for {ruleId}.</span>;
    }
    
    return (
      <div className="grid grid-cols-2 gap-2 mt-1">
        {Object.entries(evidence).map(([k, v]: [string, any], idx) => {
          let displayVal = String(v);
          if (typeof v === 'object' && v !== null) {
            // Check if it's a candle or specific object
            if (v.price !== undefined) displayVal = `Price: ${v.price}`;
            else if (v.type && v.top && v.bottom) displayVal = `${v.type.toUpperCase()} FVG (${v.bottom.toFixed(2)} - ${v.top.toFixed(2)})`;
            else displayVal = JSON.stringify(v);
          } else if (typeof v === 'number') {
            displayVal = v.toFixed(2);
          }
          return (
            <div key={idx} className="flex flex-col bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50 shadow-sm">
              <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-widest">{k.replace(/_/g, ' ')}</span>
              <span className="text-[11px] text-zinc-300 font-mono font-medium truncate mt-0.5">{displayVal}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (['approved', 'signal_active', 'take_partial', 'finished', 'win', 'valid'].some(x => s === x || s.includes(x))) return <CheckCircle2 className="w-4 h-4 text-emerald-500 shadow-sm" />;
    if (['active', 'validated', 'live', 'connected', 'healthy', 'online'].some(x => s === x || s.includes(x))) return <PlayCircle className="w-4 h-4 text-blue-500 shadow-sm" />;
    if (['rejected', 'error', 'disconnected', 'unavailable', 'block', 'invalid'].some(x => s === x || s.includes(x))) return <XCircle className="w-4 h-4 text-rose-500 shadow-sm" />;
    if (['warning', 'stale', 'degraded', 'reconnecting', 'suppressed'].some(x => s === x || s.includes(x))) return <AlertTriangle className="w-4 h-4 text-amber-500 shadow-sm" />;
    if (['expired', 'history', 'awaiting', 'idle', 'cached'].some(x => s === x || s.includes(x))) return <Clock className="w-4 h-4 text-zinc-500" />;
    return <div className="w-4 h-4 rounded-full border-2 border-zinc-700 bg-zinc-900" />;
  };

  const getStepDisplayName = (strategyId: string, stepName: string) => {
    const map: Record<string, Record<string, string>> = {
      'strategy-1-smc': {
        'IDLE': 'Idle', 'WAIT_SESSION': 'Session: London', 'WAIT_TREND': 'Trend: HTF', 
        'WAIT_LEVEL': 'Level: Asia High/Low', 'WAIT_SWEEP': 'Liquidity Sweep', 
        'WAIT_CONFIRMATION': 'CHoCH Confirmation', 'WAIT_RETEST': 'Pullback to FVG/OB', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'TAKE_PARTIAL': 'Take Partial', 'FINISHED': 'Finished'
      },
      'strategy-2-snd': {
        'IDLE': 'Idle', 'WAIT_TREND': 'Trend: MA50/MA200', 'WAIT_LEVEL': 'Zone: Supply/Demand', 
        'WAIT_SWEEP': 'Touch Zone & Imbalance', 'WAIT_CONFIRMATION': 'Engulfing Pattern', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-3-scalping': {
        'IDLE': 'Idle', 'WAIT_TREND': 'Trend: H1', 'WAIT_RETRACEMENT': 'Retracement (M15)', 
        'WAIT_SWEEP': 'Liquidity Sweep', 'WAIT_PATTERN': 'Double Bottom / Top (M1)', 
        'WAIT_NECKLINE_BREAK': 'Neckline Break', 'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-4-news': {
        'IDLE': 'Idle', 'WAIT_NEWS': 'High Impact News', 'WAIT_SWEEP': 'Liquidity Sweep', 
        'WAIT_REJECTION': 'Strong Rejection', 'WAIT_STRUCTURE': 'BOS / Structure Change', 
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      },
      'strategy-5-smc-sd-confluence': {
        'IDLE': 'Idle', 'WAIT_STRUCTURE': 'Market Structure (H1/M15)', 'WAIT_ZONE': 'Zone Detection (M15)',
        'WAIT_SWEEP': 'Liquidity Sweep (M5/M15)', 'WAIT_CONFIRMATION': 'Entry Trigger (M1/M5)',
        'WAIT_AI': 'AI Validation', 'SIGNAL_ACTIVE': 'Signal Active', 'FINISHED': 'Finished'
      }
    };
    return map[strategyId]?.[stepName] || stepName.replace(/_/g, ' ');
  };

  const getSetupStatus = (steps: any[], stratStatus: string) => {
     if (stratStatus === 'stopped' || stratStatus === 'disabled') return 'disabled';
     if (!steps || steps.length === 0) return 'not configured';
     
     const currentStep = [...steps].reverse().find(s => s.status !== 'awaiting') || steps[0];
     
     if (currentStep.status === 'rejected') return 'rejected';
     if (currentStep.status === 'expired') return 'expired';
     if (currentStep.status === 'suppressed') return 'suppressed';

     const stepName = currentStep.name;
     if (['FINISHED', 'TAKE_PARTIAL'].includes(stepName)) return 'finished';
     if (stepName === 'SIGNAL_ACTIVE') return 'approved';
     if (stepName === 'WAIT_AI' && currentStep.status === 'approved') return 'validated';
     if (stepName === 'IDLE') return 'awaiting';
     return 'active';
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredStrategies = useMemo(() => {
    let result = strategies?.filter(s => {
      if (filter !== "all") {
        if (filter === "active" && ['stopped', 'disabled', 'not configured'].includes(s.status?.toLowerCase())) return false;
        if (filter !== "active" && s.status?.toLowerCase() !== filter) return false;
      }
      if (search) {
        if (!s.name?.toLowerCase().includes(search.toLowerCase()) && !s.id?.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    }) || [];

    result = result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === "updatedAt") {
        aVal = new Date(a.updatedAt || 0).getTime();
        bVal = new Date(b.updatedAt || 0).getTime();
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [strategies, filter, search, sortField, sortDir]);

  return (
    <div className="space-y-8 h-full pb-20 relative">
      {/* Compact summary bar */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-5 border-b border-zinc-800/80 pb-6"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
            <h2 className="text-[13px] font-bold text-zinc-100 flex items-center gap-2.5 tracking-wide">
                <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 shadow-sm">
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                SCAN & MONITORING
            </h2>
            <div className="flex items-center gap-2 mt-2">
                <p className="text-[11px] text-zinc-500 tracking-wide">Urutan setup per strategi</p>
                <span className="text-[11px] text-zinc-700">•</span>
                <span className="text-[11px] font-bold text-zinc-400 tracking-wider bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800">{filteredStrategies?.length || 0} STRATEGIES</span>
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800/80 rounded-xl px-3 py-2.5 min-h-[40px] shadow-sm focus-within:border-zinc-600 transition-colors">
                    <Search className="w-4 h-4 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search strategy..." 
                      className="bg-transparent border-none outline-none text-[11px] font-medium text-zinc-300 w-32 md:w-48 placeholder:text-zinc-600 focus:ring-0 tracking-wide"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <select 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-[11px] font-bold tracking-wide text-zinc-300 hover:bg-zinc-800 transition-colors focus:outline-none min-h-[40px] shadow-sm appearance-none cursor-pointer"
                    >
                        <option value="all">Filter: All</option>
                        <option value="active">Active Only</option>
                        <option value="stopped">Stopped Only</option>
                    </select>
                    <select 
                        value={sortDir}
                        onChange={(e) => setSortDir(e.target.value)}
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl text-[11px] font-bold tracking-wide text-zinc-300 hover:bg-zinc-800 transition-colors focus:outline-none min-h-[40px] shadow-sm appearance-none cursor-pointer"
                    >
                        <option value="desc">Sort: Newest First</option>
                        <option value="asc">Sort: Oldest First</option>
                    </select>
                </div>
            </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-blue-400 rounded-full animate-spin mb-5 shadow-sm"></div>
          <p className="text-[12px] text-zinc-500 font-bold tracking-widest uppercase">Scanning strategies...</p>
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
          className="flex flex-col gap-6"
        >
          {filteredStrategies?.slice(0, 50).map((strategy) => {
            const ctx = strategy.context || {};
            const ruleResults = strategy.ruleResults || {};
            const rulesArray = Object.values(ruleResults) as any[];
            const setupStatus = getSetupStatus(strategy.steps, strategy.status);
            const isCollapsed = collapsed[strategy.id];
            
            // Calculate progress
            const totalSteps = strategy.steps?.length || 0;
            const completedSteps = strategy.steps?.filter((s:any) => s.status === 'approved' || s.status === 'validated').length || 0;
            const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

            const timeStr = <ClientDate date={strategy.updatedAt} format="toLocaleTimeString" />;

            return (
              <motion.div
                variants={itemVariants}
                key={strategy.id}
                className={`bg-zinc-900/30 border border-zinc-800/80 rounded-2xl flex flex-col transition-all hover:border-zinc-700/80 hover:bg-zinc-900/60 shadow-sm backdrop-blur-sm ${strategy.status === "stopped" ? "opacity-60 grayscale-[50%]" : ""}`}
              >
                {/* Header (Collapsible) */}
                <div 
                    className="p-5 md:p-6 border-b border-zinc-800/60 flex justify-between items-start cursor-pointer transition-colors group"
                    onClick={() => toggleCollapse(strategy.id)}
                >
                  <div className="flex-1 pr-5">
                    <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-[13px] font-bold text-zinc-100 flex items-center gap-2 tracking-wide group-hover:text-white transition-colors">
                        {strategy.name || strategy.id}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider shadow-sm ${getStatusBadge(setupStatus)}`}>
                        {setupStatus}
                        </span>
                        {strategy.freshness && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider shadow-sm ${getStatusBadge(strategy.freshness)}`}>
                            {strategy.freshness}
                            </span>
                        )}
                        {strategy.suppression && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border border-amber-500/20 text-amber-400 bg-amber-500/10 uppercase tracking-wider shadow-sm">
                            Suppressed
                            </span>
                        )}
                    </div>
                    
                    {/* Mini Status Chips */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500 font-medium">
                        <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-zinc-600" /> TF: <span className="text-zinc-300 font-mono">{strategy.timeframe || 'N/A'}</span></span>
                        <span className="flex items-center gap-2"><Timer className="w-4 h-4 text-zinc-600" /> Session: <span className="text-zinc-300">{strategy.session || 'N/A'}</span></span>
                        <span className="flex items-center gap-2">
                            {strategy.marketBias === 'buy' ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : strategy.marketBias === 'sell' ? <TrendingDown className="w-4 h-4 text-rose-500" /> : <Activity className="w-4 h-4 text-zinc-600" />}
                            Bias: <span className="text-zinc-300 capitalize">{strategy.marketBias || 'N/A'}</span>
                        </span>
                        <span className="flex items-center gap-2"><History className="w-4 h-4 text-zinc-600" /> Updated: <span className="text-zinc-300 font-mono">{timeStr}</span></span>
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-5 flex items-center gap-4">
                        <div className="flex-1 h-2 bg-zinc-950/80 rounded-full overflow-hidden border border-zinc-800/80 shadow-inner">
                            <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-700 ease-out relative" style={{ width: `${progressPct}%` }}>
                                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>
                        <span className="text-[11px] text-zinc-400 font-mono font-bold w-10 text-right tracking-wide">{Math.round(progressPct)}%</span>
                    </div>

                  </div>
                  
                  <div className="flex items-center pt-2">
                      <div className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
                        {isCollapsed ? <ChevronDown className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300" /> : <ChevronUp className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300" />}
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
                        <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 bg-zinc-950/20">
                        
                        {/* Left Column: Timeline & Steps */}
                        <div className="flex flex-col h-full">
                            <h4 className="text-[11px] font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                              <ListFilter className="w-3.5 h-3.5 text-zinc-500" /> Step Timeline
                            </h4>
                            
                            {strategy.steps && strategy.steps.length > 0 ? (
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 flex-1 relative shadow-sm">
                                <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[9px] before:w-px before:bg-zinc-800/80">
                                {strategy.steps.map((step: any, idx: number) => {
                                    const isActive = step.status === 'active';
                                    const isPast = step.status === 'approved' || step.status === 'validated';
                                    return (
                                    <div
                                        key={idx}
                                        className={`flex items-start gap-4 relative z-10 transition-all duration-300 ${isActive ? 'opacity-100 scale-100' : isPast ? 'opacity-70 scale-95 origin-left' : 'opacity-40 scale-95 origin-left'}`}
                                    >
                                        <div className="pt-0.5 bg-zinc-950/50 rounded-full shadow-sm">
                                        {getStatusIcon(step.status)}
                                        </div>
                                        <div className="flex-1 pb-1">
                                        <span
                                            className={`text-[12px] font-bold leading-none block tracking-wide ${isActive ? "text-blue-400" : isPast ? "text-zinc-300" : "text-zinc-500"}`}
                                        >
                                            {getStepDisplayName(strategy.id, step.name)}
                                        </span>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span
                                            className={`text-[9px] uppercase tracking-wider font-bold shadow-sm ${getStatusBadge(step.status).split(' ')[0]}`}
                                            >
                                            {step.status}
                                            </span>
                                        </div>
                                        </div>
                                    </div>
                                    );
                                })}
                                </div>
                            </div>
                            ) : (
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 text-center text-zinc-500 text-[11px] font-medium flex-1 flex flex-col justify-center border-dashed">
                                No steps available
                            </div>
                            )}
                        </div>

                        {/* Right Column: Setup Details, Rules & AI */}
                        <div className="flex flex-col gap-5">
                            {/* Setup Context */}
                            <div>
                            <h4 className="text-[11px] font-bold text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                                <Crosshair className="w-3.5 h-3.5 text-zinc-500" /> Setup Params
                            </h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 grid grid-cols-2 gap-y-3 gap-x-4 shadow-sm">
                                <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">ENTRY</span>
                                <span className="text-[12px] text-zinc-200 font-mono font-medium tracking-wide">
                                    {ctx.entryPrice ? ctx.entryPrice.toFixed(2) : <span className="text-zinc-600 font-sans text-[10px] tracking-normal">waiting</span>}
                                </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">SL</span>
                                <span className="text-[12px] text-rose-400 font-mono font-medium tracking-wide">
                                    {ctx.slPrice ? ctx.slPrice.toFixed(2) : <span className="text-zinc-600 font-sans text-[10px] tracking-normal">waiting</span>}
                                </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">TP1</span>
                                <span className="text-[12px] text-emerald-400 font-mono font-medium tracking-wide">
                                    {ctx.tp1Price ? ctx.tp1Price.toFixed(2) : <span className="text-zinc-600 font-sans text-[10px] tracking-normal">waiting</span>}
                                </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">TP2</span>
                                <span className="text-[12px] text-emerald-500 font-mono font-medium tracking-wide">
                                    {ctx.tp2Price ? ctx.tp2Price.toFixed(2) : <span className="text-zinc-600 font-sans text-[10px] tracking-normal">waiting</span>}
                                </span>
                                </div>
                                <div className="col-span-2 flex items-center justify-between pt-3 border-t border-zinc-800/60 mt-1">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">R:R RATIO</span>
                                        <span className="text-[12px] text-blue-400 font-mono font-medium tracking-wide">
                                            {ctx.entryPrice && ctx.tp1Price && ctx.slPrice 
                                            ? `1 : ${Math.abs((ctx.tp1Price - ctx.entryPrice) / (ctx.entryPrice - ctx.slPrice)).toFixed(2)}`
                                            : <span className="text-zinc-600 font-sans text-[10px] tracking-normal">calculating...</span>}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-right">
                                        <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">SIGNAL KEY</span>
                                        <span className="text-[10px] text-zinc-400 font-mono font-medium bg-zinc-950/80 px-2 py-1 rounded-md border border-zinc-800/80 shadow-sm">
                                            {strategy.signalKey || 'none'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            </div>

                            {/* Rule Validation Checklist */}
                            <div className="flex-1 flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-[11px] font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-widest">
                                    <CheckSquare className="w-3.5 h-3.5 text-zinc-500" /> Rule Validations
                                </h4>
                                <button 
                                    onClick={() => setDrawerData(strategy)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-900/50 hover:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-800/80 shadow-sm"
                                >
                                    <FileSearch className="w-3.5 h-3.5" /> View Evidence
                                </button>
                            </div>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 flex-1 overflow-y-auto max-h-56 shadow-sm">
                                {rulesArray.length > 0 ? (
                                <ul className="space-y-3">
                                    {rulesArray.map((rule, rIdx) => (
                                    <li key={rIdx} className="flex items-start gap-3">
                                        <div className="pt-0.5">
                                            {rule.status === 'valid' ? <CheckSquare className="w-4 h-4 text-emerald-500 shadow-sm rounded-sm" /> : <Square className="w-4 h-4 text-zinc-600" />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-zinc-300 break-all tracking-wide">{rule.ruleId}</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider shadow-sm ${getStatusBadge(rule.status).split(' ')[0]}`}>{rule.status}</span>
                                            </div>
                                            {rule.invalidations?.length > 0 && (
                                            <div className="text-[10px] text-rose-400/90 mt-1.5 leading-relaxed font-medium bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                                                {rule.invalidations.join(', ')}
                                            </div>
                                            )}
                                        </div>
                                    </li>
                                    ))}
                                </ul>
                                ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <Info className="w-5 h-5 text-zinc-600 mb-2" />
                                    <span className="text-[11px] text-zinc-500 font-medium">
                                    No rules validated yet.
                                    </span>
                                </div>
                                )}
                            </div>
                            </div>

                            {/* AI Validation */}
                            {(strategy.aiDecision || ctx.confidence || ctx.aiConfidence) && (
                                <div className="flex-shrink-0 mt-2">
                                    <h4 className="text-[11px] font-bold text-zinc-400 mb-3 flex items-center gap-2 uppercase tracking-widest">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" /> AI Validation
                                    </h4>
                                    <div className={`p-4 rounded-xl border shadow-sm ${strategy.aiDecision?.toLowerCase() === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20' : strategy.aiDecision?.toLowerCase() === 'rejected' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`text-[11px] font-black tracking-wider uppercase ${strategy.aiDecision?.toLowerCase() === 'approved' ? 'text-emerald-400' : strategy.aiDecision?.toLowerCase() === 'rejected' ? 'text-rose-400' : 'text-blue-400'}`}>
                                                Decision: {strategy.aiDecision || 'PENDING'}
                                            </span>
                                            {(ctx.confidence || ctx.aiConfidence) && (
                                                <span className="text-[10px] font-mono font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded-md shadow-sm">
                                                    Confidence: {ctx.confidence || ctx.aiConfidence}%
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-zinc-300 font-medium italic opacity-80">
                                            AI analysis complete. Check evidence drawer for deep reasoning if rejected.
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
                  className="w-full max-w-md bg-zinc-950/95 border-l border-zinc-800/80 h-full flex flex-col shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-6 md:p-8 border-b border-zinc-800/80">
                        <h3 className="text-[12px] font-bold text-zinc-100 flex items-center gap-2.5 uppercase tracking-widest">
                            <FileSearch className="w-4 h-4 text-zinc-400" />
                            Evidence & Details
                        </h3>
                        <button onClick={() => setDrawerData(null)} className="p-1.5 hover:bg-zinc-800/80 rounded-md transition-colors text-zinc-400 hover:text-zinc-200">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-8">
                        
                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Strategy Details</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 space-y-3 shadow-sm">
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Name</span>
                                    <span className="text-zinc-200 font-bold tracking-wide">{drawerData.name}</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Signal Key</span>
                                    <span className="text-zinc-300 font-mono font-medium bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">{drawerData.signalKey || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Timeframe</span>
                                    <span className="text-zinc-300 font-mono font-medium">{drawerData.timeframe || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Risk & Target Section */}
                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Risk & Targets</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 space-y-3 shadow-sm">
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Direction</span>
                                    <span className={`font-black tracking-wider uppercase ${drawerData.context?.direction === 'buy' ? 'text-emerald-400' : drawerData.context?.direction === 'sell' ? 'text-rose-400' : 'text-zinc-400'}`}>
                                        {drawerData.context?.direction || 'TBD'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Entry Price</span>
                                    <span className="text-zinc-300 font-mono font-bold tracking-wide">{drawerData.context?.entryPrice?.toFixed(2) || 'TBD'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Stop Loss</span>
                                    <span className="text-rose-400 font-mono font-bold tracking-wide">{drawerData.context?.slPrice?.toFixed(2) || 'TBD'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500 font-medium tracking-wide">Take Profit (TP1)</span>
                                    <span className="text-emerald-400 font-mono font-bold tracking-wide">{drawerData.context?.tp1Price?.toFixed(2) || 'TBD'}</span>
                                </div>
                                {drawerData.context?.tp2Price && (
                                  <div className="flex justify-between items-center text-[11px]">
                                      <span className="text-zinc-500 font-medium tracking-wide">Take Profit (TP2)</span>
                                      <span className="text-emerald-400 font-mono font-bold tracking-wide">{drawerData.context?.tp2Price.toFixed(2)}</span>
                                  </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">AI Reasoning (If available)</h4>
                            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 shadow-sm">
                                {drawerData.aiDecision && (
                                    <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-zinc-800/80 pb-4">
                                        <span className={`text-[11px] font-black tracking-wider uppercase ${drawerData.aiDecision?.toLowerCase() === 'approved' ? 'text-emerald-400' : drawerData.aiDecision?.toLowerCase() === 'rejected' ? 'text-rose-400' : 'text-blue-400'}`}>
                                            Decision: {drawerData.aiDecision}
                                        </span>
                                        {(drawerData.context?.confidence || drawerData.context?.aiConfidence) && (
                                              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md shadow-sm">
                                                  Confidence: {drawerData.context.confidence || drawerData.context.aiConfidence}%
                                              </span>
                                        )}
                                    </div>
                                )}
                                {drawerData.context?.aiReasoning ? (
                                    <p className="text-[11px] text-zinc-300 leading-relaxed font-medium italic border-l-2 border-blue-500/60 pl-4 py-1">
                                        &quot;{drawerData.context.aiReasoning}&quot;
                                    </p>
                                ) : (
                                    <span className="text-[11px] text-zinc-500 font-medium">No AI reasoning recorded for this state.</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Rule Evidence Data</h4>
                            <div className="space-y-4">
                                {Object.values(drawerData.ruleResults || {}).map((rule: any, i) => (
                                    <div key={i} className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 shadow-sm">
                                        <div className="flex justify-between items-center mb-3 border-b border-zinc-800/50 pb-3">
                                            <span className="text-[12px] font-bold text-zinc-200 tracking-wide">{rule.ruleId}</span>
                                            <span className={`text-[9px] uppercase tracking-wider font-bold shadow-sm ${getStatusBadge(rule.status).split(' ')[0]}`}>{rule.status}</span>
                                        </div>
                                        <div className="mt-3">
                                            {renderEvidence(rule.ruleId, rule.evidence)}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(drawerData.ruleResults || {}).length === 0 && (
                                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-6 text-center border-dashed">
                                        <span className="text-[11px] text-zinc-500 font-medium">No evidence data available.</span>
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
