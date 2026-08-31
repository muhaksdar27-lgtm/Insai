import { NextResponse } from "next/server";
import { getMarketDataService } from "@/lib/market-data/market-data-service";
import { LocalTAAnalyzer } from "@/lib/trading-engine/local-ta-analyzer";
import { 
  findFVGs, 
  findOrderBlocks, 
  findSweeps, 
  calculateDealingRange, 
  detectSessionPools,
  findSDZoneStructures,
  detectDisplacement
} from "@/lib/trading-engine/indicators";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory cache for intelligence to preserve quota and achieve ultra-low latency (<10ms)
let cachedIntelligence: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  const now = Date.now();

  if (cachedIntelligence && cachedIntelligence.expiresAt > now) {
    return NextResponse.json(cachedIntelligence.data);
  }

  try {
    const mds = getMarketDataService();
    const [priceSnap, m15Candles, h1Candles, h4Candles, newsEvents] = await Promise.all([
      mds.getLatestPrice("XAUUSD", 60000).catch(() => null),
      mds.getCandles("XAUUSD", "M15", 80).catch(() => []),
      mds.getCandles("XAUUSD", "H1", 60).catch(() => []),
      mds.getCandles("XAUUSD", "H4", 40).catch(() => []),
      mds.getLatestNews().catch(() => [])
    ]);

    const spotPrice = priceSnap?.price || (m15Candles.length > 0 ? m15Candles[m15Candles.length - 1].close : 0);
    const session = priceSnap?.session || "N/A";

    // Compute SMC & Quant Metrics
    const dealingRange = calculateDealingRange(m15Candles, spotPrice);
    const sessionPools = detectSessionPools(m15Candles);
    const displacement = detectDisplacement(m15Candles);
    const fvgs = findFVGs(m15Candles).slice(-4);
    const orderBlocks = findOrderBlocks(m15Candles).slice(-4);
    const sdZones = findSDZoneStructures(m15Candles).slice(-4);
    const sweeps = findSweeps(m15Candles).slice(-4);

    const m15Analysis = LocalTAAnalyzer.analyze({
      symbol: "XAUUSD",
      timeframe: "M15",
      candles: m15Candles,
      price: priceSnap
    });

    const h1Analysis = LocalTAAnalyzer.analyze({
      symbol: "XAUUSD",
      timeframe: "H1",
      candles: h1Candles,
      price: priceSnap
    });

    const h4Analysis = LocalTAAnalyzer.analyze({
      symbol: "XAUUSD",
      timeframe: "H4",
      candles: h4Candles,
      price: priceSnap
    });

    // Calculate dynamic scores from real price structure instead of arbitrary static numbers
    const isBullish = h1Analysis.trend_h1 === 'bullish';
    const isBearish = h1Analysis.trend_h1 === 'bearish';
    const hasDisplacement = displacement.hasDisplacement;
    const isDiscount = dealingRange.zone === 'DISCOUNT';
    const isPremium = dealingRange.zone === 'PREMIUM';

    // Base confidence calculated from structural alignment
    let dynConfidence = 50;
    if (isBullish && isDiscount) dynConfidence += 18;
    if (isBearish && isPremium) dynConfidence += 18;
    if (hasDisplacement) dynConfidence += 12;
    if (sessionPools.sweepAsianHigh || sessionPools.sweepAsianLow) dynConfidence += 10;
    dynConfidence = Math.min(95, Math.max(35, dynConfidence));

    const dynAccumulation = isBullish ? Math.min(85, Math.round(50 + (isDiscount ? 20 : 0) + (displacement.direction === 'bullish' ? 15 : 0))) : 30;
    const dynDistribution = isBearish ? Math.min(85, Math.round(50 + (isPremium ? 20 : 0) + (displacement.direction === 'bearish' ? 15 : 0))) : 25;

    let aiSynthesis = {
      analysis_source: "deterministic_fallback",
      marketRegime: (m15Candles.length < 10) ? "INSUFFICIENT_DATA" : (hasDisplacement ? "Trending Expansion" : "Equilibrium / Consolidation"),
      institutionalBias: h1Analysis.trend_h1 ? h1Analysis.trend_h1.toUpperCase() : "NEUTRAL",
      confidenceScore: dynConfidence,
      accumulationScore: dynAccumulation,
      distributionScore: dynDistribution,
      keyActionableZone: dealingRange.equilibrium > 0 ? `$${dealingRange.equilibrium.toFixed(2)}` : "N/A",
      liquidityNarrative: sessionPools.sweepAsianHigh 
        ? "Asian High liquidity swept; monitoring institutional reaction." 
        : sessionPools.sweepAsianLow 
        ? "Asian Low liquidity swept; monitoring for buy-side displacement." 
        : "Trading within defined dealing range.",
      recommendation: isBullish 
        ? "Prioritaskan area Diskon & Order Block searah tren naik H1." 
        : isBearish 
        ? "Prioritaskan area Premium & Supply Zone searah tren turun H1." 
        : "Tunggu konfirmasi displacement atau sweep likuiditas yang jelas."
    };

    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Analisa kuantitatif kilat XAUUSD Gold:
Spot Price: $${spotPrice.toFixed(2)}
Session: ${session}
H1 Trend: ${h1Analysis.trend_h1}
M15 Trend: ${m15Analysis.trend_m15}
Dealing Range Zone: ${dealingRange.zone} (Fib: ${(dealingRange.fibLevel * 100).toFixed(1)}%)
Asian Sweep: High=${sessionPools.sweepAsianHigh}, Low=${sessionPools.sweepAsianLow}
Displacement: ${displacement.hasDisplacement ? displacement.direction : 'None'}
FVGs: ${fvgs.length} active
SD Zones: ${sdZones.map(z => `${z.type.toUpperCase()}-${z.pattern} (${z.freshness})`).join(', ') || 'Normal'}
High Impact News: ${newsEvents.length > 0 ? newsEvents[0].title : 'None'}

Berikan JSON singkat (marketRegime, institutionalBias, confidenceScore (0-100), accumulationScore (0-100), distributionScore (0-100), keyActionableZone, liquidityNarrative, recommendation) dalam Bahasa Indonesia.`;

        const candidateModels = ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
        for (const modelName of candidateModels) {
          try {
            const res = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                temperature: 0.2
              }
            });

            if (res.text) {
              const parsed = JSON.parse(res.text);
              aiSynthesis = { ...aiSynthesis, ...parsed, analysis_source: "gemini_ai" };
              break;
            }
          } catch (e: any) {
            const isUnavailableOrBusy = e.status === 503 || e.message?.includes('503') || e.message?.includes('high demand') || e.message?.includes('UNAVAILABLE');
            if (isUnavailableOrBusy) {
              continue;
            }
            break;
          }
        }
      } catch (err) {
        // Fallback to deterministic synthesis without failing
      }
    }

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      symbol: "XAUUSD",
      spotPrice,
      session,
      provider: priceSnap?.provider || "TwelveData/Yahoo",
      freshness: priceSnap?.freshness || "live",
      dealingRange,
      sessionPools,
      displacement,
      metrics: {
        atrM15: m15Analysis.atr,
        trendH4: h4Analysis.trend_h1 || "NEUTRAL",
        trendH1: h1Analysis.trend_h1,
        trendM15: m15Analysis.trend_m15,
        fvgsCount: fvgs.length,
        orderBlocksCount: orderBlocks.length,
        sdZonesCount: sdZones.length,
        recentSweepsCount: sweeps.length
      },
      zones: {
        orderBlocks,
        fvgs,
        sdZones
      },
      aiSynthesis
    };

    cachedIntelligence = {
      data: payload,
      expiresAt: now + CACHE_TTL_MS
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Failed to generate AI intelligence:", error?.message || error);
    return NextResponse.json(
      { success: false, error: { code: 'INTELLIGENCE_FAILED', message: "Market intelligence service temporarily unavailable." } },
      { status: 500 }
    );
  }
}
