"use client";

import { memo, useState } from "react";
import { ListFilter, ChevronDown, ChevronUp, ArrowRight, Shield, Crosshair, AlertTriangle } from "lucide-react";
import { StrategyResponse } from "@/types";
import { buildSetup, buildRules, buildTimeline, getAllStrategiesWithFallback } from "@/lib/strategyViewModel";
import { SetupCard, TimelineCard, RuleTable } from "@/components/strategy-ui";
import { getStatusBadge } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface CanonicalStrategiesPanelProps {
  strategies: StrategyResponse[];
}

export const CanonicalStrategiesPanel = memo(function CanonicalStrategiesPanel({ strategies }: CanonicalStrategiesPanelProps) {
  const router = useRouter();
  const safeStrats = getAllStrategiesWithFallback(strategies);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <ListFilter className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              CANONICAL STRATEGY SETUP SCANNER (5/5)
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Realtime Sequential Pipeline State
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/monitoring")}
          className="flex items-center gap-1 text-[8px] font-mono font-bold tracking-wider text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-1 rounded hover:bg-blue-500/20 transition-all uppercase"
        >
          View Scan Page <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Strategies List */}
      <div className="space-y-2">
        {safeStrats.map((strategy, index) => {
          const setup = buildSetup(strategy);
          const rulesArray = buildRules(strategy);
          const timeline = buildTimeline(strategy);
          const isCollapsed = collapsed[strategy.id];
          const setupStatus = strategy.status || 'active';

          return (
            <div
              key={strategy.id}
              className="bg-zinc-950/80 border border-zinc-800/80 rounded-md overflow-hidden transition-all hover:border-zinc-700/80"
            >
              {/* Strategy Item Header */}
              <div
                className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-900/60 transition-colors"
                onClick={() => toggleCollapse(strategy.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <span className="text-[8px] font-mono font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase shrink-0">
                    S{index + 1}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[10px] font-mono font-bold text-zinc-200 truncate">
                      {strategy.name}
                    </h4>
                    <span className="text-[8px] font-mono text-zinc-500 block truncate">
                      Step: {strategy.currentStep || 'INITIALIZING'} • {strategy.progress || 0}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border uppercase tracking-wider ${getStatusBadge(setupStatus)}`}>
                    {setupStatus}
                  </span>
                  <div className="p-1 rounded bg-zinc-900 border border-zinc-800">
                    {isCollapsed ? <ChevronDown className="w-3 h-3 text-zinc-400" /> : <ChevronUp className="w-3 h-3 text-zinc-400" />}
                  </div>
                </div>
              </div>

              {/* Collapsible Content */}
              {!isCollapsed && (
                <div className="p-2.5 border-t border-zinc-800/60 bg-zinc-900/30 space-y-2">
                  {strategy.assumptions_flagged && (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-mono p-1.5 rounded flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Assumptions: {strategy.assumptions_flagged}</span>
                    </div>
                  )}

                  <TimelineCard steps={timeline} />

                  <SetupCard
                    pair={setup.pair}
                    bias={setup.bias}
                    session={setup.session}
                    direction={setup.direction}
                    entry={setup.entry}
                    sl={setup.sl}
                    tp={setup.tp}
                    rr={setup.rr}
                    atrBuffer={setup.atrBuffer}
                    sweepStatus={setup.sweepStatus}
                    confirmationStatus={setup.confirmationStatus}
                  />

                  <div>
                    <h5 className="text-[8px] font-mono font-bold text-zinc-500 uppercase mb-1">
                      Rule Validation Table ({rulesArray.length})
                    </h5>
                    <RuleTable rules={rulesArray} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
