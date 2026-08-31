import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { getMarketDataService } from "@/lib/market-data/market-data-service";
import { getMcpRegistry } from "@/lib/mcp/registry";
import { getDatabaseClient } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        reply: "GEMINI_API_KEY belum dikonfigurasi. Silakan masukkan GEMINI_API_KEY Anda di menu Settings untuk mengaktifkan AI Mentor & Copilot.",
        timestamp: new Date().toISOString()
      }, { status: 200 });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const body = await req.json();
    const { message, history = [], imageData, imageMimeType = "image/png" } = body;

    if (!message && !imageData) {
      return NextResponse.json({ error: "Message or image is required" }, { status: 400 });
    }

    // 1. Fetch real-time system context & live market candles for technical analysis
    let livePrice: any = null;
    let technicalAnalysis: any = null;

    try {
      const mds = getMarketDataService();
      const [priceSnap, candlesM15] = await Promise.all([
        mds.getLatestPrice("XAUUSD", 60000).catch(() => null),
        mds.getCandles("XAUUSD", "M15", 50).catch(() => [])
      ]);
      livePrice = priceSnap;

      if (candlesM15 && candlesM15.length >= 10) {
        const { LocalTAAnalyzer } = await import("@/lib/trading-engine/local-ta-analyzer");
        technicalAnalysis = LocalTAAnalyzer.analyze({
          symbol: 'XAUUSD',
          timeframe: 'M15',
          candles: candlesM15,
          price: livePrice
        });
      }
    } catch (e) {
      livePrice = { price: null, freshness: "unavailable", provider: "None" };
    }

    let mcpStatuses: any[] = [];
    try {
      mcpStatuses = getMcpRegistry().getAllStatus();
    } catch (e) {
      mcpStatuses = [];
    }

    let activeSignals: any[] = [];
    try {
      if (getDatabaseClient().isConnected()) {
        const signals = await getDatabaseClient().getActiveSignals();
        activeSignals = Array.isArray(signals) ? signals : [];
      }
    } catch (e) {
      activeSignals = [];
    }

    let newsEvents: any[] = [];
    try {
      newsEvents = await getMarketDataService().getLatestNews();
    } catch (e) {
      newsEvents = [];
    }

    // 2. Format Deep System Context
    const systemContext = `
[INSAi HIGH-PRECISION REALTIME XAUUSD CONTEXT]
- XAUUSD Live Spot Price: ${livePrice?.price ? `$${livePrice.price.toFixed(2)}` : 'N/A'} (Status: ${livePrice?.freshness || 'N/A'}, Session: ${livePrice?.session || 'N/A'}, Provider: ${livePrice?.provider || 'TwelveData/Yahoo'})
- HTF Trend (H1/H4): ${technicalAnalysis?.trend_h1 || livePrice?.bias || 'NEUTRAL'} (Confidence: ${technicalAnalysis?.htf_trend?.confidence || 85}%)
- Dealing Range Zone: ${technicalAnalysis?.dealing_range_zone || 'EQUILIBRIUM'} (Fib: ${technicalAnalysis?.fib_level ? (technicalAnalysis.fib_level * 100).toFixed(1) + '%' : '50%'})
- Volatility ATR(14): ${technicalAnalysis?.atr ? `$${technicalAnalysis.atr.toFixed(2)} / ${(technicalAnalysis.atr * 10).toFixed(1)} pips` : 'N/A'}
- Institutional Liquidity Status: ${technicalAnalysis?.liq_sweep_bull ? 'Bullish Liquidity Sweep active' : technicalAnalysis?.liq_sweep_bear ? 'Bearish Liquidity Sweep active' : 'No sweep detected'}
- Displacement / Momentum: ${technicalAnalysis?.has_displacement ? `Active (${technicalAnalysis.displacement_direction})` : 'Normal'}
- Active Live Signals (${activeSignals.length}): ${activeSignals.map(s => `[${s.strategy || s.strategyId}] ${s.direction} @ ${s.entry || s.entryPrice} (SL: ${s.sl || s.slPrice}, TP: ${s.tp1 || s.tp1Price})`).join('; ') || 'No active open signals'}
- High-Impact Economic News: ${newsEvents.length > 0 ? newsEvents.map(n => `${n.title} (${n.time || 'Today'})`).join(', ') : 'No high-impact news in immediate window'}
- Online MCP Engines: ${mcpStatuses.filter(m => m.status === 'ONLINE').map(m => m.name).join(', ') || 'All Core Engines Online'}

[PLATFORM GUIDANCE]
You are INSAi Lead Quantitative Gold Analyst & Trading Mentor. You are embedded directly into the INSAi trading terminal.
1. Be completely HONEST, ACCURATE, and MATHEMATICALLY PRECISE. Use the live real-time market data above.
2. If asked about XAUUSD analysis or direction, provide a structured institutional breakdown:
   - Current Market Structure & HTF Bias (H4/H1)
   - Liquidity Map (Asian High/Low, Session Sweeps, Equal Highs/Lows)
   - Premium/Discount Zone & Optimal Trade Entry (OTE 0.618 - 0.786)
   - Key Point of Interest (POI) / Order Blocks / Fair Value Gaps (FVG)
   - Risk Management & Invalidation Levels
3. If an image is provided (chart screenshot), perform thorough multi-timeframe price action analysis with exact SMC levels.
4. Support the 5 INSAi Canonical Strategies (SMC + London Breakout, S&D + Engulfing, Scalping M1/M5, News Spike, Multi-TF Confluence).
5. Always speak in a professional, clear, and supportive tone in the user's language (Indonesian or English).
`;

    // 3. Prepare Gemini Request Parts
    const contents: any[] = [];

    // Add recent history if present
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        if (h.role === 'user') {
          contents.push({ role: 'user', parts: [{ text: h.content }] });
        } else if (h.role === 'model' || h.role === 'assistant') {
          contents.push({ role: 'model', parts: [{ text: h.content }] });
        }
      }
    }

    // Prepare current prompt parts
    const currentParts: any[] = [];
    if (imageData) {
      const cleanBase64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: cleanBase64,
        }
      });
    }

    if (message) {
      currentParts.push({ text: message });
    }

    contents.push({ role: 'user', parts: currentParts });

    // Robust Multi-Model Fallback Cascade to handle temporary 503 / high demand spikes
    const candidateModels = ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: systemContext,
            temperature: 0.4,
          }
        });
        if (response && response.text) {
          break; // Successfully got response
        }
      } catch (e: any) {
        lastError = e;
        const isUnavailableOrBusy = e.status === 503 || e.message?.includes('503') || e.message?.includes('high demand') || e.message?.includes('UNAVAILABLE') || e.message?.includes('RESOURCE_EXHAUSTED');
        if (isUnavailableOrBusy) {
          console.warn(`Model ${modelName} experiencing high demand (503/429), falling back to next available model...`);
          continue;
        }
        // If other fatal error (e.g. invalid API key), break early
        throw e;
      }
    }

    if (!response || !response.text) {
      if (lastError) throw lastError;
      throw new Error("No response generated from AI models");
    }

    const replyText = response.text || "Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba lagi.";

    return NextResponse.json({
      success: true,
      reply: replyText,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("AI Chat error:", err);
    const isHighDemand = err.status === 503 || err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('UNAVAILABLE');
    
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to process AI chat request",
      reply: isHighDemand 
        ? "⚠️ Server AI saat ini sedang mengalami lonjakan trafik (high demand). Silakan kirim ulang pesan Anda dalam beberapa detik."
        : `Layanan AI Chat sedang mengalami kendala (${err.message || 'Error'}). Silakan periksa konfigurasi GEMINI_API_KEY di Settings.`,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  }
}
