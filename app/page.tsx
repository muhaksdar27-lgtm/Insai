"use client";

import { motion, AnimatePresence } from "motion/react";
import { useFetch } from "@/hooks/use-fetch";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getMcpStatusBadge } from "@/lib/utils";
import {
  Activity,
  Clock,
  Globe,
  Zap,
  ListFilter,
  Cpu,
  BarChart2,
  ArrowRight,
  Server,
  Shield,
  X,
  AlertTriangle,
} from "lucide-react";
import { StrategyResponse } from "@/types";
import { 
  ProgressBar, 
  StrategyHeader, 
  ValidationBadge, 
  SetupCard 
} from "@/components/strategy-ui";
import { buildDashboard, buildSetup, buildRules, getAllStrategiesWithFallback } from "@/lib/strategyViewModel";

function createDashboardCard(strategy: StrategyResponse, onClick: () => void) {
  const data = buildDashboard(strategy);
  if (!data) return null;
  
  return (
    <motion.div
      key={data.id}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className="flex flex-col p-1.5 bg-white/5 border border-white/10 rounded-md cursor-pointer hover:border-blue-500/30 hover:bg-white/10 transition-all h-full group shadow-sm relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mt-2 -mr-2 w-12 h-12 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
      
      <div className="relative z-10 space-y-1">
        <StrategyHeader name={data.name} description={`${data.currentStep} • ${data.progress}%`} status={data.status} />
        <ProgressBar progress={data.progress} status={data.status} />
        
        <SetupCard 
          pair={data.pair}
          bias={data.bias} 
          session={data.session} 
          direction={data.direction} 
          entry={data.entry} 
          sl={data.sl} 
          tp={data.tp} 
          rr={data.rr} 
        />
        
        <div className="flex justify-between items-center w-full">
          <ValidationBadge passed={data.passedCount} total={data.rulesCount} />
          {data.updatedAt && (
             <span className="text-[6px] font-mono text-zinc-600 tracking-wider">
               <ClientDate date={data.updatedAt} />
             </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  
  const { data: marketStatus, loading: loadingMarket, error: errorMarket, refetch: refetchMarket } = useFetch<any>("/api/market/xauusd/latest", null);
  const { data: overviewStatus, loading: loadingOverview, error: errorOverview, refetch: refetchOverview } = useFetch<any>("/api/system/health", null);
  const { data: strategies = [], loading: loadingStrategies, error: errorStrategies, refetch: refetchStrategies } = useFetch<any[]>("/api/strategies", []);
  const { data: mcpStatus = [], refetch: refetchMcp } = useFetch<any[]>("/api/mcp/status", []);
  const { data: activeSignals = [], loading: loadingSignals, error: errorSignals, refetch: refetchSignals } = useFetch<any[]>("/api/signals/live", []);
  const { data: newsEventsData, refetch: refetchNews } = useFetch<any>("/api/news/active", { active_events: [] });
  
  const [ping, setPing] = useState(false);

  useEffect(() => {
    const handleAppUpdate = () => {
      setPing(true);
      setTimeout(() => setPing(false), 300);
      refetchMarket();
      refetchOverview();
      refetchStrategies();
      refetchMcp();
      refetchSignals();
      refetchNews();
    };
    window.addEventListener('app-update', handleAppUpdate);
    window.addEventListener('app-refetch', handleAppUpdate);
    return () => {
      window.removeEventListener('app-update', handleAppUpdate);
      window.removeEventListener('app-refetch', handleAppUpdate);
    };
  }, [refetchMarket, refetchOverview, refetchStrategies, refetchMcp, refetchSignals, refetchNews]);

  const currentMarketStatus = marketStatus;
  const currentSessionName = marketStatus?.session || "---";
  
  const newsEvents = Array.isArray(newsEventsData?.active_events) ? newsEventsData.active_events : [];
  const safeStrategies = getAllStrategiesWithFallback(Array.isArray(strategies) ? strategies : []);
  const safeActiveSignals = Array.isArray(activeSignals) ? activeSignals : [];
  const safeMcpStatus = Array.isArray(mcpStatus) ? mcpStatus : [];

  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
  };

  return (
    <motion.div 
      className="space-y-2.5 pb-10 relative h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* KPI Strip: Harga XAUUSD */}
        <motion.div variants={itemVariants} className={`relative overflow-hidden bg-white/5 border rounded-lg p-2.5 flex flex-col justify-between min-h-[3.25rem] shadow-sm backdrop-blur-md hover:bg-white/10 hover:border-blue-500/30 transition-all duration-300 group ${ping ? 'border-emerald-500/50' : 'border-white/10'}`}>
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-10 h-10 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-0.5 relative z-10">
            <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3 text-blue-400" /> XAUUSD
            </div>
          </div>
          <div className="relative z-10">
            {loadingMarket ? (
              <div className="animate-pulse space-y-1 mt-1">
                <div className="h-3.5 bg-white/5 rounded w-1/2"></div>
                <div className="h-2 bg-white/5 rounded w-1/3"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1 rounded text-[8px] border border-rose-500/20">
                <span className="truncate">{errorMarket?.message || "Error loading market data"}</span>
              </div>
            ) : currentMarketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-1 rounded text-[8px] border border-amber-500/20">
                <span className="truncate">{currentMarketStatus.reason || 'Not configured'}</span>
              </div>
            ) : currentMarketStatus ? (
              <>
                <div className={`text-sm font-mono font-bold tracking-tight flex items-center gap-1 transition-colors duration-300 ${ping ? 'text-emerald-400' : 'text-zinc-100'}`}>
                  {currentMarketStatus.price ? currentMarketStatus.price.toFixed(2) : "--.--"}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase transition-colors duration-300 ${currentMarketStatus.freshness === "live" || currentMarketStatus.freshness === "cached" ? (ping ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/10 text-blue-400") : "bg-white/5 text-zinc-400"}`}
                  >
                    {currentMarketStatus.freshness || "loading"}
                  </span>
                  <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">{currentMarketStatus.provider || 'Unknown'}</span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>

        {/* KPI Strip: Trend / Bias */}
        <motion.div variants={itemVariants} className="relative overflow-hidden bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between min-h-[3.25rem] shadow-sm backdrop-blur-md hover:bg-white/10 hover:border-purple-500/30 transition-all duration-300 group">
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-10 h-10 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-0.5 relative z-10">
            <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3 h-3 text-purple-400" /> HTF Bias
            </div>
          </div>
          <div className="relative z-10">
            {loadingMarket ? (
              <div className="animate-pulse space-y-1 mt-1">
                <div className="h-3.5 bg-white/5 rounded w-1/2"></div>
                <div className="h-2 bg-white/5 rounded w-1/3"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1 rounded text-[8px] border border-rose-500/20">
                <span className="truncate">{errorMarket?.message || "Error loading market data"}</span>
              </div>
            ) : currentMarketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-1 rounded text-[8px] border border-amber-500/20">
                <span className="truncate">{currentMarketStatus.reason || 'Not configured'}</span>
              </div>
            ) : currentMarketStatus ? (
              <>
                <div className="text-sm font-bold text-zinc-100 tracking-tight">
                  {currentMarketStatus.bias || "NEUTRAL"}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase ${currentMarketStatus.bias ? "bg-purple-500/10 text-purple-400" : "bg-white/5 text-zinc-400"}`}
                  >
                    {currentMarketStatus.bias ? "ONLINE" : "WAIT"}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>

        {/* KPI Strip: Session */}
        <motion.div 
          variants={itemVariants}
          className="relative overflow-hidden bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between min-h-[3.25rem] shadow-sm backdrop-blur-md cursor-pointer hover:border-amber-500/50 hover:bg-white/10 transition-all duration-300 group"
          onClick={() => setShowSessionDrawer(true)}
        >
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-10 h-10 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-0.5 relative z-10">
            <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" /> Session
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-sm font-bold text-zinc-100 tracking-tight">
              {currentSessionName}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase ${currentSessionName !== '---' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
                {currentSessionName !== '---' ? 'ACTIVE' : 'WAIT'}
              </span>
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">UTC</span>
            </div>
          </div>
        </motion.div>

        {/* KPI Strip: Signal Aktif */}
        <motion.div 
          variants={itemVariants}
          className="relative overflow-hidden bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between min-h-[3.25rem] shadow-sm backdrop-blur-md cursor-pointer hover:border-emerald-500/50 hover:bg-white/10 transition-all duration-300 group"
          onClick={() => router.push("/live-signals")}
        >
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-10 h-10 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-0.5 relative z-10">
            <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> Signals
            </div>
          </div>
          <div className="relative z-10">
            {loadingSignals ? (
               <div className="h-4 bg-white/5 rounded animate-pulse w-10 mt-1"></div>
            ) : errorSignals ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-1 rounded text-[8px] border border-rose-500/20">
                <span className="truncate">{errorSignals?.message || "Error loading signals"}</span>
              </div>
            ) : activeSignals ? (
              <>
                <div className="text-sm font-bold text-zinc-100 tracking-tight flex items-baseline gap-1">
                  {safeActiveSignals.length} <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider">active</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase ${safeActiveSignals.length > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-zinc-400"}`}
                  >
                    {safeActiveSignals.length > 0 ? "ONLINE" : "WAIT"}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-2">
        {/* Left Column - Main monitoring */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-2">
          {/* Active Strategies */}
          <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm backdrop-blur-md">
            <h3 className="text-[7px] font-bold text-zinc-300 mb-1.5 uppercase tracking-widest flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ListFilter className="w-2 h-2 text-blue-400" /> Active Strategies
              </span>
              <button
                onClick={() => router.push("/monitoring")}
                className="text-[6px] text-zinc-400 hover:text-white flex items-center gap-0.5 transition-colors bg-white/5 px-1.5 py-0.5 rounded-[3px] border border-white/10 hover:border-white/20 hover:bg-white/10 uppercase tracking-widest font-bold"
              >
                Scan <ArrowRight className="w-2.5 h-2.5" />
              </button>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {loadingStrategies ? (
                 <div className="col-span-1 md:col-span-2 space-y-2 py-1">
                    <Skeleton className="h-16 w-full bg-white/5 rounded-lg" />
                    <Skeleton className="h-16 w-full bg-white/5 rounded-lg" />
                 </div>
              ) : errorStrategies ? (
                 <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center text-rose-400 bg-rose-500/10 p-4 rounded-lg border border-rose-500/20 text-[9px]">
                  <AlertTriangle className="w-4 h-4 mb-2 opacity-80" />
                  <span className="font-bold">{errorStrategies?.message || "Error loading strategies"}</span>
                </div>
              ) : safeStrategies.length > 0 ? (
                safeStrategies.slice(0, 10).map((strategy: StrategyResponse) => 
                  createDashboardCard(strategy, () => setSelectedStrategy(strategy))
                )
              ) : (
                <div className="col-span-1 md:col-span-2 text-[9px] text-zinc-500 p-6 bg-white/5 border border-white/10 rounded-lg text-center flex flex-col items-center justify-center">
                  <Shield className="w-6 h-6 text-zinc-700 mb-2 opacity-60" />
                  <span className="font-bold tracking-widest uppercase">No strategies</span>
                </div>
              )}
            </div>
          </div>

          {/* News Panel */}
          <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm backdrop-blur-md">
            <h3 className="text-[7px] font-bold text-zinc-300 mb-1.5 uppercase tracking-widest flex items-center gap-1">
              <Globe className="w-2 h-2 text-blue-400" /> News & Events
            </h3>
            {newsEvents.length > 0 ? (
              <div className="space-y-1">
                {newsEvents.slice(0, 10).map((event: any) => (
                  <motion.div
                    key={event.id || (event.title ? `${event.title}-${event.publishedAt || event.timestamp}` : 'news-item')}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-1.5 bg-white/5 border border-white/10 rounded-md flex flex-col hover:border-white/20 hover:bg-white/10 transition-all shadow-sm group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[7px] font-bold text-zinc-200 group-hover:text-white transition-colors tracking-wide truncate max-w-[70%]">
                        {event.title}
                      </span>
                      <span
                        className={`inline-flex items-center px-1 py-[2px] rounded-[3px] text-[5px] font-bold tracking-widest border shrink-0 ml-1 uppercase shadow-sm ${event.impact === "high" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : event.impact === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                      >
                        {event.impact}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[7px] text-zinc-500 font-medium">
                      <span className="uppercase tracking-widest font-bold">{event.currency || 'USD'}</span>
                      <span className="text-zinc-600 font-mono"><ClientDate date={event.publishedAt || event.timestamp} /></span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center bg-white/5 border border-white/10 rounded border-dashed flex flex-col items-center justify-center">
                <Globe className="w-5 h-5 text-zinc-700 mb-2 opacity-60" />
                <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">
                  No high-impact events
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Right Column - Status & Overview */}
        <motion.div variants={itemVariants} className="space-y-2">
          {/* System Overview */}
          <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm backdrop-blur-md">
            <h3 className="text-[7px] font-bold text-zinc-300 mb-1.5 uppercase tracking-widest flex items-center gap-1">
              <Cpu className="w-2 h-2 text-blue-400" /> System Status
            </h3>
            <div className="space-y-2">
              {loadingOverview ? (
                <div className="space-y-2 py-1"><Skeleton className="h-4 w-full bg-white/5 rounded" /><Skeleton className="h-4 w-[90%] bg-white/5 rounded" /><Skeleton className="h-4 w-[80%] bg-white/5 rounded" /></div>
              ) : errorOverview ? (
                <div className="flex flex-col text-rose-400 bg-rose-500/10 p-3 rounded text-[9px] border border-rose-500/20 text-center">
                  <span className="mb-2 font-bold">{errorOverview?.message || "Error loading system status"}</span>
                  <button onClick={refetchOverview} className="bg-rose-500/20 hover:bg-rose-500/30 rounded text-rose-300 py-1 transition-colors font-bold tracking-wide">Retry</button>
                </div>
              ) : overviewStatus?.services ? (
                overviewStatus.services.map((service: any) => {
                   let key = service.serviceName;
                   let value = service.status;
                   let badgeStyle = getMcpStatusBadge(value as string);
                   
                   return (
                    <div
                      key={key}
                      className="flex justify-between items-center text-[7px] py-1 border-b border-white/10 last:border-0"
                    >
                      <span className="text-zinc-500 capitalize font-bold tracking-wide">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span
                        className={`inline-flex items-center px-1 py-[2px] rounded-[3px] text-[5px] font-bold tracking-widest border uppercase shadow-sm ${badgeStyle}`}
                      >
                        {String(value)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2 py-1"><Skeleton className="h-4 w-full bg-white/5 rounded" /><Skeleton className="h-4 w-[90%] bg-white/5 rounded" /><Skeleton className="h-4 w-[80%] bg-white/5 rounded" /></div>
              )}
            </div>
          </div>

          {/* MCP Status */}
          <div className="bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm backdrop-blur-md">
            <h3 className="text-[7px] font-bold text-zinc-300 mb-1.5 uppercase tracking-widest flex items-center gap-1">
              <Server className="w-2 h-2 text-blue-400" /> MCP Active
            </h3>
            <div className="space-y-2">
              {safeMcpStatus.length > 0 ? (
                safeMcpStatus.slice(0, 4).map((mcp: any) => (
                  <div
                    key={mcp.name || mcp.id}
                    className="flex justify-between items-center text-[7px] py-1 border-b border-white/10 last:border-0 group"
                  >
                    <span className="text-zinc-500 group-hover:text-zinc-300 transition-colors line-clamp-1 pr-2 font-bold tracking-wide">{mcp.name}</span>
                    <span
                      className={`text-[6px] shrink-0 px-1.5 py-0.5 rounded border font-bold tracking-widest uppercase shadow-sm ${getMcpStatusBadge(mcp.status)}`}
                    >
                      {mcp.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="space-y-2 py-1"><Skeleton className="h-3 w-full bg-white/5 rounded" /><Skeleton className="h-3 w-[90%] bg-white/5 rounded" /></div>
              )}
              <div className="mt-3 pt-2 border-t border-white/10">
                <button
                  onClick={() => router.push("/settings")}
                  className="w-full text-left text-[6px] text-zinc-500 hover:text-white flex justify-between items-center transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded-[3px] border border-white/10 hover:border-white/20 shadow-sm font-bold tracking-widest uppercase"
                >
                  View all MCPs <ArrowRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Drawer: Strategy Detail */}
      <AnimatePresence>
      {selectedStrategy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedStrategy(null)}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-xs sm:max-w-sm h-full bg-zinc-950/95 border-l border-white/10 shadow-2xl p-4 overflow-y-auto backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                <ListFilter className="w-4 h-4 text-zinc-400" />
                Strategy Setup
              </h3>
              <button
                onClick={() => setSelectedStrategy(null)}
                className="p-1 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-lg p-3 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl"></div>
                <div className="flex justify-between items-start mb-1 relative z-10 gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white tracking-wide truncate">{selectedStrategy.name}</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">{selectedStrategy.description}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase shrink-0 border ${selectedStrategy.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-zinc-400 border-white/10'}`}>
                    {selectedStrategy.status}
                  </span>
                </div>
              </div>

              <div>
                <h5 className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Setup Requirements</h5>
                
                <div className="mb-3">
                  {selectedStrategy && (
                    <SetupCard 
                      pair={buildSetup(selectedStrategy).pair}
                      bias={buildSetup(selectedStrategy).bias} 
                      session={buildSetup(selectedStrategy).session} 
                      direction={buildSetup(selectedStrategy).direction} 
                      entry={buildSetup(selectedStrategy).entry} 
                      sl={buildSetup(selectedStrategy).sl} 
                      tp={buildSetup(selectedStrategy).tp} 
                      rr={buildSetup(selectedStrategy).rr} 
                      atrBuffer={buildSetup(selectedStrategy).atrBuffer}
                      sweepStatus={buildSetup(selectedStrategy).sweepStatus}
                      confirmationStatus={buildSetup(selectedStrategy).confirmationStatus}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  {buildRules(selectedStrategy).map((rule: any) => {
                     const isPassed = rule.status === 'valid' || rule.passed === true;
                     const isFailed = rule.status === 'invalid' || rule.passed === false;
                     return (
                        <div key={rule.ruleId || rule.id || rule.name} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-md p-2 shadow-sm">
                          <span className="text-[9px] text-zinc-300 font-medium capitalize tracking-wide truncate pr-2">{rule.ruleId.replace(/([A-Z])/g, " $1").trim()}</span>
                          {isPassed ? (
                            <span className="text-[8px] font-bold text-emerald-400 flex items-center gap-1 shrink-0"><Shield className="w-2.5 h-2.5" /> PASS</span>
                          ) : isFailed ? (
                            <span className="text-[8px] font-bold text-rose-400 flex items-center gap-1 shrink-0"><X className="w-2.5 h-2.5" /> FAIL</span>
                          ) : (
                            <span className="text-[8px] font-bold text-blue-400 flex items-center gap-1 shrink-0">WAIT</span>
                          )}
                        </div>
                     );
                  })}
                  {buildRules(selectedStrategy).length === 0 && (
                    <div className="text-[9px] text-zinc-500 text-center py-4 bg-white/5 border border-white/10 rounded-lg border-dashed">
                      No setup rules
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                onClick={() => router.push("/monitoring")}
                className="w-full mt-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-[9px] text-zinc-200 transition-all font-bold tracking-wider uppercase shadow-sm"
              >
                Go to Scan
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Drawer: Session Detail */}
      <AnimatePresence>
      {showSessionDrawer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSessionDrawer(false)}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-xs sm:max-w-sm h-full bg-zinc-950/95 border-l border-white/10 shadow-2xl p-4 overflow-y-auto backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-zinc-400" />
                Session Detail
              </h3>
              <button
                onClick={() => setShowSessionDrawer(false)}
                className="p-1 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
               <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-6 -mr-6 w-20 h-20 bg-blue-500/20 rounded-full blur-xl"></div>
                  <div className="text-[7px] text-blue-400 uppercase tracking-widest mb-1 font-bold relative z-10">Active Session</div>
                  <div className="text-sm font-bold text-white tracking-tight relative z-10">{currentSessionName}</div>
               </div>

               <div>
                 <h5 className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest mb-2">All Sessions (UTC)</h5>
                 <div className="space-y-1">
                   {[
                     { name: 'Sydney', range: '22:00 - 07:00' },
                     { name: 'Tokyo', range: '00:00 - 09:00' },
                     { name: 'London', range: '08:00 - 16:00' },
                     { name: 'New York', range: '13:00 - 22:00' },
                   ].map((s) => (
                      <div key={s.name} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-md p-1.5 shadow-sm">
                         <span className="text-[8px] font-bold text-zinc-300 tracking-wide">{s.name}</span>
                         <div className="flex items-center gap-1.5">
                           <span className="text-[8px] text-zinc-500 font-mono font-bold">{s.range}</span>
                           {s.name === currentSessionName && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm"></span>
                           )}
                         </div>
                      </div>
                   ))}
                 </div>
               </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

    </motion.div>
  );
}
