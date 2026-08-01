"use client";

import { memo } from "react";
import { Server, ShieldCheck, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { DashboardSnapshotSystem } from "@/types";
import { getMcpStatusBadge } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface SystemHealthPanelProps {
  system: DashboardSnapshotSystem;
}

export const SystemHealthPanel = memo(function SystemHealthPanel({ system }: SystemHealthPanelProps) {
  const router = useRouter();
  const status = system.status;
  const services = system.services || [];
  const mcps = system.mcp || [];

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 shadow-md backdrop-blur-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-zinc-950 border border-zinc-800">
            <Server className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wide">
              SYSTEM & MCP INTEGRATIONS
            </h3>
            <p className="text-[9px] text-zinc-400 font-mono">
              Cluster Health Status
            </p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border uppercase tracking-wider flex items-center gap-1 ${
            status === 'healthy' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            status === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
            'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {status === 'healthy' && <ShieldCheck className="w-2.5 h-2.5" />}
          {status === 'warning' && <AlertTriangle className="w-2.5 h-2.5" />}
          {status !== 'healthy' && status !== 'warning' && <XCircle className="w-2.5 h-2.5" />}
          SYSTEM: {status.toUpperCase()}
        </span>
      </div>

      {/* Services List */}
      <div className="space-y-1.5 text-[8px] font-mono">
        <span className="text-zinc-500 uppercase font-bold block">Services Audit</span>
        {services.length > 0 ? (
          services.slice(0, 5).map((srv) => (
            <div
              key={srv.serviceName}
              className="flex items-center justify-between p-1.5 rounded bg-zinc-950/80 border border-zinc-800/80"
            >
              <span className="text-zinc-300 font-bold capitalize">
                {srv.serviceName.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <span className={`px-1.5 py-0.5 rounded border uppercase font-bold ${getMcpStatusBadge(srv.status)}`}>
                {srv.status}
              </span>
            </div>
          ))
        ) : (
          <div className="p-2 text-zinc-500 text-center bg-zinc-950/40 rounded border border-zinc-800">
            Checking service metrics...
          </div>
        )}
      </div>

      {/* MCP Status */}
      <div className="space-y-1.5 text-[8px] font-mono pt-1">
        <span className="text-zinc-500 uppercase font-bold block">Active MCP Drivers</span>
        {mcps.length > 0 ? (
          mcps.slice(0, 4).map((mcp) => (
            <div
              key={mcp.name}
              className="flex items-center justify-between p-1.5 rounded bg-zinc-950/80 border border-zinc-800/80"
            >
              <span className="text-zinc-300 font-bold truncate pr-2">{mcp.name}</span>
              <span className={`px-1.5 py-0.5 rounded border uppercase font-bold shrink-0 ${getMcpStatusBadge(mcp.status)}`}>
                {mcp.status}
              </span>
            </div>
          ))
        ) : (
          <div className="p-2 text-zinc-500 text-center bg-zinc-950/40 rounded border border-zinc-800">
            No MCP drivers reported
          </div>
        )}
      </div>

      <button
        onClick={() => router.push("/settings")}
        className="w-full text-[8px] font-mono font-bold tracking-wider text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800 hover:border-zinc-700 py-1.5 rounded transition-all uppercase flex items-center justify-center gap-1"
      >
        Configure Systems & Settings <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
});
