"use client";

import { memo } from "react";
import { Cpu, Server, Database, Radio, Zap } from "lucide-react";
import { DashboardSnapshotEngine, DashboardSnapshotSystem } from "@/types";

interface EngineStatusPanelProps {
  engine: DashboardSnapshotEngine;
  system: DashboardSnapshotSystem;
}

export const EngineStatusPanel = memo(function EngineStatusPanel({ engine, system }: EngineStatusPanelProps) {
  const isEngineActive = engine.status === 'running' || engine.status === 'active';
  const conn = system.connections || { market: true, supabase: true, redis: true, realtimeChannel: true };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              TRADING ENGINE & INFRASTRUCTURE
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Pipeline Control & Service State
            </p>
          </div>
        </div>

        <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border uppercase tracking-wider ${isEngineActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
          ENGINE: {engine.status.toUpperCase()}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 font-mono uppercase">Active Strategies</span>
          <span className="text-sm font-mono font-bold text-zinc-100">{engine.activeStrategyCount} / 5</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 font-mono uppercase">Current Step</span>
          <span className="text-xs font-mono font-bold text-blue-400 truncate">{engine.currentStep}</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 font-mono uppercase">Queue Size</span>
          <span className="text-xs font-mono font-bold text-zinc-200">{engine.queueSize} events</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded p-2 flex flex-col justify-between">
          <span className="text-zinc-500 font-mono uppercase">Pipeline Latency</span>
          <span className="text-xs font-mono font-bold text-emerald-400">{engine.latencyMs}ms</span>
        </div>
      </div>

      {/* Connections Health Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8px]">
        <div className={`flex items-center justify-between p-1.5 rounded border ${conn.market ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1 font-bold">
            <Radio className="w-2.5 h-2.5 shrink-0" /> Market Feed
          </span>
          <span className="font-mono font-bold uppercase">{conn.market ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-1.5 rounded border ${conn.supabase ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1 font-bold">
            <Database className="w-2.5 h-2.5 shrink-0" /> Supabase DB
          </span>
          <span className="font-mono font-bold uppercase">{conn.supabase ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-1.5 rounded border ${conn.redis ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1 font-bold">
            <Server className="w-2.5 h-2.5 shrink-0" /> Redis Queue
          </span>
          <span className="font-mono font-bold uppercase">{conn.redis ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-1.5 rounded border ${conn.realtimeChannel ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1 font-bold">
            <Zap className="w-2.5 h-2.5 shrink-0" /> Event Bus
          </span>
          <span className="font-mono font-bold uppercase">{conn.realtimeChannel ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>
    </div>
  );
});
