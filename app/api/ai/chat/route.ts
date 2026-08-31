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

    // 1. Fetch real-time system context
    let livePrice: any = null;
    try {
      livePrice = await getMarketDataService().getLatestPrice("XAUUSD", 60000);
    } catch (e) {
      livePrice = { price: null, freshness: "unavailable", provider: "None" };
    }

    let mcpStatuses: any[] = [];
    try {
      mcpStatuses = getMcpRegistry().getAllStatus();
    } catch (e) {
      mcpStatuses = [];
    }

    let activeSignalsCount = 0;
    try {
      if (getDatabaseClient().isConnected()) {
        const signals = await getDatabaseClient().getActiveSignals();
        activeSignalsCount = Array.isArray(signals) ? signals.length : 0;
      }
    } catch (e) {
      activeSignalsCount = 0;
    }

    let newsEvents: any[] = [];
    try {
      newsEvents = await getMarketDataService().getLatestNews();
    } catch (e) {
      newsEvents = [];
    }

    // 2. Format System Context
    const systemContext = `
[INSAi SYSTEM REALTIME DATA CONTEXT]
- XAUUSD Spot Price: ${livePrice?.price ? `$${livePrice.price.toFixed(2)}` : 'N/A'} (Status: ${livePrice?.freshness || 'N/A'}, Session: ${livePrice?.session || 'N/A'}, Bias: ${livePrice?.bias || 'NEUTRAL'}, Provider: ${livePrice?.provider || 'TwelveData/Yahoo'})
- Active Live Signals in System: ${activeSignalsCount}
- High Impact News Items: ${newsEvents.length} items
- MCP Connectors Count: ${mcpStatuses.length}
- Online MCPs: ${mcpStatuses.filter(m => m.status === 'ONLINE').map(m => m.name).join(', ') || 'Binance, YahooFinance, Internal Engines'}
- Unconfigured / Unavailable MCPs: ${mcpStatuses.filter(m => m.status !== 'ONLINE').map(m => `${m.name} (${m.status})`).join(', ')}

[PLATFORM GUIDANCE]
You are INSAi AI Mentor & System Copilot. You are embedded directly into the INSAi trading application.
1. Be completely HONEST and TRUTHFUL. Never hallucinate prices or fake MCP connectivity. Use the exact real-time data provided above.
2. If asked about XAUUSD price, state the live price and freshness status from context.
3. If asked about strategies or features, explain INSAi's 5 core trading strategies (SMC + London Breakout, S&D + Engulfing HTF, Scalping SMC M1/M5, News Spike Breakout, S&D Multi Timeframe) and how the AI Validation pipeline works.
4. If an image is provided by the user (chart screenshot, technical setup), analyze the price action, support/demand zones, market structure (BOS/CHoCH), order blocks, and risk management.
5. Provide actionable, educational, professional trading mentorship. Speak flexibly and politely in the language used by the user (Indonesian or English).
`;

    // 3. Prepare Gemini Request Parts
    const contents: any[] = [];

    // Add recent history if present
    if (Array.isArray(history) && history.length > 0) {
      // Keep up to last 6 messages to keep context concise
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
      // Clean up base64 prefix if present
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

    // Call Gemini 3.6 Flash
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction: systemContext,
        temperature: 0.7,
      }
    });

    const replyText = response.text || "Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba lagi.";

    return NextResponse.json({
      success: true,
      reply: replyText,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("AI Chat error:", err);
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to process AI chat request",
      reply: `Layanan AI Chat sedang mengalami kendala (${err.message || 'Error'}). Silakan periksa konfigurasi GEMINI_API_KEY di Settings.`,
      timestamp: new Date().toISOString()
    }, { status: 200 });
  }
}
