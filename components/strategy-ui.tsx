import { memo } from "react";
import { 
  Shield, 
  Target, 
  TrendingUp, 
  TrendingDown,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";
import { getStatusBadge } from "@/lib/utils";
import { StrategyStep } from "@/types";

export const StrategyStatus = memo(function StrategyStatus({ status, className = "" }: { status: string; className?: string }) {
  const badgeStyle = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider border uppercase ${badgeStyle} ${className}`}>
      {status}
    </span>
  );
});

export const ProgressBar = memo(function ProgressBar({ progress, status }: { progress: number; status?: string }) {
  let color = "bg-blue-500";
  if (status === 'error' || status === 'failed' || status === 'rejected') color = "bg-rose-500";
  else if (status === 'finished' || status === 'approved') color = "bg-emerald-500";

  return (
    <div className="w-full bg-zinc-950 rounded-full h-1.5 mt-1.5 overflow-hidden border border-zinc-800/80">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${progress}%` }}></div>
    </div>
  );
});

export const StrategyHeader = memo(function StrategyHeader({ name, description, status }: { name: string; description?: string; status: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-zinc-100 tracking-wide line-clamp-1">{name}</div>
        {description && (
          <div className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2 leading-snug">{description}</div>
        )}
      </div>
      <StrategyStatus status={status} className="shrink-0" />
    </div>
  );
});

export const TimelineCard = memo(function TimelineCard({ steps }: { steps: StrategyStep[] }) {
  if (!steps || steps.length === 0) {
    return <div className="text-[10px] text-zinc-500 font-mono italic">No steps available</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-9 gap-1 bg-zinc-950/80 rounded-lg p-1.5 border border-zinc-800/80 shadow-inner">
      {steps.map((step: StrategyStep, sIdx: number) => {
        const isActive = step.status === 'active' || step.status === 'current';
        const isFinished = step.status === 'finished' || step.status === 'approved' || step.status === 'passed';
        const isFailed = step.status === 'failed' || step.status === 'rejected';

        let bgCls = 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500';
        let icon = <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />;

        if (isFinished) {
          bgCls = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-medium';
          icon = <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />;
        } else if (isActive) {
          bgCls = 'bg-blue-500/15 border-blue-500/40 text-blue-300 font-bold shadow-[0_0_10px_rgba(59,130,246,0.2)] animate-pulse';
          icon = <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />;
        } else if (isFailed) {
          bgCls = 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold';
          icon = <XCircle className="w-3 h-3 text-rose-400 shrink-0" />;
        }

        const stepKey = step.id || `step-${sIdx}-${step.name}`;

        return (
          <div key={stepKey} className={`flex items-center gap-1.5 p-1.5 rounded border ${bgCls} transition-all`}>
            <span className="text-[8px] font-mono font-bold opacity-60 shrink-0">{sIdx + 1}.</span>
            {icon}
            <span className="text-[8px] uppercase tracking-wider truncate min-w-0" title={step.name}>
              {step.name}
            </span>
          </div>
        );
      })}
    </div>
  );
});

export const ValidationBadge = memo(function ValidationBadge({ passed, total }: { passed: number; total: number }) {
  const isPassed = passed > 0 && passed === total;
  const colorClass = isPassed ? "text-emerald-400 font-bold" : (passed > 0 ? "text-amber-400 font-bold" : "text-zinc-400 font-medium");
  return (
    <div className="flex items-center justify-between text-[10px] pt-1">
      <span className="text-zinc-400 font-semibold uppercase tracking-wider">Validation</span>
      <span className={`font-mono font-bold tracking-wide ${colorClass}`}>
        {passed}/{total} PASS
      </span>
    </div>
  );
});

