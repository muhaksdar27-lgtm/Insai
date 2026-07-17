"use client";

import {
  Settings as SettingsIcon,
  Activity,
  Server,
  ShieldAlert,
  Key,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle, ServerOff,
  FileText,
  X,
  BarChart2,
  Download,
} from "lucide-react";
import { useState } from "react";
import { ClientDate } from "@/components/client-date";
import { getMcpStatusBadge, formatMcpStatus } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";

export default function Settings() {
  const { data: configStatus, loading: loadingConfig, error: errorConfig, refetch: refetchConfig } = useFetch<any>("/api/config/status", null);
  const { data: mcpStatus, loading: loadingMcp, error: errorMcp, refetch: refetchMcp } = useFetch<any[]>("/api/mcp/status", []);
  const { data: healthStatus, loading: loadingHealth, error: errorHealth, refetch: refetchHealth } = useFetch<any>("/api/system/health", null);
  const { data: errorsData } = useFetch<any>("/api/system/errors", null);
  const { data: metricsData, loading: loadingMetrics, error: errorMetrics, refetch: refetchMetrics } = useFetch<any>("/api/system/metrics", null);

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedMcp, setSelectedMcp] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logSeverity, setLogSeverity] = useState<string>("all");
  const [showHealthSnapshot, setShowHealthSnapshot] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

    const handleSaveEnv = async (key: string) => {
    const val = envValues[key];
    if (!val) return;
    setSavingKey(key);
    setSaveError(null);
    try {
      const res = await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key.toUpperCase()]: val }),
      });
      if (res.ok) {
         setEnvValues(prev => ({ ...prev, [key]: "" }));
         refetchConfig();
         refetchMcp();
         refetchHealth();
      } else {
         const errorData = await res.json().catch(()=>null);
         setSaveError(errorData?.error?.message || "Failed to save configuration.");
      }
    } catch (e: any) {
      console.error(e);
      setSaveError(e.message || "Network error while saving.");
    } finally {
      setSavingKey(null);
    }
  };

    const loadLogs = async () => {
    setShowLogs(true);
    setLogError(null);
    try {
      const res = await fetch("/api/system/logs", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load logs");
      const data = await res.json();
      if (data.success || data.status === "success") {
        setLogs(data.data);
      } else {
        throw new Error(data.error?.message || "Unknown API error");
      }
    } catch (e: any) {
      console.error(e);
      setLogError(e.message || "Failed to load logs.");
    }
  };

  const downloadLogsCSV = () => {
    const filteredLogs = logs.filter(log => logSeverity === "all" || log.level === logSeverity);
    if (filteredLogs.length === 0) return;

    const headers = ["Timestamp", "Level", "Message", "Additional Data"];
    const csvContent = [
      headers.join(","),
      ...filteredLogs.map(log => {
        const additionalData = Object.keys(log)
          .filter(k => !["timestamp", "level", "message"].includes(k))
          .reduce((acc, k) => {
            acc[k] = log[k];
            return acc;
          }, {} as any);
        
        return [
          `"${log.timestamp || ""}"`,
          `"${log.level || ""}"`,
          `"${(log.message || "").replace(/"/g, '""')}"`,
          `"${JSON.stringify(additionalData).replace(/"/g, '""')}"`
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `system-logs-${logSeverity}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ONLINE":
        return "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";
      case "RATE LIMITED":
      case "DEGRADED":
        return "border-amber-500/20 text-amber-400 bg-amber-500/10";
      case "UNAVAILABLE":
        return "border-rose-500/50 text-rose-400 bg-rose-500/10";
      case "OFFLINE":
        return "border-zinc-700 border-dashed text-zinc-500 bg-zinc-950";
      case "NOT CONFIGURED":
        return "border-zinc-700 border-dashed text-zinc-400 bg-zinc-900";
      default:
        return "border-zinc-700 text-zinc-400 bg-zinc-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ONLINE":
        return <CheckCircle2 className="w-3 h-3" />;
      case "RATE LIMITED":
      case "DEGRADED":
        return <AlertTriangle className="w-3 h-3" />;
      case "UNAVAILABLE":
        return <XCircle className="w-3 h-3" />;
      case "OFFLINE":
        return <ServerOff className="w-3 h-3" />;
      case "NOT CONFIGURED":
        return <ShieldAlert className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  const categories = [
    "All",
    ...Array.from(new Set(mcpStatus.map((m) => m.category))),
  ].filter(Boolean);
  const filteredMcps =
    selectedCategory === "All"
      ? mcpStatus
      : mcpStatus.filter((m) => m.category === selectedCategory);

  return (
    <div className="space-y-6 relative h-full">
      <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
        <div>
          <h2 className="text-[14px] font-bold text-white flex items-center gap-2.5 uppercase tracking-widest">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                <SettingsIcon className="w-4 h-4 text-zinc-300 relative z-10" />
            </div>
            Settings & Observability
          </h2>
          <p className="text-[11px] text-zinc-400 mt-2.5 tracking-wide font-medium">
            Konfigurasi dan monitoring sistem menyeluruh
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
        {/* Runtime Health */}
        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
          <h3 className="text-[11px] font-bold text-white mb-5 uppercase tracking-widest flex items-center gap-2 relative z-10">
            <Activity className="w-4 h-4 text-blue-400" /> Runtime Health
          </h3>
          <div className="space-y-4 relative z-10">
            {loadingHealth ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorHealth ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorHealth}</span>
                <button onClick={refetchHealth} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : healthStatus ? (
              healthStatus.services.map((service: any) => (
                <div
                  key={service.serviceName}
                  className="flex flex-col py-3 border-b border-white/10 last:border-0"
                >
                  <div className="flex justify-between items-center text-[11px]" title={service.message}>
                    <span className="text-zinc-300 flex items-center gap-2.5">
                      {service.serviceName === "Supabase" && (
                        <Server className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "MarketData" && (
                        <Activity className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "EconomicCalendar" && (
                        <BarChart2 className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "GeminiAI" && (
                        <SettingsIcon className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "TelegramBot" && (
                        <SettingsIcon className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "RuleEngine" && (
                        <ShieldAlert className="w-4 h-4 text-zinc-400" />
                      )}
                      {service.serviceName === "PythonEngine" && (
                        <Server className="w-4 h-4 text-zinc-400" />
                      )}
                      <span className="font-bold tracking-wide">{service.serviceName}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusColor(service.status)}`}
                    >
                      {getStatusIcon(service.status)} {service.status}
                    </span>
                  </div>
                  {service.status !== 'ONLINE' && service.message && (
                    <span className="text-[10px] text-zinc-500 mt-2 pl-6 line-clamp-2 italic">
                      Reason: {service.message}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading health status...
              </div>
            )}

            <div className="flex justify-between items-center text-[11px] py-4 border-t border-white/10 mt-2">
              <span className="text-zinc-400 flex items-center gap-2 font-bold uppercase tracking-widest">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Recent
                Errors
              </span>
              <span className="text-zinc-400 text-[10px] bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 font-mono font-bold shadow-sm">
                {errorsData?.count24h ?? 0} in last 24h
              </span>
            </div>

            <div className="mt-2 space-y-3">
              <button
                onClick={() => setShowHealthSnapshot(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-bold tracking-widest uppercase text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shadow-sm"
              >
                <Activity className="w-3.5 h-3.5" /> View Health Snapshot
              </button>
              <button
                onClick={loadLogs}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-bold tracking-widest uppercase text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" /> View System Logs
              </button>
            </div>
          </div>
        </div>

        {/* API Status */}
        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
          <div className="flex items-center justify-between mb-5 relative z-10">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-400" /> Config & API Keys
            </h3>
            {configStatus?.lastChecked && (
              <span className="text-[9px] text-zinc-500 font-mono font-bold tracking-widest flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg border border-white/10 shadow-sm">
                <Clock className="w-3 h-3" />
                <ClientDate date={configStatus.lastChecked} format="toLocaleTimeString" />
              </span>
            )}
          </div>
          {saveError && (
            <div className="mb-5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] px-4 py-3 rounded-xl flex items-center gap-2 font-bold tracking-wide relative z-10">
              <AlertTriangle className="w-4 h-4" /> {saveError}
              <button onClick={() => setSaveError(null)} className="ml-auto hover:text-rose-300"><X className="w-4 h-4" /></button>
            </div>
          )}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
            {loadingConfig ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-10 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-10 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorConfig ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorConfig}</span>
                <button onClick={refetchConfig} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : configStatus?.env ? (
              <>
                <div className="space-y-5">
                  {Object.entries(configStatus.env).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-2.5 pb-5 border-b border-white/10 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <label className="text-zinc-300 capitalize text-[11px] font-bold tracking-widest">
                          {key.replace(/_/g, " ")}
                        </label>
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] uppercase tracking-widest font-bold border shadow-sm ${value === "configured" || value === "online" ? "border-blue-500/30 text-blue-400 bg-blue-500/10" : value === "offline" || value === "error" ? "border-rose-500/30 text-rose-400 bg-rose-500/10" : "border-white/10 text-zinc-400 bg-white/5"}`}
                        >
                          {String(value)}
                        </span>
                      </div>
                      <div className="flex gap-2.5">
                         <input 
                           type={value === "configured" ? "password" : "text"}
                           placeholder={value === "configured" ? "••••••••••••••••" : `Enter ${key}...`}
                           disabled={value === "configured" || savingKey === key}
                           value={envValues[key] || ""}
                           onChange={(e) => setEnvValues({ ...envValues, [key]: e.target.value })}
                           className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[11px] font-mono text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-600 shadow-inner"
                         />
                         {value !== "configured" && (
                           <button 
                             onClick={() => handleSaveEnv(key)}
                             disabled={!envValues[key] || savingKey === key}
                             className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                           >
                             {savingKey === key ? "SAVING" : "SAVE"}
                           </button>
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading config status...
              </div>
            )}
          </div>
        </div>

        {/* System Metrics */}
        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl"></div>
          <h3 className="text-[11px] font-bold text-white mb-5 uppercase tracking-widest flex items-center gap-2 relative z-10">
            <BarChart2 className="w-4 h-4 text-emerald-400" /> System Metrics
          </h3>
          <div className="space-y-4 relative z-10">
            {loadingMetrics ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorMetrics ? (
               <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorMetrics}</span>
                <button onClick={refetchMetrics} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : metricsData ? (
              <>
                <div className="flex justify-between items-center text-[11px] py-3 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Market Data Latency</span>
                  <span
                    className={`font-mono font-black text-[13px] ${metricsData.marketDataLatencyMs > 500 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.marketDataLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-3 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">AI Validation Latency</span>
                  <span
                    className={`font-mono font-black text-[13px] ${metricsData.aiValidationLatencyMs > 2000 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.aiValidationLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-3 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Signal Throughput</span>
                  <span className="font-mono font-black text-white text-[13px]">
                    {metricsData.signalThroughput}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-3 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Error Rate</span>
                  <span
                    className={`font-mono font-black text-[13px] ${metricsData.errorRate > 0.1 ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    {(metricsData.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] py-3">
                  <span className="text-zinc-300 font-bold tracking-wide">Notification Delivery</span>
                  <span className="font-mono font-black text-emerald-400 text-[13px]">
                    {(metricsData.notificationDeliveryRate * 100).toFixed(1)}%
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading system metrics...
              </div>
            )}
          </div>
        </div>

        {/* MCP Status */}
        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 md:col-span-2 lg:col-span-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 relative z-10">
            <h3 className="text-[12px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> MCP Registry (
              {filteredMcps.length})
            </h3>

            <div className="flex items-center flex-wrap gap-2.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all border shadow-sm ${
                    selectedCategory === cat
                      ? "bg-white text-black border-white"
                      : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
            {loadingMcp ? (
              <div className="text-[11px] text-zinc-500 col-span-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="h-20 bg-white/5 animate-pulse rounded-2xl w-full"></div>
                    <div className="h-20 bg-white/5 animate-pulse rounded-2xl w-full"></div>
                    <div className="h-20 bg-white/5 animate-pulse rounded-2xl w-full"></div>
                </div>
              </div>
            ) : errorMcp ? (
              <div className="text-[11px] text-rose-400 col-span-full flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorMcp}</span>
                <button onClick={refetchMcp} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry</button>
              </div>
            ) : mcpStatus.length > 0 ? (
              filteredMcps.map((mcp) => (
                <div
                  key={mcp.name}
                  onClick={() => setSelectedMcp(mcp)}
                  className="flex flex-col justify-between gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-colors shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent transition-all"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[12px] font-bold text-white line-clamp-1 tracking-wide">
                        {mcp.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shrink-0 shadow-sm ${getMcpStatusBadge(formatMcpStatus(mcp.status, mcp.lastError))}`}
                      >
                        {formatMcpStatus(mcp.status, mcp.lastError)}
                      </span>
                    </div>
                    {formatMcpStatus(mcp.status, mcp.lastError) === 'UNAVAILABLE' && mcp.lastError && (
                      <span className="block text-[10px] text-rose-400 mt-1 mb-2 font-medium leading-tight line-clamp-2 italic">
                        Reason: {mcp.lastError}
                      </span>
                    )}
                    <span className="block text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                      {mcp.category}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-zinc-500">
                Loading MCP status...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer (Conditional Render) */}
      {selectedMcp && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setSelectedMcp(null)}
        >
          <div
            className="w-full max-w-sm h-full bg-black/80 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 overflow-y-auto animate-in slide-in-from-right duration-200 backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest">MCP Details</h3>
              <button
                onClick={() => setSelectedMcp(null)}
                className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                <h4 className="text-[14px] font-bold text-white mb-3 relative z-10">
                  {selectedMcp.name}
                </h4>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border shadow-sm relative z-10 ${getMcpStatusBadge(formatMcpStatus(selectedMcp.status, selectedMcp.lastError))}`}
                >
                  Status: {formatMcpStatus(selectedMcp.status, selectedMcp.lastError)}
                </span>
                {formatMcpStatus(selectedMcp.status, selectedMcp.lastError) === 'UNAVAILABLE' && selectedMcp.lastError && (
                  <div className="mt-3 text-[11px] text-rose-400 font-bold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 relative z-10">
                    Reason: {selectedMcp.lastError}
                  </div>
                )}
              </div>

              <div className="space-y-5 px-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
                    Category
                  </span>
                  <span className="text-[12px] font-bold text-zinc-200">
                    {selectedMcp.category}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
                    Purpose
                  </span>
                  <span className="text-[12px] font-medium text-zinc-300 leading-relaxed">
                    {selectedMcp.purpose}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
                    Source Type
                  </span>
                  <span className="text-[12px] font-bold text-zinc-200">
                    {selectedMcp.sourceType || "Internal"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Dependencies
                  </span>
                  {selectedMcp.dependencies &&
                  selectedMcp.dependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedMcp.dependencies.map((dep: string) => (
                        <span
                          key={dep}
                          className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono font-bold text-zinc-300 shadow-sm"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[12px] text-zinc-500 italic">None</span>
                  )}
                </div>

                <div className="pt-6 border-t border-white/10">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Last Checked
                  </span>
                  <span className="text-[12px] font-mono font-bold text-zinc-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 block w-fit">
                    {selectedMcp.lastCheck
                      ? <ClientDate date={selectedMcp.lastCheck} />
                      : "Never"}
                  </span>
                </div>

                {selectedMcp.lastError && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-rose-500 mb-1">
                      Last Error
                    </span>
                    <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded block">
                      {selectedMcp.lastError}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Drawer */}
      {showLogs && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setShowLogs(false)}
        >
          <div
            className="w-full max-w-3xl h-full bg-black/90 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 flex flex-col animate-in slide-in-from-right duration-200 backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 shrink-0 gap-4">
              <h3 className="text-[14px] font-bold text-white flex items-center gap-2.5 uppercase tracking-widest">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm">
                  <FileText className="w-4 h-4 text-zinc-300" />
                </div>
                System Logs
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={downloadLogsCSV}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-bold tracking-widest uppercase rounded-xl hover:bg-white/10 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={loadLogs}
                  className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-bold tracking-widest uppercase rounded-xl hover:bg-white/10 transition-colors shadow-sm"
                >
                  Refresh
                </button>
                <select
                  value={logSeverity}
                  onChange={(e) => setLogSeverity(e.target.value)}
                  className="bg-black/40 border border-white/10 text-white text-[11px] font-bold tracking-widest uppercase rounded-xl px-3 py-2 focus:outline-none focus:border-white/30 cursor-pointer shadow-sm appearance-none"
                >
                  <option value="all">All Severities</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-2 ml-1 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {logError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-bold tracking-wide px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm">
                <AlertTriangle className="w-4 h-4" /> {logError}
              </div>
            )}
            <div className="flex-1 overflow-y-auto bg-black/60 border border-white/10 rounded-2xl p-4 font-mono text-[10px] sm:text-[11px] shadow-inner custom-scrollbar">
              {logs.filter(log => logSeverity === "all" || log.level === logSeverity).length === 0 ? (
                <div className="text-zinc-500 text-center py-12 font-medium tracking-wide">
                  No logs available for selected severity.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {logs.filter(log => logSeverity === "all" || log.level === logSeverity).slice(0, 100).map((log, idx) => (
                    <div
                      key={idx}
                      className="flex gap-4 border-b border-white/5 pb-2.5 last:border-0 break-all"
                    >
                      <span className="text-zinc-500 shrink-0 font-bold">
                        <ClientDate date={log.timestamp} format="toLocaleTimeString" />
                      </span>
                      <span
                        className={`shrink-0 uppercase font-black tracking-widest ${
                          log.level === "error"
                            ? "text-rose-400"
                            : log.level === "warn"
                              ? "text-amber-400"
                              : log.level === "debug"
                                ? "text-zinc-400"
                                : "text-emerald-400"
                        }`}
                      >
                        [{log.level}]
                      </span>
                      <span className="text-zinc-300 leading-relaxed font-medium">
                        {log.message}
                        {Object.keys(log).filter(
                          (k) => !["timestamp", "level", "message"].includes(k),
                        ).length > 0 && (
                          <span className="block mt-1.5 text-zinc-500 bg-white/5 p-2 rounded-lg border border-white/5">
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(log).filter(
                                  ([k]) =>
                                    !["timestamp", "level", "message"].includes(
                                      k,
                                    ),
                                ),
                              ),
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Health Snapshot Drawer */}
      {showHealthSnapshot && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setShowHealthSnapshot(false)}
        >
          <div
            className="w-full max-w-md h-full bg-black/90 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 overflow-y-auto animate-in slide-in-from-right duration-200 backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[13px] font-bold text-white uppercase flex items-center gap-2.5 tracking-widest">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 shadow-sm">
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                Health Snapshot
              </h3>
              <button
                onClick={() => setShowHealthSnapshot(false)}
                className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-3 relative z-10">Overall Status</span>
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-black uppercase tracking-widest border shadow-sm relative z-10 ${getStatusColor(healthStatus?.status || 'unavailable')}`}>
                  {getStatusIcon(healthStatus?.status || 'unavailable')}
                  {healthStatus?.status || 'Loading...'}
                </span>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-white uppercase tracking-widest pl-2">Service Details</h4>
                {healthStatus?.services?.map((service: any) => (
                   <div key={service.serviceName} className="bg-black/40 border border-white/10 p-5 rounded-2xl shadow-sm hover:border-white/20 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[12px] font-bold text-white tracking-wide">{service.serviceName}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border shadow-sm ${getStatusColor(service.status)}`}>
                          {service.status}
                        </span>
                      </div>
                      <div className="space-y-2 border-t border-white/10 pt-4">
                        <div className="flex justify-between text-[10px] items-center">
                          <span className="text-zinc-500 font-bold uppercase tracking-widest">Latency:</span>
                          <span className="text-zinc-300 font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">{service.latencyMs !== undefined ? `${service.latencyMs}ms` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-[10px] items-center">
                          <span className="text-zinc-500 font-bold uppercase tracking-widest">Last Checked:</span>
                          <span className="text-zinc-300 font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10"><ClientDate date={service.lastChecked} format="toLocaleTimeString" /></span>
                        </div>
                        {service.message && (
                           <div className="mt-3 text-[10px] text-zinc-300 bg-white/5 p-3 rounded-xl border border-white/10 font-medium italic leading-relaxed">
                             {service.message}
                           </div>
                        )}
                      </div>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
