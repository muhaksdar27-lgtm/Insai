"use client";

import {
  Settings as SettingsIcon,
  Activity,
  Server,
  Key,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ServerOff,
  FileText,
  X,
  BarChart2,
  Download,
  RotateCw,
  Zap,
  Save,
  RotateCcw,
  Check,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ClientDate } from "@/components/client-date";
import { getMcpStatusBadge, formatMcpStatus } from "@/lib/utils";
import { useFetch } from "@/hooks/use-fetch";

interface EngineCardDef {
  id: 'backend' | 'python' | 'ai' | 'database' | 'queue' | 'redis';
  name: string;
  typeLabel: string;
  description: string;
  icon: any;
}

const ENGINE_DEFINITIONS: EngineCardDef[] = [
  {
    id: 'backend',
    name: 'Backend Engine',
    typeLabel: 'Node.js Core / Pipeline',
    description: 'Trading Engine Core, Signal Pipeline & REST API',
    icon: Server,
  },
  {
    id: 'python',
    name: 'Python Engine',
    typeLabel: 'TA-Lib / Structural Scanner',
    description: 'Order Block, FVG, BOS/CHoCH & Pattern Engine',
    icon: Activity,
  },
  {
    id: 'ai',
    name: 'AI Engine',
    typeLabel: 'Gemini AI / Antigravity Agent',
    description: 'AI Signal Reasoning, Risk Audit & Deep Research',
    icon: SettingsIcon,
  },
  {
    id: 'database',
    name: 'Database Engine',
    typeLabel: 'PostgreSQL Database',
    description: 'Persistent Trade History, Metrics & Audit Logs',
    icon: Server,
  },
  {
    id: 'queue',
    name: 'Queue Engine',
    typeLabel: 'Event Bus / PubSub',
    description: 'Asynchronous Event Pipeline & Signal Distribution',
    icon: BarChart2,
  },
  {
    id: 'redis',
    name: 'Redis Engine',
    typeLabel: 'Cache & Lock Broker',
    description: 'State Deduplication, Stream Broker & Cache',
    icon: Clock,
  },
];

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
  const [logError, setLogError] = useState<string | null>(null);

  // Editable Configuration State
  const [formData, setFormData] = useState<Record<string, string>>({
    STANDARD_PIP_BUFFER: "15",
    MIN_ENGULFING_BODY_RATIO: "0.6",
    DOUBLE_PATTERN_TOLERANCE: "20",
    NEWS_NO_TRADE_WINDOW: "15",
    PYTHON_ENGINE_URL: "",
    TELEGRAM_CHAT_ID: "",
    TWELVEDATA_API_KEY: "",
    NEWS_API_KEY: "",
    TELEGRAM_BOT_TOKEN: "",
    GEMINI_API_KEY: "",
  });
  const [baselineData, setBaselineData] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!configStatus?.values) return;
    const initial = {
      STANDARD_PIP_BUFFER: configStatus.values.STANDARD_PIP_BUFFER || "15",
      MIN_ENGULFING_BODY_RATIO: configStatus.values.MIN_ENGULFING_BODY_RATIO || "0.6",
      DOUBLE_PATTERN_TOLERANCE: configStatus.values.DOUBLE_PATTERN_TOLERANCE || "20",
      NEWS_NO_TRADE_WINDOW: configStatus.values.NEWS_NO_TRADE_WINDOW || "15",
      PYTHON_ENGINE_URL: configStatus.values.PYTHON_ENGINE_URL || "",
      TELEGRAM_CHAT_ID: configStatus.values.TELEGRAM_CHAT_ID || "",
      TWELVEDATA_API_KEY: "",
      NEWS_API_KEY: "",
      TELEGRAM_BOT_TOKEN: "",
      GEMINI_API_KEY: "",
    };
    const timer = setTimeout(() => {
      setBaselineData(initial);
      setFormData((prev) => ({
        ...initial,
        STANDARD_PIP_BUFFER: prev.STANDARD_PIP_BUFFER !== "15" ? prev.STANDARD_PIP_BUFFER : initial.STANDARD_PIP_BUFFER,
        MIN_ENGULFING_BODY_RATIO: prev.MIN_ENGULFING_BODY_RATIO !== "0.6" ? prev.MIN_ENGULFING_BODY_RATIO : initial.MIN_ENGULFING_BODY_RATIO,
        DOUBLE_PATTERN_TOLERANCE: prev.DOUBLE_PATTERN_TOLERANCE !== "20" ? prev.DOUBLE_PATTERN_TOLERANCE : initial.DOUBLE_PATTERN_TOLERANCE,
        NEWS_NO_TRADE_WINDOW: prev.NEWS_NO_TRADE_WINDOW !== "15" ? prev.NEWS_NO_TRADE_WINDOW : initial.NEWS_NO_TRADE_WINDOW,
        PYTHON_ENGINE_URL: prev.PYTHON_ENGINE_URL || initial.PYTHON_ENGINE_URL,
        TELEGRAM_CHAT_ID: prev.TELEGRAM_CHAT_ID || initial.TELEGRAM_CHAT_ID,
      }));
    }, 0);
    return () => clearTimeout(timer);
  }, [configStatus]);

  const validateForm = () => {
    const errs: Record<string, string> = {};
    const pip = Number(formData.STANDARD_PIP_BUFFER);
    if (isNaN(pip) || pip < 0 || pip > 500) {
      errs.STANDARD_PIP_BUFFER = "Must be between 0 and 500 pips";
    }
    const ratio = Number(formData.MIN_ENGULFING_BODY_RATIO);
    if (isNaN(ratio) || ratio <= 0 || ratio > 1) {
      errs.MIN_ENGULFING_BODY_RATIO = "Must be a decimal between 0.1 and 1.0";
    }
    const tol = Number(formData.DOUBLE_PATTERN_TOLERANCE);
    if (isNaN(tol) || tol < 0 || tol > 500) {
      errs.DOUBLE_PATTERN_TOLERANCE = "Must be between 0 and 500 pips";
    }
    const news = Number(formData.NEWS_NO_TRADE_WINDOW);
    if (isNaN(news) || news < 0 || news > 180) {
      errs.NEWS_NO_TRADE_WINDOW = "Must be between 0 and 180 minutes";
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaveSuccess(null);
    setSaveError(null);

    if (!validateForm()) {
      setSaveError("Validation failed. Please correct parameters before saving.");
      return;
    }

    setSavingConfig(true);
    try {
      const payload: Record<string, any> = {};
      for (const [key, val] of Object.entries(formData)) {
        if (val !== undefined && val !== null && val !== "") {
          payload[key] = val;
        }
      }

      const res = await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message || `Save failed with status ${res.status}`);
      }

      setSaveSuccess(data.data?.message || "Configuration successfully saved!");
      setBaselineData({ ...formData });
      refetchConfig();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetConfig = () => {
    setFormData({ ...baselineData });
    setValidationErrors({});
    setSaveSuccess(null);
    setSaveError(null);
  };

  // Engine Pings State
  const [enginePings, setEnginePings] = useState<Record<string, {
    status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'ERROR';
    latencyMs: number;
    lastChecked: string;
    message: string;
    details?: Record<string, any>;
  }>>({});
  const [pingingMap, setPingingMap] = useState<Record<string, boolean>>({});
  const [pingingAll, setPingingAll] = useState<boolean>(false);

  const pingEngineTarget = useCallback(async (target: string) => {
    setPingingMap((prev) => ({ ...prev, [target]: true }));
    try {
      const res = await fetch(`/api/system/ping?target=${target}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setEnginePings((prev) => {
            const next = { ...prev };
            data.data.forEach((item: any) => {
              next[item.engineId] = {
                status: item.status,
                latencyMs: item.latencyMs,
                lastChecked: item.lastChecked,
                message: item.message,
                details: item.details,
              };
            });
            return next;
          });
        }
      }
    } catch (e) {
      console.error(`Error pinging engine ${target}:`, e);
    } finally {
      setPingingMap((prev) => ({ ...prev, [target]: false }));
    }
  }, []);

  const pingAllEngines = useCallback(async () => {
    setPingingAll(true);
    try {
      const res = await fetch(`/api/system/ping?target=all`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const nextPings: Record<string, any> = {};
          data.data.forEach((item: any) => {
            nextPings[item.engineId] = {
              status: item.status,
              latencyMs: item.latencyMs,
              lastChecked: item.lastChecked,
              message: item.message,
              details: item.details,
            };
          });
          setEnginePings(nextPings);
        }
      }
    } catch (e) {
      console.error("Error pinging all engines:", e);
    } finally {
      setPingingAll(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      pingAllEngines();
    }, 0);
    return () => clearTimeout(timer);
  }, [pingAllEngines]);

  const loadLogs = async () => {
    setShowLogs(true);
    setLogError(null);
    try {
      const res = await fetch("/api/system/logs", { cache: "no-store" });
      const data = await res.json();
      if (data && (data.success || data.status === "success" || Array.isArray(data.data))) {
        setLogs(Array.isArray(data.data) ? data.data : []);
      } else {
        throw new Error(data?.error?.message || "Failed to load logs");
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
    try {
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `system-logs-${logSeverity}-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ONLINE":
        return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case "DEGRADED":
      case "RATE LIMITED":
        return <AlertTriangle className="w-3 h-3 text-amber-400" />;
      case "OFFLINE":
        return <ServerOff className="w-3 h-3 text-zinc-400" />;
      case "ERROR":
      case "UNAVAILABLE":
        return <XCircle className="w-3 h-3 text-rose-400" />;
      default:
        return <Clock className="w-3 h-3 text-zinc-500" />;
    }
  };

  const getEngineStatusBadge = (status?: string) => {
    const s = status?.toUpperCase() || 'OFFLINE';
    switch (s) {
      case 'ONLINE':
        return 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
      case 'DEGRADED':
        return 'border-amber-500/50 text-amber-400 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.15)]';
      case 'ERROR':
        return 'border-rose-500/50 text-rose-400 bg-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.15)]';
      case 'OFFLINE':
      default:
        return 'border-zinc-700 text-zinc-400 bg-zinc-900 shadow-sm';
    }
  };

  const categories = [
    "All",
    ...Array.from(new Set((mcpStatus || []).map((m) => m.category))),
  ].filter(Boolean);
  const filteredMcps =
    selectedCategory === "All"
      ? (mcpStatus || [])
      : (mcpStatus || []).filter((m) => m.category === selectedCategory);

  return (
    <div className="space-y-4 relative h-full pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-3 gap-3">
        <div>
          <h2 className="text-[11px] font-bold text-white flex items-center gap-2 uppercase tracking-widest">
            <div className="p-1 rounded bg-white/5 border border-white/10 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-white/5 blur-xl"></div>
                <SettingsIcon className="w-3.5 h-3.5 text-zinc-300 relative z-10" />
            </div>
            Settings & Engine Observability
          </h2>
          <p className="text-[10px] text-zinc-400 mt-1 tracking-wide font-medium">
            Dynamic real-time health verification & system diagnostics
          </p>
        </div>
        <button
          onClick={pingAllEngines}
          disabled={pingingAll}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all shadow-sm shrink-0 disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${pingingAll ? 'animate-spin' : ''}`} />
          {pingingAll ? 'Verifying All Engines...' : 'Ping All Engines'}
        </button>
      </div>

      {/* Engine Cards Section (Dynamic Health Check) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Engine Diagnostics Cards ({ENGINE_DEFINITIONS.length})
          </h3>
          <span className="text-[8px] text-zinc-400 font-mono">Real live pings — No static badges</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ENGINE_DEFINITIONS.map((def) => {
            const Icon = def.icon;
            const pingInfo = enginePings[def.id];
            const isPinging = pingingMap[def.id] || pingingAll;
            const status = pingInfo?.status || 'OFFLINE';

            return (
              <div
                key={def.id}
                className="bg-black/40 border border-white/10 rounded-lg p-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden flex flex-col justify-between gap-3 group hover:border-white/20 transition-all"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>

                <div className="space-y-2 relative z-10">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-white/5 border border-white/10">
                        <Icon className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-white tracking-wide">{def.name}</h4>
                        <span className="text-[7px] text-zinc-400 uppercase tracking-widest font-mono font-bold">{def.typeLabel}</span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${getEngineStatusBadge(status)}`}
                    >
                      {getStatusIcon(status)}
                      {status}
                    </span>
                  </div>

                  <p className="text-[9px] text-zinc-400 leading-snug font-medium">
                    {def.description}
                  </p>

                  <div className="bg-white/5 rounded-md p-2 border border-white/10 space-y-1 text-[8px] font-mono">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Ping Latency:</span>
                      <span className={`font-bold ${pingInfo?.latencyMs !== undefined && pingInfo.latencyMs < 150 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {pingInfo?.latencyMs !== undefined ? `${pingInfo.latencyMs} ms` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Last Verified:</span>
                      <span className="text-zinc-300 font-bold">
                        {pingInfo?.lastChecked ? (
                          <ClientDate date={pingInfo.lastChecked} format="toLocaleTimeString" />
                        ) : (
                          'Never'
                        )}
                      </span>
                    </div>
                  </div>

                  {pingInfo?.message && (
                    <div className="text-[8px] text-zinc-300 bg-black/60 p-2 rounded border border-white/10 italic leading-normal line-clamp-2">
                      {pingInfo.message}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => pingEngineTarget(def.id)}
                  disabled={isPinging}
                  className="w-full py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-md text-[8px] font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-1.5 shadow-sm relative z-10 disabled:opacity-50"
                >
                  <RotateCw className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
                  {isPinging ? `Pinging ${def.name}...` : `Ping ${def.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Observability Dashboards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
        {/* Runtime Health */}
        <div className="bg-black/40 border border-white/10 rounded-md p-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
          <h3 className="text-[8px] font-bold text-white mb-2 uppercase tracking-widest flex items-center gap-1.5 relative z-10">
            <Activity className="w-3 h-3 text-blue-400" /> Runtime Health Services
          </h3>
          <div className="space-y-2 relative z-10">
            {loadingHealth ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorHealth ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorHealth?.message || "Error loading health status"}</span>
                <button onClick={refetchHealth} className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : healthStatus ? (
              healthStatus.services.map((service: any) => (
                <div
                  key={service.serviceName}
                  className="flex flex-col py-1.5 border-b border-white/10 last:border-0"
                >
                  <div className="flex justify-between items-center text-[10px]" title={service.message}>
                    <span className="text-zinc-300 flex items-center gap-2">
                      <span className="font-bold tracking-wide">{service.serviceName}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border shadow-sm ${getMcpStatusBadge(service.status)}`}
                    >
                      {getStatusIcon(service.status)} {service.status}
                    </span>
                  </div>
                  {service.status !== 'ONLINE' && service.message && (
                    <span className="text-[9px] text-zinc-500 mt-1 line-clamp-2 italic">
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

            <div className="flex justify-between items-center text-[10px] py-2 border-t border-white/10 mt-1">
              <span className="text-zinc-400 flex items-center gap-1.5 font-bold uppercase tracking-widest">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> Recent Errors
              </span>
              <span className="text-zinc-400 text-[8px] bg-white/5 px-2 py-0.5 rounded border border-white/10 font-mono font-bold shadow-sm">
                {errorsData?.count24h ?? 0} in last 24h
              </span>
            </div>

            <div className="mt-0.5 space-y-1.5">
              <button
                onClick={() => setShowHealthSnapshot(true)}
                className="flex items-center justify-center gap-2 w-full py-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] font-bold tracking-widest uppercase text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shadow-sm"
              >
                <Activity className="w-3 h-3" /> View Health Snapshot
              </button>
              <button
                onClick={loadLogs}
                className="flex items-center justify-center gap-2 w-full py-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] font-bold tracking-widest uppercase text-zinc-300 hover:bg-white/10 hover:text-white transition-colors shadow-sm"
              >
                <FileText className="w-3 h-3" /> View System Logs
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Configuration Form */}
        <div className="bg-black/40 border border-white/10 rounded-md p-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden md:col-span-2 lg:col-span-2">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-3 relative z-10 border-b border-white/10 pb-2">
            <div>
              <h3 className="text-[9px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                <SettingsIcon className="w-3.5 h-3.5 text-blue-400" /> System & Strategy Parameters
              </h3>
              <p className="text-[8px] text-zinc-400 mt-0.5 font-medium">Configure active trading pips, thresholds, and runtime integrations</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetConfig}
                disabled={savingConfig}
                className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded text-[7px] font-bold uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="w-2.5 h-2.5 text-zinc-400" />
                Reset
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded text-[7px] font-bold uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
              >
                <Save className={`w-2.5 h-2.5 ${savingConfig ? 'animate-spin' : ''}`} />
                {savingConfig ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {saveSuccess && (
            <div className="mb-3 p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-medium flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>{saveSuccess}</span>
              </div>
              <button onClick={() => setSaveSuccess(null)} className="text-emerald-400 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          )}

          {saveError && (
            <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[8px] font-medium flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                <span>{saveError}</span>
              </div>
              <button onClick={() => setSaveError(null)} className="text-rose-400 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="space-y-3 relative z-10 text-[8px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">Standard Pip Buffer</label>
                <input
                  type="number"
                  step="1"
                  className={`w-full bg-white/5 border ${validationErrors.STANDARD_PIP_BUFFER ? 'border-rose-500' : 'border-white/10 focus:border-blue-500/50'} rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide`}
                  value={formData.STANDARD_PIP_BUFFER || ''}
                  onChange={(e) => setFormData({ ...formData, STANDARD_PIP_BUFFER: e.target.value })}
                  placeholder="15"
                />
                {validationErrors.STANDARD_PIP_BUFFER && (
                  <p className="text-rose-400 text-[7px] mt-0.5">{validationErrors.STANDARD_PIP_BUFFER}</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">Min Engulfing Body Ratio</label>
                <input
                  type="number"
                  step="0.05"
                  className={`w-full bg-white/5 border ${validationErrors.MIN_ENGULFING_BODY_RATIO ? 'border-rose-500' : 'border-white/10 focus:border-blue-500/50'} rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide`}
                  value={formData.MIN_ENGULFING_BODY_RATIO || ''}
                  onChange={(e) => setFormData({ ...formData, MIN_ENGULFING_BODY_RATIO: e.target.value })}
                  placeholder="0.6"
                />
                {validationErrors.MIN_ENGULFING_BODY_RATIO && (
                  <p className="text-rose-400 text-[7px] mt-0.5">{validationErrors.MIN_ENGULFING_BODY_RATIO}</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">Double Pattern Tolerance (Pips)</label>
                <input
                  type="number"
                  step="1"
                  className={`w-full bg-white/5 border ${validationErrors.DOUBLE_PATTERN_TOLERANCE ? 'border-rose-500' : 'border-white/10 focus:border-blue-500/50'} rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide`}
                  value={formData.DOUBLE_PATTERN_TOLERANCE || ''}
                  onChange={(e) => setFormData({ ...formData, DOUBLE_PATTERN_TOLERANCE: e.target.value })}
                  placeholder="20"
                />
                {validationErrors.DOUBLE_PATTERN_TOLERANCE && (
                  <p className="text-rose-400 text-[7px] mt-0.5">{validationErrors.DOUBLE_PATTERN_TOLERANCE}</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">News Window (Minutes)</label>
                <input
                  type="number"
                  step="1"
                  className={`w-full bg-white/5 border ${validationErrors.NEWS_NO_TRADE_WINDOW ? 'border-rose-500' : 'border-white/10 focus:border-blue-500/50'} rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide`}
                  value={formData.NEWS_NO_TRADE_WINDOW || ''}
                  onChange={(e) => setFormData({ ...formData, NEWS_NO_TRADE_WINDOW: e.target.value })}
                  placeholder="15"
                />
                {validationErrors.NEWS_NO_TRADE_WINDOW && (
                  <p className="text-rose-400 text-[7px] mt-0.5">{validationErrors.NEWS_NO_TRADE_WINDOW}</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">Python Engine URL</label>
                <input
                  type="text"
                  className="w-full bg-white/5 border border-white/10 focus:border-blue-500/50 rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide"
                  value={formData.PYTHON_ENGINE_URL || ''}
                  onChange={(e) => setFormData({ ...formData, PYTHON_ENGINE_URL: e.target.value })}
                  placeholder="http://localhost:8000"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-widest mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  className="w-full bg-white/5 border border-white/10 focus:border-blue-500/50 rounded px-2.5 py-1.5 text-white font-mono outline-none tracking-wide"
                  value={formData.TELEGRAM_CHAT_ID || ''}
                  onChange={(e) => setFormData({ ...formData, TELEGRAM_CHAT_ID: e.target.value })}
                  placeholder="-100123456789"
                />
              </div>
            </div>
          </form>
        </div>

        {/* API Status */}
        <div className="bg-black/40 border border-white/10 rounded-md p-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
          <div className="flex items-center justify-between mb-3 relative z-10">
            <h3 className="text-[8px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Key className="w-3 h-3 text-purple-400" /> Config & Environment Keys
            </h3>
            {configStatus?.lastChecked && (
              <span className="text-[8px] text-zinc-500 font-mono font-bold tracking-widest flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 shadow-sm">
                <Clock className="w-3 h-3" />
                <ClientDate date={configStatus.lastChecked} format="toLocaleTimeString" />
              </span>
            )}
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
            {loadingConfig ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-10 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-10 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorConfig ? (
              <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorConfig?.message || "Error loading config status"}</span>
                <button onClick={refetchConfig} className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : configStatus?.env ? (
              <div className="space-y-2">
                {Object.entries(configStatus.env).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1.5 pb-2 border-b border-white/10 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center">
                      <label className="text-zinc-300 capitalize text-[8px] font-bold tracking-widest">
                        {key.replace(/_/g, " ")}
                      </label>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[6px] uppercase tracking-widest font-bold border shadow-sm ${value === "configured" || value === "online" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : value === "offline" || value === "error" ? "border-rose-500/30 text-rose-400 bg-rose-500/10" : "border-white/10 text-zinc-400 bg-white/5"}`}
                      >
                        {String(value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500 text-center py-4">
                Loading config status...
              </div>
            )}
          </div>
        </div>

        {/* System Metrics */}
        <div className="bg-black/40 border border-white/10 rounded-md p-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl"></div>
          <h3 className="text-[8px] font-bold text-white mb-2 uppercase tracking-widest flex items-center gap-1.5 relative z-10">
            <BarChart2 className="w-3 h-3 text-emerald-400" /> System Metrics
          </h3>
          <div className="space-y-2 relative z-10">
            {loadingMetrics ? (
              <div className="text-[11px] text-zinc-500 flex flex-col gap-2">
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
                <div className="h-8 bg-white/5 animate-pulse rounded-xl w-full"></div>
              </div>
            ) : errorMetrics ? (
               <div className="text-[11px] text-rose-400 flex flex-col items-center justify-center py-6 bg-rose-500/10 rounded-2xl border border-rose-500/20 gap-3">
                <span className="text-center font-bold tracking-wide">{errorMetrics?.message || "Error loading system metrics"}</span>
                <button onClick={refetchMetrics} className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold tracking-widest uppercase transition-colors">Retry Connection</button>
              </div>
            ) : metricsData ? (
              <>
                <div className="flex justify-between items-center text-[10px] py-1.5 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Market Data Latency</span>
                  <span
                    className={`font-mono font-black text-[10px] ${metricsData.marketDataLatencyMs > 500 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.marketDataLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] py-1.5 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">AI Validation Latency</span>
                  <span
                    className={`font-mono font-black text-[10px] ${metricsData.aiValidationLatencyMs > 2000 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {metricsData.aiValidationLatencyMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] py-1.5 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Signal Throughput</span>
                  <span className="font-mono font-black text-white text-[10px]">
                    {metricsData.signalThroughput}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] py-1.5 border-b border-white/10">
                  <span className="text-zinc-300 font-bold tracking-wide">Error Rate</span>
                  <span
                    className={`font-mono font-black text-[10px] ${metricsData.errorRate > 0.1 ? "text-rose-400" : "text-emerald-400"}`}
                  >
                    {(metricsData.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] py-2">
                  <span className="text-zinc-300 font-bold tracking-wide font-medium">Notification Delivery</span>
                  <span className="font-mono font-black text-emerald-400 text-[10px]">
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
        <div className="bg-black/40 border border-white/10 rounded-md p-2.5 md:col-span-2 lg:col-span-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2 relative z-10">
            <h3 className="text-[8px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-blue-400" /> MCP Registry (
              {filteredMcps.length})
            </h3>

            <div className="flex items-center flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-1.5 py-0.5 text-[7px] uppercase tracking-widest font-bold rounded-md transition-all border shadow-sm ${
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 relative z-10">
            {loadingMcp ? (
              <div className="text-[11px] text-zinc-500 col-span-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="h-16 bg-white/5 animate-pulse rounded-xl w-full"></div>
                    <div className="h-16 bg-white/5 animate-pulse rounded-xl w-full"></div>
                    <div className="h-16 bg-white/5 animate-pulse rounded-xl w-full"></div>
                </div>
              </div>
            ) : errorMcp ? (
              <div className="text-[11px] text-rose-400 col-span-full flex flex-col items-center justify-center py-5 bg-rose-500/10 rounded-xl border border-rose-500/20 gap-2">
                <span className="text-center font-bold tracking-wide">{errorMcp?.message || "Error loading MCP status"}</span>
                <button onClick={refetchMcp} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg font-bold tracking-widest uppercase transition-colors">Retry</button>
              </div>
            ) : (mcpStatus || []).length > 0 ? (
              filteredMcps.map((mcp) => (
                <div
                  key={mcp.name}
                  onClick={() => setSelectedMcp(mcp)}
                  className="flex flex-col justify-between gap-2 p-2 bg-white/5 border border-white/10 rounded-md cursor-pointer hover:bg-white/10 transition-colors shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent transition-all"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-white line-clamp-1 tracking-wide">
                        {mcp.name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-lg text-[7px] font-bold uppercase tracking-widest border shrink-0 shadow-sm ${getMcpStatusBadge(formatMcpStatus(mcp.status, mcp.lastError))}`}
                      >
                        {formatMcpStatus(mcp.status, mcp.lastError)}
                      </span>
                    </div>
                    {formatMcpStatus(mcp.status, mcp.lastError) === 'UNAVAILABLE' && mcp.lastError && (
                      <span className="block text-[10px] text-rose-400 mt-1 mb-2 font-medium leading-tight line-clamp-2 italic">
                        Reason: {mcp.lastError}
                      </span>
                    )}
                    <span className="block text-[7px] text-zinc-500 uppercase tracking-widest font-bold">
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

      {/* Detail Drawer */}
      {selectedMcp && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setSelectedMcp(null)}
        >
          <div
            className="w-full max-w-[260px] h-full bg-black/80 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-3 overflow-y-auto animate-in slide-in-from-right duration-200 backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[8px] font-bold text-white uppercase tracking-widest">MCP Details</h3>
              <button
                onClick={() => setSelectedMcp(null)}
                className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="bg-white/5 border border-white/10 rounded-md p-3 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                <h4 className="text-[10px] font-bold text-white mb-2.5 relative z-10">
                  {selectedMcp.name}
                </h4>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-widest border shadow-sm relative z-10 ${getMcpStatusBadge(formatMcpStatus(selectedMcp.status, selectedMcp.lastError))}`}
                >
                  Status: {formatMcpStatus(selectedMcp.status, selectedMcp.lastError)}
                </span>
                {formatMcpStatus(selectedMcp.status, selectedMcp.lastError) === 'UNAVAILABLE' && selectedMcp.lastError && (
                  <div className="mt-3 text-[10px] text-rose-400 font-bold bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 relative z-10">
                    Reason: {selectedMcp.lastError}
                  </div>
                )}
              </div>

              <div className="space-y-2 px-2">
                <div>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                    Category
                  </span>
                  <span className="text-[10px] font-bold text-zinc-200">
                    {selectedMcp.category}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                    Purpose
                  </span>
                  <span className="text-[10px] font-medium text-zinc-300 leading-relaxed">
                    {selectedMcp.purpose}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                    Source Type
                  </span>
                  <span className="text-[10px] font-bold text-zinc-200">
                    {selectedMcp.sourceType || "Internal"}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Dependencies
                  </span>
                  {selectedMcp.dependencies &&
                  selectedMcp.dependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedMcp.dependencies.map((dep: string) => (
                        <span
                          key={dep}
                          className="px-1.5 py-0.5 rounded-[3px] border border-white/10 bg-white/5 text-[10px] font-mono font-bold text-zinc-300 shadow-sm"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-zinc-500 italic">None</span>
                  )}
                </div>

                <div className="pt-6 border-t border-white/10">
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Last Checked
                  </span>
                  <span className="text-[10px] font-mono font-bold text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded-[3px] border border-white/10 block w-fit">
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
            className="w-full max-w-[400px] h-full bg-black/90 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-3 flex flex-col animate-in slide-in-from-right duration-200 backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 shrink-0 gap-3">
              <h3 className="text-[10px] font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 shadow-sm">
                  <FileText className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                System Logs
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={downloadLogsCSV}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] bg-white/5 border border-white/10 text-white text-[7px] font-bold tracking-widest uppercase rounded-lg hover:bg-white/10 transition-colors shadow-sm"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
                <button
                  onClick={loadLogs}
                  className="px-2.5 py-1.5 min-h-[32px] bg-white/5 border border-white/10 text-white text-[7px] font-bold tracking-widest uppercase rounded-lg hover:bg-white/10 transition-colors shadow-sm"
                >
                  Refresh
                </button>
                <select
                  value={logSeverity}
                  onChange={(e) => setLogSeverity(e.target.value)}
                  className="bg-black/40 border border-white/10 text-white text-[8px] font-bold tracking-widest uppercase rounded-lg px-2.5 py-1.5 min-h-[32px] focus:outline-none focus:border-white/30 cursor-pointer shadow-sm appearance-none"
                >
                  <option value="all">All Severities</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <button
                  onClick={() => setShowLogs(false)}
                  className="p-1.5 ml-1 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {logError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[8px] font-bold tracking-wide px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm">
                <AlertTriangle className="w-4 h-4" /> {logError}
              </div>
            )}
            <div className="flex-1 overflow-y-auto bg-black/60 border border-white/10 rounded-2xl p-4 font-mono text-[8px] sm:text-[9px] shadow-inner custom-scrollbar">
              {logs.filter(log => logSeverity === "all" || log.level === logSeverity).length === 0 ? (
                <div className="text-zinc-500 text-center py-12 font-medium tracking-wide">
                  No logs available for selected severity.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.filter(log => logSeverity === "all" || log.level === logSeverity).slice(0, 100).map((log) => (
                    <div
                      key={log.id || `${log.timestamp}-${log.level}-${(log.message || '').slice(0, 20)}`}
                      className="flex gap-4 border-b border-white/5 pb-1.5 last:border-0 break-all"
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
            className="w-full max-w-[260px] h-full bg-black/90 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-3 overflow-y-auto animate-in slide-in-from-right duration-200 backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[8px] font-bold text-white uppercase flex items-center gap-2 tracking-widest">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 shadow-sm">
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                </div>
                Health Snapshot
              </h3>
              <button
                onClick={() => setShowHealthSnapshot(false)}
                className="p-1.5 hover:bg-white/10 rounded-md text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="space-y-2">
              <div className="bg-white/5 p-2.5 rounded-md border border-white/10 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
                <span className="block text-[9px] uppercase tracking-widest font-bold text-zinc-500 mb-2 relative z-10">Overall Status</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-widest border shadow-sm relative z-10 ${getMcpStatusBadge(healthStatus?.status || 'unavailable')}`}>
                  {getStatusIcon(healthStatus?.status || 'unavailable')}
                  {healthStatus?.status || 'Loading...'}
                </span>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[8px] font-bold text-white uppercase tracking-widest pl-2">Service Details</h4>
                {healthStatus?.services?.map((service: any) => (
                   <div key={service.serviceName} className="bg-black/40 border border-white/10 p-2.5 rounded-md shadow-sm hover:border-white/20 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[8px] font-bold text-white tracking-wide">{service.serviceName}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border shadow-sm ${getMcpStatusBadge(service.status)}`}>
                          {service.status}
                        </span>
                      </div>
                      <div className="space-y-1.5 border-t border-white/10 pt-3">
                        <div className="flex justify-between text-[9px] items-center">
                          <span className="text-zinc-500 font-bold uppercase tracking-widest">Latency:</span>
                          <span className="text-zinc-300 font-mono font-bold bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{service.latencyMs !== undefined ? `${service.latencyMs}ms` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-[9px] items-center">
                          <span className="text-zinc-500 font-bold uppercase tracking-widest">Last Checked:</span>
                          <span className="text-zinc-300 font-mono font-bold bg-white/5 px-1.5 py-0.5 rounded border border-white/10"><ClientDate date={service.lastChecked} format="toLocaleTimeString" /></span>
                        </div>
                        {service.message && (
                           <div className="mt-2 text-[9px] text-zinc-300 bg-white/5 p-2 rounded-lg border border-white/10 font-medium italic leading-relaxed">
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
