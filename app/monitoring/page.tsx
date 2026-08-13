"use client";

import { useEffect, useState, useMemo } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { 
  Activity, Clock, Timer, History, 
  TrendingUp, TrendingDown, Target, Shield,
  CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle,
  Zap, Search, ChevronDown, ChevronUp, Layers, Check,
  Cpu
} from "lucide-react";
import { StrategyResponse, StrategyStep } from "@/types";
import { getAllStrategiesWithFallback, normalizeStrategy, buildTimeline, buildSetup, buildRules } from "@/lib/strategyViewModel";

const CANONICAL_ORDER = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

const STRATEGY_LABELS: Record<string, { shortName: string; tf: string; session: string }> = {
  'strategy-1-smc': { shortName: 'SMC + London + M15', tf: 'H1 Bias / M15 Entry', session: 'London' },
  'strategy-2-snd': { shortName: 'Supply & Demand + Engulfing', tf: 'D1/H1 Bias / M15 Entry', session: 'Any Session' },
  'strategy-3-scalping': { shortName: 'Scalping SMC + M1 Sweep', tf: 'H1 Trend / M1 Entry', session: 'Any Session' },
  'strategy-4-news': { shortName: 'News Sweep Reversal', tf: 'M15 Context / M1 Entry', session: 'News Window' },
  'strategy-5-smc-sd-confluence': { shortName: 'SMC-SD Confluence', tf: 'H1/M15 Structure / M5 Entry', session: 'Any Session' }
};

const RULE_NAME_LABELS: Record<string, string> = {
  rule_pair_restriction: 'Pair Restriction (XAUUSD)',
  rule_session_restriction: 'Session Window Restriction',
  rule_h1_trend: 'H1 Higher Timeframe Trend Alignment',
  rule_liquidity_sweep: 'Liquidity Sweep Confirmation',
  rule_choch_confirmation: 'M15 CHoCH Structural Break',
  rule_ob_fvg_entry: 'OB / FVG Point of Interest Entry',
  rule_spread_check: 'Spread Tolerance Check',
  rule_atr_sl_buffer: 'ATR Stop Loss Buffer Protection',
  rule_risk_reward: 'Minimum 1:2 Risk / Reward Check',
  rule_sd_zone: 'Supply & Demand Zone Alignment',
  rule_engulfing_trigger: 'Candlestick Engulfing Trigger',
  rule_scalp_pattern: 'M1 Double Top / Bottom Pattern',
  rule_news_reversal: 'Post-News Spike Reversal Check',
  rule_confluence_overlap: 'Multi-Level Confluence Overlap'
};

function formatTime(dateString?: string | Date | null) {
  if (!dateString) return "--:--:--";
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'approved' || s === 'dispatched') return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> APPROVED
    </span>
  );
  if (s === 'validated' || s === 'passed') return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 uppercase tracking-wider flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3 text-blue-400" /> VALIDATED
    </span>
  );
  if (s === 'active' || s === 'scanning' || s === 'setup_found') return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider animate-pulse flex items-center gap-1">
      <Loader2 className="w-3 h-3 text-amber-400 animate-spin" /> ACTIVE SCAN
    </span>
  );
  if (s === 'rejected' || s === 'failed') return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase tracking-wider flex items-center gap-1">
      <XCircle className="w-3 h-3 text-rose-400" /> REJECTED
    </span>
  );
  if (s === 'expired') return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/30 uppercase tracking-wider flex items-center gap-1">
      <XCircle className="w-3 h-3 text-orange-400" /> EXPIRED
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 uppercase tracking-wider flex items-center gap-1">
      <Clock className="w-3 h-3 text-zinc-500" /> AWAITING
    </span>
  );
}

function StepBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">APPROVED</span>;
  if (s === 'validated') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider">VALIDATED</span>;
  if (s === 'active') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider animate-pulse">ACTIVE</span>;
  if (s === 'rejected') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase tracking-wider">REJECTED</span>;
  if (s === 'expired') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wider">EXPIRED</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase tracking-wider">AWAITING</span>;
}

