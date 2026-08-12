const fs = require('fs');
let content = fs.readFileSync('lib/utils.ts', 'utf8');

// replace getStatusBadge
const regex = /export function getStatusBadge\(status: string\) \{[\s\S]*?return "text-zinc-400 bg-zinc-800 border-zinc-700";\n\}/;

const replacement = `export function getStatusBadge(status: string) {
  const s = status?.toLowerCase() || '';
  if (['approved', 'signal_active', 'take_partial', 'finished', 'win', 'valid', 'pass', 'tp tercapai', 'tp1 hit', 'tp2 hit', 'tp3 hit', 'healthy', 'online'].some(x => s === x || s.includes(x))) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (['active', 'validated', 'live', 'connected', 'dispatched'].some(x => s === x || s.includes(x))) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (['rejected', 'error', 'disconnected', 'unavailable', 'block', 'invalid', 'fail', 'sl tercapai', 'failed'].some(x => s === x || s.includes(x))) return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (['warning', 'stale', 'degraded', 'reconnecting', 'suppressed'].some(x => s === x || s.includes(x))) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (['expired', 'history', 'cached'].some(x => s === x || s.includes(x))) return "text-zinc-400 bg-zinc-800 border-zinc-700";
  if (s.startsWith('wait_') || ['awaiting', 'idle', 'wait', 'pending', 'monitoring'].some(x => s === x || s.includes(x))) return "text-amber-400/80 bg-amber-500/5 border-amber-500/20 border-dashed";
  if (['not configured', 'placeholder', 'tbd', 'needs configuration'].some(x => s === x || s.includes(x))) return "text-zinc-400 bg-zinc-900 border-zinc-700 border-dashed";
  if (['disabled', 'stopped'].some(x => s === x || s.includes(x))) return "text-zinc-500 bg-zinc-900 border-zinc-800";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('lib/utils.ts', content);
    console.log("Successfully replaced getStatusBadge");
} else {
    console.log("Could not find getStatusBadge match");
}
