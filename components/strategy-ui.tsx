import { 
  Shield, 
  Target, 
  ArrowRight, 
  TrendingUp, 
  TrendingDown 
} from "lucide-react";
import { getStatusBadge } from "@/lib/utils";
import { StrategyStep } from "@/types";

export function StrategyStatus({ status, className = "" }: { status: string; className?: string }) {
  const badgeStyle = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[6px] font-bold tracking-widest border uppercase ${badgeStyle} ${className}`}>
      {status}
    </span>
  );
}

export function ProgressBar({ progress, status }: { progress: number; status?: string }) {
  let color = "bg-blue-500";
  if (status === 'error' || status === 'failed' || status === 'rejected') color = "bg-rose-500";
  else if (status === 'finished' || status === 'approved') color = "bg-emerald-500";

  return (
    <div className="w-full bg-white/5 rounded-full h-1 mt-1 overflow-hidden">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${progress}%` }}></div>
    </div>
  );
}

export function StrategyHeader({ name, description, status }: { name: string; description?: string; status: string }) {
  return (
    <div className="flex items-start justify-between">
      <div className="max-w-[70%]">
        <div className="text-[10px] font-bold text-zinc-100 tracking-wide line-clamp-1">{name}</div>
        {description && (
          <div className="text-[7px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{description}</div>
        )}
      </div>
      <StrategyStatus status={status} />
    </div>
  );
}