export const SetupCard = memo(function SetupCard({ 
  pair, 
  timeframe, 
  bias, 
  session, 
  direction, 
  entry, 
  sl, 
  tp, 
  rr,
  atrBuffer,
  sweepStatus,
  confirmationStatus
}: { 
  pair?: string; 
  timeframe?: string; 
  bias?: string; 
  session?: string; 
  direction?: string; 
  entry?: string | number; 
  sl?: string | number; 
  tp?: string | number; 
  rr?: string | number;
  atrBuffer?: string | number;
  sweepStatus?: string;
  confirmationStatus?: string;
}) {
  const isLong = direction === 'LONG' || direction === 'BUY';
  const isShort = direction === 'SHORT' || direction === 'SELL';
  
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Pair</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{pair || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Timeframe</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{timeframe || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Session</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{session || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Trend/Bias</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{bias || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">ATR Buffer</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{atrBuffer || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Sweep</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{sweepStatus || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Confirm</span>
           <span className="font-bold text-zinc-200 truncate ml-2 text-right">{confirmationStatus || '--'}</span>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">R:R</span>
           <span className="font-mono font-bold tracking-wide text-zinc-200 truncate ml-2 text-right">{rr || '--'}</span>
        </div>
        <div className="col-span-2 bg-zinc-950/60 border border-zinc-800/80 rounded-md p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-500 font-semibold uppercase tracking-wider shrink-0">Signal</span>
           <span className={`font-bold flex items-center gap-1 truncate ml-2 text-right ${isLong ? 'text-emerald-400' : isShort ? 'text-rose-400' : 'text-zinc-300'}`}>
              {isLong && <TrendingUp className="w-3 h-3 shrink-0" />}
              {isShort && <TrendingDown className="w-3 h-3 shrink-0" />}
              <span className="truncate">{direction || '--'}</span>
           </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[9px]">
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-2 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Entry</div>
          <div className="font-mono font-bold tracking-wide truncate text-zinc-100">
            {entry && entry !== 'ASUMSI PERLU KONFIRMASI' ? entry : '--'}
          </div>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-2 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-500 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1"><Shield className="w-2.5 h-2.5 text-rose-400 shrink-0" /> SL</div>
          <div className="font-mono font-bold tracking-wide truncate text-rose-400">
            {sl && sl !== 'ASUMSI PERLU KONFIRMASI' ? sl : '--'}
          </div>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-md p-2 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-500 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-1"><Target className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> TP</div>
          <div className="font-mono font-bold tracking-wide truncate text-emerald-400">
            {tp && tp !== 'ASUMSI PERLU KONFIRMASI' ? tp : '--'}
          </div>
        </div>
      </div>
    </div>
  );
});

export const RuleTable = memo(function RuleTable({ rules }: { rules: any[] }) {
  if (!rules || rules.length === 0) {
    return (
      <div className="text-[10px] text-zinc-500 font-mono italic p-3 border border-dashed border-zinc-800 rounded-md text-center">
        No rule validations registered
      </div>
    );
  }
  
  return (
    <div className="space-y-1.5">
      {rules.map((rule: any, idx: number) => {
        const isPass = rule.passed || rule.status === 'valid' || rule.status === 'approved';
        const isFail = rule.status === 'invalid' || rule.status === 'failed' || rule.status === 'rejected';

        const statusLabel = isPass ? 'PASS' : (isFail ? 'FAIL' : 'WAIT');
        const statusClass = isPass 
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
          : (isFail 
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
            : 'bg-amber-500/10 text-amber-400 border-amber-500/30');

        const key = rule.ruleId || rule.id || `rule-${idx}`;
        return (
          <div key={key} className="flex flex-col bg-zinc-900/50 border border-zinc-800/80 rounded-md p-2 shadow-sm transition-all hover:border-zinc-700">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-zinc-200 font-bold uppercase tracking-wider font-mono">
                {(rule.ruleId || rule.name || `Rule ${idx + 1}`).replace(/_/g, ' ')}
              </span>
              <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
            {rule.invalidations && rule.invalidations.length > 0 && (
              <div className="mt-1 text-[8px] text-rose-400/90 font-medium bg-rose-950/30 border border-rose-900/40 p-1 rounded">
                Fail reason: {rule.invalidations.join(', ')}
              </div>
            )}
            {rule.evidence && typeof rule.evidence === 'object' && Object.keys(rule.evidence).length > 0 && (
               <div className="grid grid-cols-2 gap-1.5 mt-1.5 pt-1.5 border-t border-zinc-800/40">
                 {Object.entries(rule.evidence).map(([dk, dv]: [string, any]) => (
                    <div key={`${key}-${dk}`} className="flex flex-col bg-zinc-950/60 p-1 rounded border border-zinc-800/50">
                       <span className="text-[7px] text-zinc-500 font-semibold uppercase tracking-wider">{dk.replace(/_/g, ' ')}</span>
                       <span className="text-[8px] text-zinc-300 font-mono truncate">{typeof dv === 'object' ? JSON.stringify(dv) : String(dv)}</span>
                    </div>
                 ))}
               </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export const SignalCard = memo(function SignalCard({ direction, entry, sl, tp1, tp2, tp3 }: { direction?: string; entry?: string | number; sl?: string | number; tp1?: string | number; tp2?: string | number; tp3?: string | number; }) {
  const isLong = direction === 'LONG' || direction === 'BUY';
  const isShort = direction === 'SHORT' || direction === 'SELL';
  
  return (
    <div className="flex flex-col bg-white/5 border border-white/10 rounded-md p-2.5 shadow-sm">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${isLong ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : isShort ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-zinc-300 bg-zinc-500/10 border-zinc-500/20"}`}>
          {isLong && <TrendingUp className="w-3.5 h-3.5" />}
          {isShort && <TrendingDown className="w-3.5 h-3.5" />}
          {isLong ? "BUY" : isShort ? "SELL" : (direction || "WAIT")}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-1 text-[9px]">
        <div className="bg-black/50 border border-white/10 rounded-md p-2 text-center shadow-inner">
          <div className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5">Entry</div>
          <div className="font-mono font-bold text-zinc-100 tracking-wide">{entry || '--'}</div>
        </div>
        <div className="bg-black/50 border border-white/10 rounded-md p-2 text-center shadow-inner">
          <div className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-0.5">
            <Shield className="w-2.5 h-2.5 text-rose-400" /> SL
          </div>
          <div className="font-mono font-bold text-rose-400 tracking-wide">{sl || '--'}</div>
        </div>
        <div className="bg-black/50 border border-white/10 rounded-md p-2 text-center shadow-inner">
          <div className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-0.5">
            <Target className="w-2.5 h-2.5 text-emerald-400" /> TP1
          </div>
          <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp1 || '--'}</div>
        </div>
      </div>
      {(tp2 || tp3) && (
        <div className="grid grid-cols-2 gap-1.5 text-[9px] mt-1">
          {tp2 && (
            <div className="bg-black/50 border border-white/10 rounded-md p-2 text-center shadow-inner">
              <div className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-0.5">
                <Target className="w-2.5 h-2.5 text-emerald-400" /> TP2
              </div>
              <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp2}</div>
            </div>
          )}
          {tp3 && (
            <div className="bg-black/50 border border-white/10 rounded-md p-2 text-center shadow-inner">
              <div className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider mb-0.5 flex justify-center items-center gap-0.5">
                <Target className="w-2.5 h-2.5 text-emerald-400" /> TP3
              </div>
              <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp3}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const ParameterGrid = memo(function ParameterGrid({ parameters }: { parameters: Record<string, string | number | boolean> }) {
  if (!parameters || Object.keys(parameters).length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Object.entries(parameters).map(([k, v]) => (
        <div key={k} className="flex flex-col bg-white/5 p-2 rounded-md border border-white/10">
          <span className="text-[8px] text-zinc-400 font-semibold uppercase tracking-wider">{k}</span>
          <span className="text-[9px] text-zinc-200 font-mono truncate mt-0.5">{String(v)}</span>
        </div>
      ))}
    </div>
  );
});

export const EngineBadge = memo(function EngineBadge({ engineName, status }: { engineName: string; status: string }) {
  const isHealthy = status === 'healthy' || status === 'online' || status === 'connected';
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border text-[9px] font-bold uppercase tracking-wider ${isHealthy ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`}></span>
      {engineName}
    </div>
  );
});
