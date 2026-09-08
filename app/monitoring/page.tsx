"use client";

import { useState, useMemo } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { 
  Activity, Clock, Timer, History, 
  CheckCircle2, XCircle, Loader2, RotateCw, AlertTriangle,
  Zap, Search, Layers, Cpu, ShieldCheck, AlertCircle,
  Crosshair, Target, ChevronDown, ChevronUp
} from "lucide-react";
import { StrategyResponse } from "@/types";
import { getAllStrategiesWithFallback, normalizeStrategy, buildTimeline } from "@/lib/strategyViewModel";

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

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  if (s === 'APPROVED' || s === 'SIGNAL_ACTIVE' || s === 'DISPATCHED') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" /> {s === 'SIGNAL_ACTIVE' ? 'SIGNAL ACTIVE' : 'APPROVED'}
      </span>
    );
  }
  if (s === 'AI_PENDING') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/15 text-purple-300 border border-purple-500/30 uppercase tracking-wider flex items-center gap-1 font-mono">
        <Loader2 className="w-3 h-3 text-purple-400 animate-spin shrink-0" /> EVALUASI AI
      </span>
    );
  }
  if (s === 'VALIDATED' || s === 'PASSED') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wider flex items-center gap-1 font-mono">
        <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" /> TERVALIDASI
      </span>
    );
  }
  if (s === 'DATABASE_UNAVAILABLE' || s === 'NOT_CONFIGURED') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-zinc-900 text-rose-400 border border-rose-900/50 uppercase tracking-wider flex items-center gap-1 font-mono">
        <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" /> DB UNAVAILABLE
      </span>
    );
  }
  if (s === 'REJECTED' || s === 'FAILED' || s === 'INVALIDATED') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30 uppercase tracking-wider flex items-center gap-1 font-mono">
        <XCircle className="w-3 h-3 text-rose-400 shrink-0" /> {s === 'INVALIDATED' ? 'TERINVALIDASI' : 'DITOLAK'}
      </span>
    );
  }
  if (s === 'EXPIRED') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30 uppercase tracking-wider flex items-center gap-1 font-mono">
        <XCircle className="w-3 h-3 text-orange-400 shrink-0" /> KADALUARSA
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1 font-mono">
      <Search className="w-3 h-3 text-amber-400 animate-spin shrink-0" /> MEMINDAI PASAR
    </span>
  );
}

function StepBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> LOLOS</span>;
  if (s === 'validated') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> TERVALIDASI</span>;
  if (s === 'active' || s === 'detected') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider flex items-center gap-1"><Search className="w-2.5 h-2.5 text-amber-400 shrink-0" /> AKTIF</span>;
  if (s === 'rejected' || s === 'invalidated') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase tracking-wider flex items-center gap-1"><XCircle className="w-2.5 h-2.5 shrink-0" /> GAGAL</span>;
  if (s === 'expired') return <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wider">KADALUARSA</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase tracking-wider">MENUNGGU</span>;
}

