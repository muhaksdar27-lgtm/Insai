import { NextResponse } from 'next/server';
import { getTelegramBot } from '@/lib/notifications/telegram-bot';
import { notificationEngine } from '@/lib/notifications/notification-engine';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  const reqId = crypto.randomUUID();
  try {
    const bot = getTelegramBot();
    if (!bot.isConfigured) {
      return NextResponse.json({
        success: false,
        error: 'Telegram is not configured. Please ensure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are provided in environment settings.',
        configured: false,
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 400 });
    }

    // Dispatch a test signal payload with real-time market spot price
    let spotPrice = 2915.00;
    try {
      const { getMarketDataService } = await import('@/lib/market-data/market-data-service');
      const snap = await getMarketDataService().getLatestPrice('XAUUSD', 60000);
      if (snap?.price && typeof snap.price === 'number') {
        spotPrice = snap.price;
      }
    } catch {
      // ignore
    }

    const testPayload = {
      signal_key: `TEST_${Date.now()}`,
      correlationId: reqId,
      strategyName: 'strategy-1-smc',
      symbol: 'XAUUSD',
      timeframe: 'M15',
      session: 'London',
      direction: 'BUY' as const,
      entry: Number(spotPrice.toFixed(2)),
      sl: Number((spotPrice - 8.5).toFixed(2)),
      tp: [Number((spotPrice + 17.0).toFixed(2)), Number((spotPrice + 25.5).toFixed(2))],
      riskReward: '1:2.0',
      atrBuffer: '0.5x ATR (15 pips)',
      validationStatus: 'AI Approved',
      confidence: '92%',
      rulesPassed: [
        'rule_session_london',
        'rule_asia_liquidity_sweep',
        'rule_choch_confirmation',
        'rule_ob_fvg_entry',
        'rule_risk_reward'
      ],
      reason: 'SMC + London Session test verification message sent from INSAI Quantitative Terminal.',
      aiProvider: 'Gemini',
      timestamp: new Date().toISOString(),
      status: 'queued' as const,
      qualityGatePassed: true,
      aiDecision: 'APPROVED',
      engineVersion: '2.0.0'
    };

    const sent = await notificationEngine.notifyNewSignal(testPayload);

    if (sent) {
      logger.info(`[TELEGRAM TEST] Test signal successfully delivered (reqId: ${reqId})`);
      return NextResponse.json({
        success: true,
        message: 'Telegram test message sent successfully to your configured chat ID!',
        configured: true,
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to send message to Telegram. Check bot token and chat ID validity.',
        configured: true,
        meta: { request_id: reqId, timestamp: new Date().toISOString() }
      }, { status: 500 });
    }
  } catch (error: any) {
    logger.error(`[TELEGRAM TEST ERROR] ${error.message}`);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error while sending test to Telegram',
      meta: { request_id: reqId, timestamp: new Date().toISOString() }
    }, { status: 500 });
  }
}

export async function GET() {
  const bot = getTelegramBot();
  return NextResponse.json({
    configured: bot.isConfigured,
    message: bot.isConfigured 
      ? 'Telegram is configured and ready for live signal dispatch.' 
      : 'Telegram is not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in settings.'
  });
}
