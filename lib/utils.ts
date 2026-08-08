import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getStatusBadge(status: string) {
  const s = status?.toLowerCase() || '';
  if (['approved', 'signal_active', 'take_partial', 'finished', 'win', 'valid', 'pass', 'tp tercapai', 'tp1 hit', 'tp2 hit', 'tp3 hit', 'healthy', 'online'].some(x => s === x || s.includes(x))) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (['active', 'validated', 'live', 'connected'].some(x => s === x || s.includes(x))) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (['rejected', 'error', 'disconnected', 'unavailable', 'block', 'invalid', 'fail', 'sl tercapai', 'failed'].some(x => s === x || s.includes(x))) return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (['warning', 'stale', 'degraded', 'reconnecting', 'suppressed'].some(x => s === x || s.includes(x))) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (['expired', 'history', 'cached'].some(x => s === x || s.includes(x))) return "text-zinc-400 bg-zinc-800 border-zinc-700";
  if (['not configured', 'placeholder', 'tbd', 'needs configuration'].some(x => s === x || s.includes(x))) return "text-zinc-400 bg-zinc-900 border-zinc-700 border-dashed";
  if (['disabled', 'stopped'].some(x => s === x || s.includes(x))) return "text-zinc-500 bg-zinc-900 border-zinc-800";
  if (['awaiting', 'idle', 'wait', 'pending', 'monitoring'].some(x => s === x || s.includes(x))) return "text-blue-400 bg-zinc-900 border-blue-900/40";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

export function getMcpStatusBadge(displayStatus: string) {
  const s = displayStatus?.toUpperCase() || '';
  if (s === "ONLINE" || s === "CONNECTED" || s === "CONFIGURED") return "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";
  if (s === "NOT CONFIGURED") return "border-zinc-700 border-dashed text-zinc-400 bg-zinc-900";
  if (s === "OFFLINE" || s === "DISCONNECTED") return "border-zinc-800 border-dashed text-zinc-500 bg-zinc-950";
  if (s === "RATE LIMITED" || s === "DEGRADED" || s === "QUOTA_EXCEEDED") return "border-amber-500/50 text-amber-400 bg-amber-500/10";
  return "border-rose-500/50 text-rose-400 bg-rose-500/10";
}

export function formatMcpStatus(status: string, error?: string | null): string {
  const s = status?.toUpperCase() || '';
  if (s === 'ACTIVE' || s === 'ONLINE' || s === 'CONNECTED') return 'ONLINE';
  if (s === 'NOT CONFIGURED' || s === 'NEEDS CONFIGURATION') return 'NOT CONFIGURED';
  if (s === 'OFFLINE' || s === 'DISCONNECTED') return 'OFFLINE';
  if (s === 'RATE LIMITED') return 'RATE LIMITED';
  if (s === 'QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED';
  if (s === 'DEGRADED') return 'DEGRADED';
  if (s === 'UNAVAILABLE' || s === 'ERROR') {
      if (error && (error.includes('429') || error.toLowerCase().includes('rate limited') || error.toLowerCase().includes('too many requests'))) return 'RATE LIMITED';
      if (error && (error.toLowerCase().includes('quota') || error.toLowerCase().includes('exhausted'))) return 'QUOTA_EXCEEDED';
      return 'UNAVAILABLE';
  }
  return s;
}
