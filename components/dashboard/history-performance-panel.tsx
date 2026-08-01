"use client";

import { memo } from "react";
import { History, Award, ArrowRight } from "lucide-react";
import { DashboardSnapshotPerformance } from "@/types";
import { useRouter } from "next/navigation";
import { ClientDate } from "@/components/client-date";

interface HistoryPerformancePanelProps {
  performance: DashboardSnapshotPerformance;
  history: any[];
}

export const HistoryPerformancePanel = memo(function HistoryPerformancePanel({ performance, history }: HistoryPerformancePanelProps) {
  const router = useRouter();

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <Award className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              PERFORMANCE & TRADE HISTORY
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Verified Closed Positions Ledger
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/history")}
          className="flex items-center gap-1 text-[8px] font-mono font-bold tracking-wider text-purple-400 hover:text-purple-300 bg-purple-500/10 border border-purple-500/30 px-2 py-1 rounded hover:bg-purple-500/20 transition-all uppercase"
        >
          View Full Ledger <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* KPI Performance Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 uppercase">Win Rate</span>
          <span className={`text-sm font-bold ${performance.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {performance.winRate}%
          </span>
          <span className="text-[8px] text-zinc-600">{performance.winCount}W / {performance.lossCount}L</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 uppercase">Profit Factor</span>
          <span className="text-sm font-bold text-purple-400">
            {performance.profitFactor}
          </span>
          <span className="text-[8px] text-zinc-600">Avg R:R 1:{performance.avgRr}</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 uppercase">Net Pips</span>
          <span className={`text-sm font-bold ${performance.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {performance.netProfit > 0 ? `+${performance.netProfit}` : performance.netProfit}
          </span>
          <span className="text-[8px] text-zinc-600">Closed positions</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 uppercase">Total Trades</span>
          <span className="text-sm font-bold text-zinc-200">
            {performance.totalTrades}
          </span>
          <span className="text-[8px] text-zinc-600">Historical records</span>
        </div>
      </div>

      {/* Recent History Table / List */}
      {history.length > 0 ? (
        <div className="space-y-1.5">
          <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase">Recent Closed Trades</span>
          {history.slice(0, 5).map((item) => {
            const isWin = item.outcome === 'WIN' || item.pips > 0;
            return (
              <div
                key={item.id}
                className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex items-center justify-between text-[8px] font-mono hover:border-zinc-700/80 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${isWin ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                    {item.outcome}
                  </span>
                  <div>
                    <span className="font-bold text-zinc-200">{item.pair} • {item.direction}</span>
                    <span className="text-zinc-500 block truncate">{item.strategyName}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`font-bold block ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {item.pips > 0 ? `+${item.pips}` : item.pips} pips
                  </span>
                  <span className="text-zinc-600 text-[7px]">
                    <ClientDate date={item.closedAtTimestamp} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 text-center bg-zinc-950/60 border border-dashed border-zinc-800/80 rounded-md">
          <History className="w-5 h-5 text-zinc-700 mx-auto mb-1 opacity-60" />
          <p className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
            NO RECENT CLOSED TRADES
          </p>
        </div>
      )}
    </div>
  );
});
