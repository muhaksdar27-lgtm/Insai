const fs = require('fs');
let code = fs.readFileSync('components/dashboard/executive-summary-panel.tsx', 'utf8');

code = code.replace(
  'className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"',
  'className={`w-1.5 h-1.5 rounded-full shrink-0 ${strat.status === "stopped" ? "bg-rose-500" : "bg-emerald-500"}`}'
);

fs.writeFileSync('components/dashboard/executive-summary-panel.tsx', code);