function SequentialStepTimeline({ steps }: { steps: StrategyStep[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, idx) => {
        const s = (step.status || '').toLowerCase();
        const isActive = s === 'active';
        const isApproved = s === 'approved';
        const isValidated = s === 'validated';
        const isRejected = s === 'rejected';
        const isExpired = s === 'expired';

        let bgCls = 'bg-zinc-950/40 border-zinc-800/60 text-zinc-500';
        let icon = <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-500">{idx + 1}</span>;

        if (isApproved) {
          bgCls = 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300';
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
        } else if (isValidated) {
          bgCls = 'bg-blue-950/30 border-blue-500/30 text-blue-300';
          icon = <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />;
        } else if (isActive) {
          bgCls = 'bg-amber-950/30 border-amber-500/40 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)]';
          icon = <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />;
        } else if (isRejected) {
          bgCls = 'bg-rose-950/30 border-rose-500/30 text-rose-300';
          icon = <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
        } else if (isExpired) {
          bgCls = 'bg-orange-950/30 border-orange-500/30 text-orange-300';
          icon = <XCircle className="w-4 h-4 text-orange-400 shrink-0" />;
        }

        return (
          <div key={step.id || idx} className={`flex items-center justify-between p-2 rounded border ${bgCls} transition-all`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold tracking-wide truncate">{step.name}</span>
                <span className="text-[9px] text-zinc-500 font-mono">Step {idx + 1} of 9</span>
              </div>
            </div>
            <StepBadge status={s} />
          </div>
        );
      })}
    </div>
  );
}

function SetupParametersGrid({ setup }: { setup: any }) {
  const isBuy = setup.direction === 'BUY' || setup.direction === 'LONG';
  const isSell = setup.direction === 'SELL' || setup.direction === 'SHORT';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Arah Trade</span>
          <span className={`text-[12px] font-black uppercase tracking-wider flex items-center gap-1 ${isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-zinc-400'}`}>
             {isBuy && <TrendingUp className="w-3.5 h-3.5" />}
             {isSell && <TrendingDown className="w-3.5 h-3.5" />}
             {setup.direction || '--'}
          </span>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Entry Price</span>
          <span className="text-[12px] font-mono font-bold text-zinc-100">{setup.entry && setup.entry !== '--' ? setup.entry : '--'}</span>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3 text-rose-500"/> Stop Loss
          </span>
          <span className="text-[12px] font-mono font-bold text-rose-400">{setup.sl && setup.sl !== '--' ? setup.sl : '--'}</span>
        </div>
        <div className="bg-zinc-950/80 p-2.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
            <Target className="w-3 h-3 text-emerald-500"/> Take Profit
          </span>
          <span className="text-[12px] font-mono font-bold text-emerald-400">{setup.tp && setup.tp !== '--' ? setup.tp : '--'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/60 flex items-center justify-between">
          <span className="text-zinc-500 font-bold uppercase tracking-wider">Risk : Reward</span>
          <span className="font-mono font-bold text-zinc-200">{setup.rr || '--'}</span>
        </div>
        <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/60 flex items-center justify-between">
          <span className="text-zinc-500 font-bold uppercase tracking-wider">Bias H1</span>
          <span className="font-bold text-zinc-200 uppercase">{setup.bias || setup.marketBias || '--'}</span>
        </div>
        <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/60 flex items-center justify-between">
          <span className="text-zinc-500 font-bold uppercase tracking-wider">Sweep Status</span>
          <span className="font-bold text-zinc-300 truncate ml-1">{setup.sweepStatus || '--'}</span>
        </div>
        <div className="bg-zinc-950/50 p-2 rounded border border-zinc-800/60 flex items-center justify-between">
          <span className="text-zinc-500 font-bold uppercase tracking-wider">Trigger Confirm</span>
          <span className="font-bold text-zinc-300 truncate ml-1">{setup.confirmationStatus || '--'}</span>
        </div>
      </div>
    </div>
  );
}