export function TimelineCard({ steps }: { steps: StrategyStep[] }) {
  if (!steps || steps.length === 0) {
    return <div className="text-[7px] text-zinc-600 font-mono italic">No steps</div>;
  }
  return (
    <div className="flex flex-wrap items-center bg-black/40 rounded-[3px] border border-white/5 px-1.5 py-1 shadow-inner gap-1">
      {steps.map((step: StrategyStep, sIdx: number) => {
        const isActive = step.status === 'active';
        const isApproved = step.status === 'approved';
        const isRejected = step.status === 'rejected';
        const isExpired = step.status === 'expired';
        
        let colorCls = 'text-zinc-600';
        if (isActive) colorCls = 'text-blue-400 bg-blue-500/10 px-1 rounded-sm';
        if (isApproved) colorCls = 'text-emerald-400';
        if (isRejected || isExpired) colorCls = 'text-rose-400';
        
        return (
          <div key={sIdx} className="flex items-center min-w-0">
            <span className={`text-[6px] font-bold uppercase tracking-widest truncate ${colorCls}`}>
              {step.name}
            </span>
            {sIdx < steps.length - 1 && (
              <ArrowRight className={`w-2.5 h-2.5 mx-0.5 shrink-0 ${isApproved ? 'text-emerald-500/60' : 'text-zinc-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  );
}

export function ValidationBadge({ passed, total }: { passed: number; total: number }) {
  const isPassed = passed > 0 && passed === total;
  const colorClass = isPassed ? "text-emerald-400" : (passed > 0 ? "text-amber-400" : "text-zinc-500");
  return (
    <div className="flex items-center justify-between text-[7px]">
      <span className="text-zinc-600 font-bold uppercase tracking-widest">Validation</span>
      <span className={`font-mono font-bold tracking-wide ${colorClass}`}>
        {passed}/{total} PASS
      </span>
    </div>
  );
}

export function SetupCard({ 
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
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1 text-[7px]">
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Pair</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{pair || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Timeframe</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{timeframe || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Session</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{session || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Trend/Bias</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{bias || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">ATR Buffer</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{atrBuffer || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Sweep Status</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{sweepStatus || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Confirm Status</span>
           <span className="font-bold text-zinc-300 truncate ml-2 text-right">{confirmationStatus || '--'}</span>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Risk/Reward</span>
           <span className="font-mono font-bold tracking-wide text-zinc-300 truncate ml-2 text-right">{rr || '--'}</span>
        </div>
        <div className="col-span-2 bg-black/40 border border-white/5 rounded-[3px] p-1.5 flex items-center justify-between shadow-inner">
           <span className="text-zinc-600 font-bold uppercase tracking-widest shrink-0">Signal</span>
           <span className={`font-bold flex items-center gap-0.5 truncate ml-2 text-right ${isLong ? 'text-emerald-400' : isShort ? 'text-rose-400' : 'text-zinc-400'}`}>
              {isLong && <TrendingUp className="w-2.5 h-2.5 shrink-0" />}
              {isShort && <TrendingDown className="w-2.5 h-2.5 shrink-0" />}
              <span className="truncate">{direction || '--'}</span>
           </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[7px]">
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-600 font-bold uppercase tracking-widest mb-0.5">Entry</div>
          <div className={`font-mono font-bold tracking-wide truncate ${entry === 'ASUMSI PERLU KONFIRMASI' ? 'text-[5px] text-zinc-500' : 'text-zinc-300'}`}>{entry || '--'}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-600 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5"><Shield className="w-2 h-2 text-rose-500/70 shrink-0" /> SL</div>
          <div className={`font-mono font-bold tracking-wide truncate ${sl === 'ASUMSI PERLU KONFIRMASI' ? 'text-[5px] text-zinc-500' : 'text-rose-400'}`}>{sl || '--'}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner overflow-hidden">
          <div className="text-zinc-600 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5"><Target className="w-2 h-2 text-emerald-500/70 shrink-0" /> TP</div>
          <div className={`font-mono font-bold tracking-wide truncate ${tp === 'ASUMSI PERLU KONFIRMASI' ? 'text-[5px] text-zinc-500' : 'text-emerald-400'}`}>{tp || '--'}</div>
        </div>
      </div>
    </div>
  );
}

export function RuleTable({ rules }: { rules: any[] }) {
  if (!rules || rules.length === 0) {
    return <div className="text-[7px] text-zinc-600 font-mono italic">No rules executed</div>;
  }
  
  return (
    <div className="space-y-1">
      {rules.map((rule: any, idx: number) => (
        <div key={idx} className="flex flex-col bg-black/40 border border-white/5 rounded-[3px] p-1.5 shadow-inner">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[7px] text-zinc-300 font-bold uppercase tracking-widest">{(rule.ruleId || `Rule ${idx + 1}`).replace(/_/g, ' ')}</span>
            <span className={`text-[6px] font-bold uppercase tracking-widest px-1 py-0.5 rounded ${rule.passed || rule.status === 'valid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {rule.passed || rule.status === 'valid' ? 'PASS' : 'FAIL'}
            </span>
          </div>
          {rule.evidence && typeof rule.evidence === 'object' && (
             <div className="grid grid-cols-2 gap-1 mt-0.5">
               {Object.entries(rule.evidence).map(([dk, dv]: [string, any]) => (
                  <div key={dk} className="flex flex-col">
                     <span className="text-[5px] text-zinc-600 font-bold uppercase tracking-widest">{dk}</span>
                     <span className="text-[6px] text-zinc-400 font-mono truncate">{String(dv)}</span>
                  </div>
               ))}
             </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SignalCard({ direction, entry, sl, tp1, tp2, tp3 }: { direction?: string; entry?: string | number; sl?: string | number; tp1?: string | number; tp2?: string | number; tp3?: string | number; }) {
  const isLong = direction === 'LONG' || direction === 'BUY';
  const isShort = direction === 'SHORT' || direction === 'SELL';
  
  return (
    <div className="flex flex-col bg-white/5 border border-white/10 rounded-md p-2 shadow-sm">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-bold border uppercase tracking-widest ${isLong ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : isShort ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20"}`}>
          {isLong && <TrendingUp className="w-3 h-3" />}
          {isShort && <TrendingDown className="w-3 h-3" />}
          {direction || "UNKNOWN"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 mb-1 text-[7px]">
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner">
          <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Entry</div>
          <div className="font-mono font-bold text-zinc-300 tracking-wide">{entry || '--'}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner">
          <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
            <Shield className="w-2 h-2 text-rose-500/70" /> SL
          </div>
          <div className="font-mono font-bold text-rose-400 tracking-wide">{sl || '--'}</div>
        </div>
        <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner">
          <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
            <Target className="w-2 h-2 text-emerald-500/70" /> TP1
          </div>
          <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp1 || '--'}</div>
        </div>
      </div>
      {(tp2 || tp3) && (
        <div className="grid grid-cols-2 gap-1 text-[7px]">
          {tp2 && (
            <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner">
              <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                <Target className="w-2 h-2 text-emerald-500/70" /> TP2
              </div>
              <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp2}</div>
            </div>
          )}
          {tp3 && (
            <div className="bg-black/40 border border-white/5 rounded-[3px] p-1.5 text-center shadow-inner">
              <div className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5 flex justify-center items-center gap-0.5">
                <Target className="w-2 h-2 text-emerald-500/70" /> TP3
              </div>
              <div className="font-mono font-bold text-emerald-400 tracking-wide">{tp3}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ParameterGrid({ parameters }: { parameters: Record<string, string | number | boolean> }) {
  if (!parameters || Object.keys(parameters).length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {Object.entries(parameters).map(([k, v]) => (
        <div key={k} className="flex flex-col bg-white/5 p-1.5 rounded-[3px] border border-white/5">
          <span className="text-[6px] text-zinc-500 font-bold uppercase tracking-widest">{k}</span>
          <span className="text-[7px] text-zinc-300 font-mono truncate mt-0.5">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export function EngineBadge({ engineName, status }: { engineName: string; status: string }) {
  const isHealthy = status === 'healthy' || status === 'online' || status === 'connected';
  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] border text-[6px] font-bold uppercase tracking-widest ${isHealthy ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      {engineName}
    </div>
  );
}