export default function MonitoringPage() {
  const { data: rawStrategies, loading, error, refetch } = useFetch<StrategyResponse[]>("/api/strategies", []);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("ALL");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const toggleDetails = (id: string) => {
    setExpandedDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

  const stats = useMemo(() => {
    let active = 0;
    let approved = 0;
    let rejected = 0;

    strategies.forEach(s => {
      const st = (s.setupStatus || '').toUpperCase();
      if (st === 'APPROVED' || st === 'SIGNAL_ACTIVE') approved++;
      else if (st === 'ACTIVE' || st === 'DETECTED' || st === 'SCANNING' || st === 'AI_PENDING' || st === 'VALIDATED') active++;
      else if (st === 'REJECTED' || st === 'INVALIDATED' || st === 'EXPIRED' || st === 'FAILED') rejected++;
    });

    return { total: strategies.length, active, approved, rejected };
  }, [strategies]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col p-8 bg-black text-center">
        <AlertTriangle className="w-10 h-10 text-rose-500 mb-3" />
        <h2 className="text-xs font-bold text-rose-400 tracking-wider uppercase font-mono">Gagal Memuat Data Monitoring</h2>
        <p className="text-[11px] text-zinc-500 mt-1 max-w-md">{error.message}</p>
        <button 
          onClick={refetch} 
          className="mt-4 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-[10px] font-bold uppercase tracking-widest rounded border border-zinc-700 transition-all"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3 pb-10 font-sans text-zinc-100">
      
      {/* Header & Scan Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400 shrink-0" />
            <h1 className="text-xs sm:text-sm font-black text-zinc-100 tracking-wider uppercase font-mono">
              Engine Monitoring & Scanner
            </h1>
            <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono font-bold rounded">
              XAUUSD 5-STRATEGI
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            Audit status multi-langkah sekuensial, kondisi missing, validasi teknikal, dan evaluasi real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={triggerScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded border border-blue-400/30 transition-all shadow-sm"
          >
            <Zap className={`w-3 h-3 ${isScanning ? 'animate-bounce text-amber-300' : ''}`} />
            {isScanning ? 'Memindai...' : 'Pindai Sekarang'}
          </button>
          
          <button 
            onClick={refetch}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded hover:bg-zinc-800 hover:text-white transition-all text-zinc-300"
          >
            <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold block">Total Strategi</span>
            <span className="text-sm font-mono font-bold text-zinc-200">{stats.total} Terkonfigurasi</span>
          </div>
          <Layers className="w-4 h-4 text-zinc-600" />
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold block">Memantau Pasar</span>
            <span className="text-sm font-mono font-bold text-amber-400">{stats.active}</span>
          </div>
          <Cpu className="w-4 h-4 text-amber-500" />
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold block">Setup Approved</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{stats.approved}</span>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2.5 flex items-center justify-between">
          <div>
            <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold block">Terinvalidasi</span>
            <span className="text-sm font-mono font-bold text-rose-400">{stats.rejected}</span>
          </div>
          <XCircle className="w-4 h-4 text-rose-500" />
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-zinc-950/80 p-2 border border-zinc-800/80 rounded">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedStrategyId("ALL")}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-all ${selectedStrategyId === "ALL" ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            SEMUA ({strategies.length})
          </button>
          {CANONICAL_ORDER.map((id, idx) => (
            <button
              key={id}
              onClick={() => setSelectedStrategyId(id)}
              className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-all ${selectedStrategyId === id ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
            >
              STRAT {idx + 1}
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px]">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Cari ID strategi / nama..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-7 pr-2.5 py-1 text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Strategy Engine Deep Monitoring Cards */}
      <div className="flex flex-col gap-3">
        {filteredStrategies.map((strat, idx) => {
          const steps = buildTimeline(strat);
          const labelInfo = STRATEGY_LABELS[strat.id] || { shortName: strat.name, tf: '--', session: '--' };
          const isExpanded = !!expandedDetails[strat.id];
          const anyStrat = strat as any;
          const detected = anyStrat.detectedSetup || {};
          const validation = anyStrat.validation || { score: '0/0', passedCount: 0, rulesCount: 0, rules: [] };
          const isRejected = ['REJECTED', 'FAILED', 'INVALIDATED', 'EXPIRED'].includes(strat.setupStatus);

          return (
            <div 
              key={strat.id} 
              className="bg-zinc-950 border border-zinc-800/90 rounded-lg overflow-hidden flex flex-col shadow-lg"
            >
              
              {/* Header: Strategy ID, Name, Step, Status */}
              <div className="bg-zinc-900/90 p-3 border-b border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[9px] font-mono font-bold rounded uppercase">
                      ID: {strat.id}
                    </span>
                    <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 text-[9px] font-mono font-bold rounded">
                      STRATEGI {idx + 1}
                    </span>
                    <h2 className="text-xs font-bold text-zinc-100 uppercase font-mono tracking-tight truncate">
                      {strat.name || strat.id}
                    </h2>
                    <StatusBadge status={strat.setupStatus} />
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400 shrink-0" /> TF: <span className="text-zinc-200">{labelInfo.tf}</span></span>
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3 text-amber-400 shrink-0" /> Sesi: <span className="text-zinc-200">{labelInfo.session}</span></span>
                    <span className="flex items-center gap-1"><Target className="w-3 h-3 text-emerald-400 shrink-0" /> Langkah: <span className="text-zinc-200 font-bold">{anyStrat.currentStepOrder || 1}/{steps.length} — {anyStrat.currentStep || 'Awaiting'}</span></span>
                  </div>
                </div>

                {/* Right Header Status Bar */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="bg-black/60 px-2.5 py-1 rounded border border-zinc-800/80 text-right">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold block">Validasi Aturan</span>
                    <span className="text-[10px] font-mono font-bold text-blue-400">
                      Score: {validation.score}
                    </span>
                  </div>
                  <button 
                    onClick={() => toggleDetails(strat.id)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                    {isExpanded ? 'Tutup Detail' : 'Detail Step'}
                  </button>
                </div>
              </div>

              {/* Engine Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-zinc-950/90 border-b border-zinc-800/60 p-2 gap-2 text-[10px] font-mono">
                <div className="flex flex-col">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold">Terakhir Dipindai</span>
                  <span className="text-zinc-200 font-bold flex items-center gap-1">
                    <History className="w-3 h-3 text-zinc-500 shrink-0" />
                    {anyStrat.lastScan || 'Real-time'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold">Evaluasi Berikutnya</span>
                  <span className="text-zinc-300 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                    {anyStrat.nextEvaluation || 'Candle close'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold">Single Signal Key</span>
                  <span className="text-zinc-300 font-bold truncate">
                    {strat.signal || 'MONITORING_SETUP'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-extrabold">Progress Pipeline</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${isRejected ? 'bg-rose-500' : 'bg-blue-500'}`} 
                        style={{ width: `${strat.progress || 0}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-400">{strat.progress || 0}%</span>
                  </div>
                </div>
              </div>

              {/* Core Engine Intelligence: Missing Condition & Detected Setup */}
              <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                
                {/* Left Column: Missing Condition & Invalidation / Rejection Info */}
                <div className="lg:col-span-7 flex flex-col gap-2">
                  
                  {/* Current Missing Condition Box */}
                  <div className="bg-zinc-900/60 border border-zinc-800/80 rounded p-2.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        Kondisi yang Diperlukan (Missing Condition)
                      </span>
                      <span className="text-[8px] text-zinc-500 font-mono">
                        Langkah {anyStrat.currentStepOrder || 1}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-200 leading-relaxed font-sans">
                      {anyStrat.missingCondition || 'Memantau formasi struktur harga dan likuiditas market untuk memenuhi syarat validasi berikutnya.'}
                    </p>
                  </div>

                  {/* Rejection / Invalidation Criteria Box */}
                  {isRejected ? (
                    <div className="bg-rose-950/20 border border-rose-500/30 rounded p-2.5 flex flex-col gap-1">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        Penyebab Ditolak / Terinvalidasi (Rejection Reason)
                      </span>
                      <p className="text-[11px] text-rose-300 font-sans leading-relaxed">
                        {anyStrat.rejectionReason || 'Setup gagal memenuhi toleransi aturan batas teknikal atau filter risiko.'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/40 border border-zinc-800/60 rounded p-2 flex items-start gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                      <div className="flex flex-col text-[10px]">
                        <span className="text-zinc-400 font-mono font-bold uppercase text-[8px]">Kriteria Pembatalan Setup (Invalidation)</span>
                        <span className="text-zinc-400">{anyStrat.invalidationRule || 'Penembusan level swing berlawanan atau pembatalan bias HTF.'}</span>
                      </div>
                    </div>
                  )}

                  {/* AI Gate Snapshot if available */}
                  {(strat.aiDecision || anyStrat.detectedSetup?.aiDecision) && (
                    <div className="bg-purple-950/20 border border-purple-500/25 rounded p-2 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-purple-300 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-purple-400 shrink-0" />
                        AI Confluence Quality Gate:
                      </span>
                      <span className="font-bold text-purple-200">
                        {strat.aiDecision || anyStrat.detectedSetup?.aiDecision}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Column: Detected Setup Snapshot & Rules */}
                <div className="lg:col-span-5 flex flex-col gap-2">
                  <div className="bg-zinc-900/50 border border-zinc-800/80 rounded p-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                        <Crosshair className="w-3 h-3 text-blue-400 shrink-0" />
                        Setup Terdeteksi (Detected Setup)
                      </span>
                      <span className="text-[9px] font-mono text-zinc-400 font-bold">
                        {detected.pair || 'XAUUSD'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">Arah:</span>
                        <span className={`font-bold ${detected.direction === 'BUY' ? 'text-emerald-400' : detected.direction === 'SELL' ? 'text-rose-400' : 'text-zinc-300'}`}>
                          {detected.direction || '--'}
                        </span>
                      </div>
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">Bias HTF:</span>
                        <span className="font-bold text-zinc-200">{detected.bias || '--'}</span>
                      </div>
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">Entry:</span>
                        <span className="font-bold text-zinc-200">{detected.entry || '--'}</span>
                      </div>
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">Stop Loss:</span>
                        <span className="font-bold text-rose-400">{detected.sl || '--'}</span>
                      </div>
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">Take Profit:</span>
                        <span className="font-bold text-emerald-400">{detected.tp || '--'}</span>
                      </div>
                      <div className="bg-zinc-950/80 p-1.5 rounded border border-zinc-800/50 flex justify-between">
                        <span className="text-zinc-500">R:R Ratio:</span>
                        <span className="font-bold text-amber-400">{detected.rr || '--'}</span>
                      </div>
                    </div>

                    {/* Sweep & Confirmation Status */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 pt-1 border-t border-zinc-800/60">
                      <span>Liquidity Sweep: <strong className="text-zinc-200">{detected.sweepStatus || 'Monitored'}</strong></span>
                      <span>Konfirmasi: <strong className="text-zinc-200">{detected.confirmationStatus || 'Awaiting'}</strong></span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Sequential Step Timeline (Expandable or Default) */}
              <div className="border-t border-zinc-800/80 p-3 bg-zinc-950/60 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-blue-400 shrink-0" />
                    Urutan Alur Sekuensial Step (1 - {steps.length})
                  </span>
                  <span className="text-[8px] text-zinc-500 font-mono">Transisi Terstruktur Tanpa Lompat</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {steps.map((step, sIdx) => {
                    const s = (step.status || '').toLowerCase();
                    const isActive = s === 'active' || s === 'detected';
                    const isApproved = s === 'approved';
                    const isValidated = s === 'validated';
                    const isStepRejected = s === 'rejected' || s === 'invalidated';

                    let stepBg = 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500';
                    if (isApproved) stepBg = 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300';
                    else if (isValidated) stepBg = 'bg-blue-950/20 border-blue-500/30 text-blue-300';
                    else if (isActive) stepBg = 'bg-amber-950/30 border-amber-500/40 text-amber-200';
                    else if (isStepRejected) stepBg = 'bg-rose-950/20 border-rose-500/30 text-rose-300';

                    return (
                      <div 
                        key={step.id || sIdx} 
                        className={`p-2 rounded border flex items-center justify-between gap-2 ${stepBg}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0 font-mono">
                            {sIdx + 1}
                          </span>
                          <span className="text-[10px] font-bold truncate">
                            {step.name}
                          </span>
                        </div>
                        <StepBadge status={s} />
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
