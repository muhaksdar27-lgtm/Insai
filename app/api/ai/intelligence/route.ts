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
import { publicApiError } from "@/lib/utils/api-error";

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
    if (!Number.isFinite(spotPrice) || spotPrice <= 0 || m15Candles.length === 0) {
      return NextResponse.json({ success: false, error: 'Market data is temporarily unavailable', analysisSource: 'unavailable' }, { status: 503 });
    }

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

    // Generate Institutional AI Summary using Gemini 3.7 Flash if API key available
    let analysisSource = "deterministic_fallback";
    let aiSynthesis: Record<string, unknown> = {
      marketRegime: "Equilibrium / Consolidation",
      institutionalBias: h1Analysis.trend_h1 || "NEUTRAL",
      confidenceScore: null,
      accumulationScore: null,
      distributionScore: null,
      keyActionableZone: `$${dealingRange.equilibrium.toFixed(2)}`,
      liquidityNarrative: sessionPools.sweepAsianHigh ? "Asian High liquidity raided, looking for mean reversion or expansion." : "Trading within defined dealing range.",
      recommendation: null,
      analysisSource: "deterministic_fallback"
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
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('AI response was not an object');
              }
              const candidate = parsed as Record<string, unknown>;
              const numericFields = ['confidenceScore', 'accumulationScore', 'distributionScore'];
              if (numericFields.some((field) => candidate[field] !== undefined && (!Number.isFinite(Number(candidate[field])) || Number(candidate[field]) < 0 || Number(candidate[field]) > 100))) {
                throw new Error('AI response contained an invalid score');
              }
              aiSynthesis = { ...aiSynthesis, ...candidate, analysisSource: 'gemini' };
              analysisSource = 'gemini';
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
      freshness: priceSnap?.freshness || "derived",
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
      aiSynthesis,
      analysisSource,
      degraded: analysisSource !== 'gemini'
    };

    cachedIntelligence = {
      data: payload,
      expiresAt: now + CACHE_TTL_MS
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Failed to generate AI intelligence:", error);
    return NextResponse.json(
      { success: false, error: publicApiError(error, "Failed to generate market intelligence") },
      { status: 500 }
    );
  }
}
