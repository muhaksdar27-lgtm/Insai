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
  const conn = system.connections || { market: true, database: true, redis: true, realtimeChannel: true };
  const isDbConnected = conn.database ?? true;

  return (
    <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 pb-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-mono font-bold text-zinc-100 uppercase tracking-wide">
              TRADING ENGINE & INFRASTRUCTURE
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              Pipeline State & Service Health
            </p>
          </div>
        </div>

        <span className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold border uppercase tracking-wider ${isEngineActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
          ENGINE: {engine.status.toUpperCase()}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <span className="text-zinc-400 font-mono text-[10px] font-bold uppercase">Active Strategies</span>
          <span className="text-base font-mono font-bold text-zinc-100">{engine.activeStrategyCount} / 5</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <span className="text-zinc-400 font-mono text-[10px] font-bold uppercase">Pipeline Step</span>
          <span className="text-sm font-mono font-bold text-blue-400 truncate">{engine.currentStep}</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <span className="text-zinc-400 font-mono text-[10px] font-bold uppercase">Event Queue</span>
          <span className={`text-sm font-mono font-bold ${engine.queueSize >= 0 ? 'text-zinc-200' : 'text-zinc-400'}`}>
            {engine.queueSize >= 0 ? `${engine.queueSize} events` : '0 events'}
          </span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col justify-between">
          <span className="text-zinc-400 font-mono text-[10px] font-bold uppercase">Pipeline Latency</span>
          <span className="text-sm font-mono font-bold text-emerald-400">{engine.latencyMs}ms</span>
        </div>
      </div>

      {/* Connections Health Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        <div className={`flex items-center justify-between p-2 rounded-lg border ${conn.market ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1.5 font-bold">
            <Radio className="w-3.5 h-3.5 shrink-0" /> Market Feed
          </span>
          <span className="font-mono font-bold uppercase">{conn.market ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-2 rounded-lg border ${isDbConnected ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1.5 font-bold">
            <Database className="w-3.5 h-3.5 shrink-0" /> Database
          </span>
          <span className="font-mono font-bold uppercase">{isDbConnected ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-2 rounded-lg border ${conn.redis ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1.5 font-bold">
            <Server className="w-3.5 h-3.5 shrink-0" /> Redis Queue
          </span>
          <span className="font-mono font-bold uppercase">{conn.redis ? 'ONLINE' : 'OFFLINE'}</span>
        </div>

        <div className={`flex items-center justify-between p-2 rounded-lg border ${conn.realtimeChannel ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/20 border-rose-800/40 text-rose-300'}`}>
          <span className="font-mono flex items-center gap-1.5 font-bold">
            <Zap className="w-3.5 h-3.5 shrink-0" /> Event Bus
          </span>
          <span className="font-mono font-bold uppercase">{conn.realtimeChannel ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
      </div>
    </div>
  );
});