function RulesValidationChecklist({ rules }: { rules: any[] }) {
  if (!rules || rules.length === 0) {
    return <div className="text-[10px] text-zinc-500 italic p-3 text-center border border-dashed border-zinc-800 rounded">Tidak ada aturan validasi terdaftar</div>;
  }

  return (
    <div className="space-y-1.5">
      {rules.map((rule: any, idx: number) => {
        const isPass = rule.passed || rule.status === 'valid' || rule.status === 'validated';
        const isFail = rule.status === 'invalid' || rule.status === 'failed' || rule.status === 'rejected';

        let badge = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase">AWAITING</span>;
        if (isPass) {
          badge = <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase flex items-center gap-1"><Check className="w-2.5 h-2.5" /> PASS</span>;
        } else if (isFail) {
          badge = <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> FAIL</span>;
        }

        const label = RULE_NAME_LABELS[rule.ruleId] || rule.ruleId || rule.name || `Aturan ${idx + 1}`;

        return (
          <div key={rule.ruleId || idx} className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/80 text-[11px]">
            <span className="font-mono text-zinc-300 font-medium truncate pr-2">{label}</span>
            {badge}
          </div>
        );
      })}
    </div>
  );
}

export default function MonitoringPage() {
  const { data: rawStrategies, loading, error, refetch } = useFetch<StrategyResponse[]>("/api/strategies", []);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("ALL");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleAppUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === 'STRATEGY_TRANSITION') {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          refetch();
        }, 800);
      }
    };
    window.addEventListener('app-update', handleAppUpdate as EventListener);
    return () => {
      window.removeEventListener('app-update', handleAppUpdate as EventListener);
      clearTimeout(timeout);
    };
  }, [refetch]);

  const triggerScan = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/market/scan', { method: 'POST' });
      await refetch();
    } catch (err) {
      console.error("Scan trigger failed", err);
    } finally {
      setIsScanning(false);
    }
  };

  const toggleRules = (id: string) => {
    setExpandedRules(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const strategies = useMemo(() => {
    const fullList = getAllStrategiesWithFallback(rawStrategies || []);
    const normalized = fullList.map(normalizeStrategy);
    return normalized.sort((a, b) => {
      const idxA = CANONICAL_ORDER.indexOf(a.id);
      const idxB = CANONICAL_ORDER.indexOf(b.id);
      return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });
  }, [rawStrategies]);

  const filteredStrategies = useMemo(() => {
    return strategies.filter(s => {
      if (selectedStrategyId !== "ALL" && s.id !== selectedStrategyId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchId = (s.id || '').toLowerCase().includes(q);
        const matchSignal = (s.signal || '').toLowerCase().includes(q);
        return matchName || matchId || matchSignal;
      }
      return true;
    });
  }, [strategies, selectedStrategyId, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    let active = 0;
    let approved = 0;
    let rejected = 0;

    strategies.forEach(s => {
      if (s.setupStatus === 'approved' || s.currentStep === 'DISPATCHED') approved++;
      else if (s.setupStatus === 'active' || s.setupStatus === 'scanning') active++;
      else if (s.setupStatus === 'rejected' || s.setupStatus === 'expired') rejected++;
    });

    return { total: strategies.length, active, approved, rejected };
  }, [strategies]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col p-10 bg-black text-center">
         <AlertTriangle className="w-12 h-12 text-rose-500 mb-3 animate-bounce" />
         <h2 className="text-sm font-bold text-rose-400 tracking-wider uppercase font-mono">Gagal Mengisi Data Strategi</h2>
         <p className="text-xs text-zinc-500 mt-2 max-w-md">{error.message}</p>
         <button onClick={refetch} className="mt-6 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-bold uppercase tracking-widest rounded border border-zinc-700 transition-all">Hubungkan Ulang</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-5 pb-12 font-sans bg-black text-zinc-100">
      
      {/* Header & Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            <h1 className="text-sm font-black text-zinc-100 tracking-widest uppercase font-mono">
              Scanner & Monitoring Signal
            </h1>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
            Deteksi Setup Real-Time — 5 Strategi Sesuai PRD
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={triggerScan}
            disabled={isScanning}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded border border-blue-400/30 transition-all shadow-lg shadow-blue-900/20"
          >
            <Zap className={`w-3.5 h-3.5 ${isScanning ? 'animate-bounce text-amber-300' : ''}`} />
            {isScanning ? 'Jalankan Scan...' : 'Scan Sekarang'}
          </button>
          
          <button 
            onClick={refetch}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded hover:bg-zinc-800 hover:text-white transition-all text-zinc-300"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-0.5">Total Strategi</span>
            <span className="text-base font-mono font-black text-zinc-100">{stats.total} Active</span>
          </div>
          <Layers className="w-5 h-5 text-zinc-600" />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-0.5">Sedang Scanning</span>
            <span className="text-base font-mono font-black text-amber-400">{stats.active}</span>
          </div>
          <Cpu className="w-5 h-5 text-amber-500" />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-0.5">Setup Approved</span>
            <span className="text-base font-mono font-black text-emerald-400">{stats.approved}</span>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold block mb-0.5">Setup Rejected</span>
            <span className="text-base font-mono font-black text-rose-400">{stats.rejected}</span>
          </div>
          <XCircle className="w-5 h-5 text-rose-500" />
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950 p-2 border border-zinc-800/80 rounded">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedStrategyId("ALL")}
            className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${selectedStrategyId === "ALL" ? 'bg-blue-600 text-white shadow' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            SEMUA STRATEGI (5)
          </button>
          {CANONICAL_ORDER.map((id, idx) => (
            <button
              key={id}
              onClick={() => setSelectedStrategyId(id)}
              className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${selectedStrategyId === id ? 'bg-blue-600 text-white shadow' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              STRAT {idx + 1}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Cari strategi atau signal key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Strategy Cards Container */}
      <div className="flex flex-col gap-5">
        {filteredStrategies.map((strat, idx) => {
          const steps = buildTimeline(strat);
          const setup = buildSetup(strat);
          const rules = buildRules(strat);
          const labelInfo = STRATEGY_LABELS[strat.id] || { shortName: strat.name, tf: '--', session: '--' };
          const isRulesExpanded = expandedRules[strat.id] ?? true;

          return (
            <div key={strat.id} className="bg-zinc-950 border border-zinc-800/90 rounded-lg overflow-hidden flex flex-col shadow-2xl">
               
               {/* Strategy Card Header */}
               <div className="bg-zinc-900/80 p-3.5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest rounded font-mono">
                        STRATEGI {idx + 1} / 5
                      </span>
                      <h2 className="text-xs font-black text-zinc-100 tracking-wider uppercase font-mono">{strat.name || strat.id}</h2>
                      <StatusBadge status={strat.setupStatus} />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-snug">{strat.description}</p>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-[10px] text-zinc-400 font-mono font-bold">
                      <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-blue-400" /> Timeframe: <span className="text-zinc-200">{labelInfo.tf}</span></span>
                      <span className="flex items-center gap-1.5"><Timer className="w-3 h-3 text-amber-400" /> Sesi: <span className="text-zinc-200">{labelInfo.session}</span></span>
                      <span className="flex items-center gap-1.5"><History className="w-3 h-3 text-zinc-500" /> Waktu Log: <span className="text-zinc-200">{formatTime(strat.updatedAt)}</span></span>
                    </div>
                  </div>

                  <div className="flex flex-col lg:items-end justify-center bg-black/60 p-2.5 rounded border border-zinc-800/80 shrink-0">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold mb-1">Single Signal Record Key</span>
                    <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-[220px]">
                      {strat.signal || 'AWAITING_SETUP'}
                    </span>
                  </div>
               </div>

               {/* Card Body - Multi Column Layout */}
               <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
                  
                  {/* Column 1: Setup Sequence Workflow (Steps 1 to 9) */}
                  <div className="lg:col-span-5 flex flex-col gap-2 border-r-0 lg:border-r border-zinc-800/60 lg:pr-5">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-1">
                      <h3 className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                        <Layers className="w-3.5 h-3.5 text-blue-400" />
                        Urutan Setup Sekuensial (Step 1 - 9)
                      </h3>
                      <span className="text-[9px] text-zinc-500 font-mono font-bold">Tanpa Lompat Step</span>
                    </div>
                    <SequentialStepTimeline steps={steps} />
                  </div>

                  {/* Column 2: Parameters & Validation Rules & AI Decision */}
                  <div className="lg:col-span-7 flex flex-col gap-4">
                     
                     {/* Section: Setup Parameters */}
                     <div>
                       <h3 className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2 border-b border-zinc-800 pb-1.5 flex items-center gap-1.5 font-mono">
                         <Target className="w-3.5 h-3.5 text-emerald-400" />
                         Parameter Deteksi Setup
                       </h3>
                       <SetupParametersGrid setup={setup} />
                     </div>

                     {/* Section: Rules Engine Checklist */}
                     <div>
                       <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-2">
                         <h3 className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                           <Shield className="w-3.5 h-3.5 text-amber-400" />
                           Aturan Validasi
                         </h3>
                         <button 
                           onClick={() => toggleRules(strat.id)}
                           className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 font-mono font-bold"
                         >
                           {isRulesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                           {isRulesExpanded ? 'Sembunyikan' : 'Tampilkan'}
                         </button>
                       </div>
                       
                       {isRulesExpanded && (
                         <RulesValidationChecklist rules={rules} />
                       )}
                     </div>

                     {/* Section: AI Confluence Gate */}
                     <div className="mt-auto pt-2 border-t border-zinc-800/80">
                       <h3 className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-mono">
                         <Cpu className="w-3.5 h-3.5 text-blue-400" />
                         AI Confluence Validation Gate
                       </h3>
                       
                       {(strat.aiDecision || setup.aiDecision) ? (
                         <div className={`p-3 rounded border flex flex-col gap-2 ${
                            (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'bg-emerald-950/20 border-emerald-500/30' : 
                            (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'bg-rose-950/20 border-rose-500/30' : 
                            'bg-blue-950/20 border-blue-500/30'
                         }`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-black uppercase tracking-widest ${
                                 (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'approved' ? 'text-emerald-400' : 
                                 (strat.aiDecision || setup.aiDecision)?.toLowerCase() === 'rejected' ? 'text-rose-400' : 
                                 'text-blue-400'
                              }`}>
                                Keputusan AI: {strat.aiDecision || setup.aiDecision}
                              </span>
                              {(setup.confidence || setup.aiConfidence) && (
                                <span className="text-[10px] font-mono font-bold text-amber-300 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded">
                                  Confidence: {setup.confidence || setup.aiConfidence}%
                                </span>
                              )}
                            </div>
                            {setup.aiReasoning && (
                               <p className="text-[10px] text-zinc-300 italic opacity-90 border-l-2 border-zinc-600 pl-2 leading-relaxed">
                                 &quot;{setup.aiReasoning}&quot;
                               </p>
                            )}
                         </div>
                       ) : (
                         <div className="bg-zinc-950 border border-dashed border-zinc-800 rounded p-3 text-center">
                           <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center justify-center gap-2 font-mono">
                             <Clock className="w-3.5 h-3.5 text-zinc-600" />
                             Menunggu Evaluasi AI Confluence Gate
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
