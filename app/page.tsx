"use client";

import { motion, AnimatePresence } from "motion/react";
import { useFetch } from "@/hooks/use-fetch";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { ClientDate } from "@/components/client-date";
import { getStatusBadge, getMcpStatusBadge } from "@/lib/utils";
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

export default function Dashboard() {
  const router = useRouter();
  
  const { data: marketStatus, loading: loadingMarket, error: errorMarket, refetch: refetchMarket } = useFetch<any>("/api/market/xauusd/latest", null);
  const { data: overviewStatus, loading: loadingOverview, error: errorOverview, refetch: refetchOverview } = useFetch<any>("/api/status/overview", null);
  const { data: strategies = [], loading: loadingStrategies, error: errorStrategies, refetch: refetchStrategies } = useFetch<any[]>("/api/strategies", []);
  const { data: mcpStatus = [] } = useFetch<any[]>("/api/mcp/status", []);
  const { data: activeSignals = [], loading: loadingSignals, error: errorSignals, refetch: refetchSignals } = useFetch<any[]>("/api/signals/live", []);
  const { data: newsEventsData } = useFetch<any>("/api/news/active", { active_events: [] });
  
  const [localMarketStatus, setLocalMarketStatus] = useState<any>(null);

  useEffect(() => {
    const handleAppUpdate = (e: any) => {
      if (e.detail?.type === 'MARKET_TICK' && e.detail?.payload) {
        setLocalMarketStatus(e.detail.payload);
      }
    };
    window.addEventListener('app-update', handleAppUpdate);
    return () => window.removeEventListener('app-update', handleAppUpdate);
  }, []);

  const currentMarketStatus = localMarketStatus || marketStatus;
  
  const newsEvents = Array.isArray(newsEventsData?.active_events) ? newsEventsData.active_events : [];
  const safeStrategies = Array.isArray(strategies) ? strategies : [];
  const safeActiveSignals = Array.isArray(activeSignals) ? activeSignals : [];
  const safeMcpStatus = Array.isArray(mcpStatus) ? mcpStatus : [];

  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);

  const [sessionName, setSessionName] = useState("---");

  useEffect(() => {
    Promise.resolve().then(() => {
      const currentHour = new Date().getUTCHours();
      if (currentHour >= 13 && currentHour < 22) setSessionName("New York");
      else if (currentHour >= 8 && currentHour < 16) setSessionName("London");
      else if (currentHour >= 0 && currentHour < 9) setSessionName("Tokyo");
      else setSessionName("Sydney");
    });
  }, []);

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
      className="space-y-4 pb-20 relative h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI Strip: Harga XAUUSD */}
        <motion.div variants={itemVariants} className="relative overflow-hidden bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[7rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl hover:bg-black/60 hover:border-blue-500/30 transition-all duration-300 group">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> XAUUSD Live
            </div>
          </div>
          <div className="relative z-10">
            {loadingMarket ? (
              <div className="animate-pulse space-y-2 mt-1">
                <div className="h-6 bg-white/5 rounded w-1/2"></div>
                <div className="h-4 bg-white/5 rounded w-1/3"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-2 rounded-lg text-[10px] border border-rose-500/20">
                <span className="truncate">{errorMarket}</span>
                <button onClick={refetchMarket} className="mt-2 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : currentMarketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-2 rounded-lg text-[10px] border border-amber-500/20">
                <span className="truncate" title={currentMarketStatus.reason}>{currentMarketStatus.reason || 'Not configured'}</span>
              </div>
            ) : currentMarketStatus ? (
              <>
                <div className="text-2xl font-mono font-bold text-white tracking-tight flex items-center gap-2">
                  {currentMarketStatus.price ? currentMarketStatus.price.toFixed(2) : "--.--"}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase ${currentMarketStatus.freshness === "live" || currentMarketStatus.freshness === "cached" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]" : "bg-white/5 text-zinc-400 border border-white/10"}`}
                  >
                    {currentMarketStatus.freshness || "loading"}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">Src: {currentMarketStatus.provider || 'Unknown'}</span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>

        {/* KPI Strip: Trend / Bias */}
        <motion.div variants={itemVariants} className="relative overflow-hidden bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[7rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl hover:bg-black/60 hover:border-purple-500/30 transition-all duration-300 group">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-purple-400" /> HTF Bias
            </div>
          </div>
          <div className="relative z-10">
            {loadingMarket ? (
              <div className="animate-pulse space-y-2 mt-1">
                <div className="h-6 bg-white/5 rounded w-1/2"></div>
                <div className="h-4 bg-white/5 rounded w-1/3"></div>
              </div>
            ) : errorMarket ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-2 rounded-lg text-[10px] border border-rose-500/20">
                <span className="truncate">{errorMarket}</span>
                <button onClick={refetchMarket} className="mt-2 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : currentMarketStatus?.status === 'not_configured' ? (
              <div className="flex flex-col text-amber-400 bg-amber-500/10 p-2 rounded-lg text-[10px] border border-amber-500/20">
                <span className="truncate" title={currentMarketStatus.reason}>{currentMarketStatus.reason || 'Not configured'}</span>
              </div>
            ) : currentMarketStatus ? (
              <>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {currentMarketStatus.bias || "NEUTRAL"}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase ${currentMarketStatus.bias ? "bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.2)]" : "bg-white/5 text-zinc-400 border border-white/10"}`}
                  >
                    {currentMarketStatus.bias ? "live" : "unavailable"}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">Market Trend</span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>

        {/* KPI Strip: Session */}
        <motion.div 
          variants={itemVariants}
          className="relative overflow-hidden bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[7rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl cursor-pointer hover:border-amber-500/50 hover:bg-black/60 transition-all duration-300 group"
          onClick={() => setShowSessionDrawer(true)}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Session
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-2xl font-bold text-white tracking-tight">
              {sessionName}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                active
              </span>
              <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">Timezone UTC</span>
            </div>
          </div>
        </motion.div>

        {/* KPI Strip: Signal Aktif */}
        <motion.div 
          variants={itemVariants}
          className="relative overflow-hidden bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[7rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl cursor-pointer hover:border-emerald-500/50 hover:bg-black/60 transition-all duration-300 group"
          onClick={() => router.push("/live-signals")}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" /> Active Signals
            </div>
          </div>
          <div className="relative z-10">
            {loadingSignals ? (
               <div className="h-8 bg-white/5 rounded animate-pulse w-12 mt-1"></div>
            ) : errorSignals ? (
              <div className="flex flex-col text-rose-400 bg-rose-500/10 p-2 rounded-lg text-[10px] border border-rose-500/20">
                <span className="truncate">{errorSignals}</span>
                <button onClick={refetchSignals} className="mt-2 bg-rose-500/20 hover:bg-rose-500/30 py-1 rounded text-rose-300 font-medium transition-colors">Retry</button>
              </div>
            ) : activeSignals ? (
              <>
                <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-1">
                  {safeActiveSignals.length} <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">signals</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold tracking-widest uppercase ${safeActiveSignals.length > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-white/5 text-zinc-400 border border-white/10"}`}
                  >
                    {safeActiveSignals.length > 0 ? "live" : "none"}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-medium uppercase tracking-wider">AI Verified</span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main monitoring */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
          {/* Active Strategies */}
          <div className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
            <h3 className="text-[12px] font-bold text-white mb-6 uppercase tracking-widest flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-blue-400" /> Active Strategies
              </span>
              <button
                onClick={() => router.push("/monitoring")}
                className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors bg-white/5 px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/10"
              >
                View Full Scan <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {loadingStrategies ? (
                 <div className="col-span-1 md:col-span-2 space-y-4 py-2">
                    <Skeleton className="h-24 w-full bg-white/5 rounded-2xl" />
                    <Skeleton className="h-24 w-full bg-white/5 rounded-2xl" />
                 </div>
              ) : errorStrategies ? (
                 <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center text-rose-400 bg-rose-500/10 p-8 rounded-3xl border border-rose-500/20 text-[11px]">
                  <AlertTriangle className="w-6 h-6 mb-3 opacity-80" />
                  <span className="font-medium text-center">{errorStrategies}</span>
                  <button onClick={refetchStrategies} className="mt-4 bg-rose-500/20 hover:bg-rose-500/30 px-5 py-2.5 rounded-xl text-rose-300 font-bold tracking-wide transition-colors">Retry Connection</button>
                </div>
              ) : strategies.length > 0 ? (
                safeStrategies.slice(0, 10).map((strategy: any, index: number) => {
                  let statusBadgeStyle = getStatusBadge(strategy.status);

                  // Extract rule results briefly
                  const rulesObj = strategy.ruleResults || {};
                  const rulesCount = Object.keys(rulesObj).length;
                  const passedCount = Object.values(rulesObj).filter((r: any) => r?.passed).length;
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedStrategy(strategy)}
                      className="flex flex-col p-5 bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:border-blue-500/30 hover:bg-white/10 transition-all h-full group shadow-sm relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 -mt-2 -mr-2 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all"></div>
                      <div className="flex items-start justify-between mb-4 relative z-10">
                        <div>
                          <div className="text-[13px] font-bold text-zinc-100 line-clamp-1 group-hover:text-white transition-colors tracking-wide">
                            {strategy.name || strategy.id}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                            {strategy.description || "No description provided for this strategy."}
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-widest border ${statusBadgeStyle} shrink-0 ml-4 uppercase shadow-sm`}>
                          {strategy.status || "awaiting"}
                        </span>
                      </div>
                      
                      <div className="mt-4 space-y-2 flex-grow relative z-10">
                        {strategy.steps && strategy.steps.length > 0 ? (
                          <div className="flex justify-between items-center bg-black/40 rounded-xl border border-white/5 px-3 py-2.5 overflow-hidden shadow-inner">
                            {strategy.steps.map((step: any, sIdx: number) => {
                              const isActive = step.status === 'active';
                              const isApproved = step.status === 'approved';
                              const isRejected = step.status === 'rejected';
                              const isExpired = step.status === 'expired';
                              
                              let colorCls = 'text-zinc-500 bg-white/5 border-white/5';
                              if (isActive) colorCls = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                              if (isApproved) colorCls = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                              if (isRejected || isExpired) colorCls = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
                              
                              return (
                                <div key={sIdx} className="flex items-center">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${colorCls}`}>
                                    {step.name}
                                  </span>
                                  {sIdx < strategy.steps.length - 1 && (
                                    <ArrowRight className={`w-3.5 h-3.5 mx-1.5 ${isApproved ? 'text-emerald-500/60' : 'text-zinc-600'}`} />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-600 font-mono italic">No steps available</div>
                        )}
                      </div>

                      <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] relative z-10">
                        <span className="text-zinc-500 font-semibold uppercase tracking-wider">Validation Rules</span>
                        <span className={`font-mono font-bold tracking-wide ${passedCount > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                          {passedCount}/{rulesCount} Passed
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="col-span-1 md:col-span-2 text-[11px] text-zinc-400 p-12 bg-white/5 border border-white/10 rounded-3xl text-center flex flex-col items-center justify-center">
                  <Shield className="w-10 h-10 text-zinc-600 mb-4 opacity-60" />
                  <span className="font-bold tracking-widest text-[12px] uppercase">No active strategies detected</span>
                  <span className="block mt-2 text-[11px] text-zinc-500 max-w-xs leading-relaxed">Ensure Supabase is configured and strategies are enabled.</span>
                </div>
              )}
            </div>
          </div>

          {/* News Panel */}
          <motion.div variants={itemVariants} className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
            <h3 className="text-[12px] font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" /> News & Events
            </h3>
            {newsEvents.length > 0 ? (
              <div className="space-y-4">
                {newsEvents.slice(0, 10).map((event: any, idx: number) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-5 bg-white/5 border border-white/10 rounded-2xl flex flex-col hover:border-white/20 hover:bg-white/10 transition-all shadow-sm group"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[12px] font-bold text-zinc-200 group-hover:text-white transition-colors tracking-wide">
                        {event.title}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-widest border shrink-0 ml-3 uppercase shadow-sm ${event.impact === "high" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : event.impact === "medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-white/5 text-zinc-400 border-white/10"}`}
                      >
                        {event.impact}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 font-medium">
                      <span className="uppercase tracking-widest font-bold">{event.country}</span>
                      <span className="text-zinc-400 font-mono"><ClientDate date={event.timestamp} /></span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-white/5 border border-white/10 rounded-3xl border-dashed flex flex-col items-center justify-center">
                <Globe className="w-10 h-10 text-zinc-600 mb-4 opacity-60" />
                <p className="text-[12px] text-zinc-400 font-bold uppercase tracking-widest">
                  No high-impact events
                </p>
                <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                  Standard strategies are operating normally.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Right Column - Status & Overview */}
        <motion.div variants={itemVariants} className="space-y-6">
          {/* System Overview */}
          <div className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
            <h3 className="text-[12px] font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" /> System Status
            </h3>
            <div className="space-y-4">
              {loadingOverview ? (
                <div className="space-y-3 py-1"><Skeleton className="h-5 w-full bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[90%] bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[80%] bg-white/5 rounded-lg" /></div>
              ) : errorOverview ? (
                <div className="flex flex-col text-rose-400 bg-rose-500/10 p-5 rounded-xl text-[11px] border border-rose-500/20 text-center">
                  <span className="mb-3 font-medium">{errorOverview}</span>
                  <button onClick={refetchOverview} className="bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-rose-300 py-2.5 transition-colors font-bold tracking-wide">Retry</button>
                </div>
              ) : overviewStatus ? (
                Object.entries(overviewStatus).map(([key, value]) => {
                   let badgeStyle = getMcpStatusBadge(value as string);
                   
                   return (
                    <div
                      key={key}
                      className="flex justify-between items-center text-[12px] py-3 border-b border-white/10 last:border-0"
                    >
                      <span className="text-zinc-400 capitalize font-medium tracking-wide">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-widest border uppercase shadow-sm ${badgeStyle}`}
                      >
                        {String(value)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-3 py-1"><Skeleton className="h-5 w-full bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[90%] bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[80%] bg-white/5 rounded-lg" /></div>
              )}
            </div>
          </div>

          {/* MCP Status */}
          <div className="bg-black/40 border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
            <h3 className="text-[12px] font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" /> MCP Active
            </h3>
            <div className="space-y-4">
              {safeMcpStatus.length > 0 ? (
                safeMcpStatus.slice(0, 4).map((mcp: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-[12px] py-3 border-b border-white/10 last:border-0 group"
                  >
                    <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors line-clamp-1 pr-3 font-medium tracking-wide">{mcp.name}</span>
                    <span
                      className={`text-[9px] shrink-0 px-2.5 py-1 rounded-lg border font-bold tracking-widest uppercase shadow-sm ${getMcpStatusBadge(mcp.status)}`}
                    >
                      {mcp.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="space-y-3 py-1"><Skeleton className="h-5 w-full bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[90%] bg-white/5 rounded-lg" /><Skeleton className="h-5 w-[80%] bg-white/5 rounded-lg" /></div>
              )}
              <div className="mt-6 pt-4 border-t border-white/10">
                <button
                  onClick={() => router.push("/settings")}
                  className="w-full text-left text-[11px] text-zinc-400 hover:text-white flex justify-between items-center transition-colors bg-white/5 hover:bg-white/10 px-5 py-4 rounded-2xl border border-white/10 hover:border-white/20 shadow-sm font-bold tracking-widest uppercase"
                >
                  View all MCPs <ArrowRight className="w-4 h-4" />
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
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setSelectedStrategy(null)}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm h-full bg-black/80 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 overflow-y-auto backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[12px] font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                <ListFilter className="w-4 h-4 text-zinc-400" />
                Strategy Setup
              </h3>
              <button
                onClick={() => setSelectedStrategy(null)}
                className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
                <div className="flex justify-between items-start mb-3 relative z-10">
                  <div>
                    <h4 className="text-[13px] font-bold text-white tracking-wide">{selectedStrategy.name}</h4>
                    <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">{selectedStrategy.description}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-widest uppercase shadow-sm border ${selectedStrategy.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-zinc-400 border-white/10'}`}>
                    {selectedStrategy.status}
                  </span>
                </div>
              </div>

              <div>
                <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">AI & Market State</h5>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2">AI Decision</div>
                    <div className={`text-[13px] font-bold tracking-wide ${selectedStrategy.aiDecision === 'APPROVED' ? 'text-emerald-400' : selectedStrategy.aiDecision === 'REJECTED' ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {selectedStrategy.aiDecision || 'PENDING'}
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Market Bias</div>
                    <div className="text-[13px] font-bold text-white uppercase tracking-wide">
                      {selectedStrategy.marketBias || 'UNKNOWN'}
                    </div>
                  </div>
                </div>

                <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Setup Requirements</h5>
                <div className="space-y-3">
                  {Object.entries(selectedStrategy.ruleResults || {}).map(([key, result]: [string, any], idx) => {
                     const isPassed = result?.status === 'valid' || result?.passed === true;
                     const isFailed = result?.status === 'invalid' || result?.passed === false;
                     return (
                        <div key={idx} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-2xl p-4 shadow-sm">
                          <span className="text-[11px] text-zinc-300 font-medium capitalize tracking-wide">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                          {isPassed ? (
                            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> PASS</span>
                          ) : isFailed ? (
                            <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> FAIL</span>
                          ) : (
                            <span className="text-[10px] font-medium text-zinc-500 flex items-center gap-1.5">WAITING</span>
                          )}
                        </div>
                     );
                  })}
                  {(!selectedStrategy.ruleResults || Object.keys(selectedStrategy.ruleResults).length === 0) && (
                    <div className="text-[11px] text-zinc-500 text-center py-8 bg-white/5 border border-white/10 rounded-2xl border-dashed">
                      No setup rules defined or verified yet.
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                onClick={() => router.push("/monitoring")}
                className="w-full mt-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-[11px] text-white transition-all font-bold tracking-widest uppercase shadow-sm"
              >
                Go to Monitoring
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
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
          onClick={() => setShowSessionDrawer(false)}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-sm h-full bg-black/80 border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 md:p-8 overflow-y-auto backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[12px] font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                <Clock className="w-4 h-4 text-zinc-400" />
                Session Detail
              </h3>
              <button
                onClick={() => setShowSessionDrawer(false)}
                className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
               <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-8 text-center shadow-[0_0_30px_rgba(59,130,246,0.15)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>
                  <div className="text-[10px] text-blue-400 uppercase tracking-widest mb-3 font-bold relative z-10">Active Session</div>
                  <div className="text-3xl font-black text-white tracking-tight relative z-10">{sessionName}</div>
               </div>

               <div>
                 <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">All Sessions (UTC)</h5>
                 <div className="space-y-3">
                   {[
                     { name: 'Sydney', range: '22:00 - 07:00' },
                     { name: 'Tokyo', range: '00:00 - 09:00' },
                     { name: 'London', range: '08:00 - 16:00' },
                     { name: 'New York', range: '13:00 - 22:00' },
                   ].map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white/5 border border-white/10 rounded-2xl p-4.5 shadow-sm">
                         <span className="text-[13px] font-bold text-zinc-200 tracking-wide">{s.name}</span>
                         <div className="flex items-center gap-3">
                           <span className="text-[11px] text-zinc-400 font-mono font-medium">{s.range}</span>
                           {s.name === sessionName && (
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
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
