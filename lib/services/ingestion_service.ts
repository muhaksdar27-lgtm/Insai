import { logger } from '../utils/logger';
import { getQueueManager } from '../redis/queue';
import { getMarketDataService } from '../market-data/market-data-service';

export class IngestionService {
  private currentSymbol: string = 'XAUUSD';
  private fallbackInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {}

  public async start(symbol: string = 'XAUUSD') {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentSymbol = symbol;
    
    logger.info(`Starting Ingestion Service for ${symbol}`);
    
    // 1. Ambil history saat inisialisasi menggunakan MarketDataService
    try {
      const history = await getMarketDataService().getCandles(symbol, '15m', 500);
      if (Array.isArray(history) && history.length > 0) {
        logger.info(`History loaded: ${history.length} candles for ${symbol}`);
        this.pushToRedis({
          symbol,
          price: history[history.length - 1].close,
          timestamp: history[history.length - 1].timestamp,
          provider: 'Init',
          freshness: 'cached'
        });
      }
    } catch (e: any) {
      logger.error(`Failed to load initial history: ${e.message}`);
    }

    // 2. The TwelveData provider WS is initialized lazily when getLatestPrice is called
    // So we just call it once to bootstrap the connection
    try {
       await getMarketDataService().getLatestPrice(symbol);
    } catch(e) {}

    // 3. Fallback Mechanism
    this.startFallbackMonitor();
  }

  public stop() {
    this.isRunning = false;
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    logger.info(`Ingestion Service stopped`);
  }

  private startFallbackMonitor() {
    if (this.fallbackInterval) clearInterval(this.fallbackInterval);
    
    this.fallbackInterval = setInterval(async () => {
      try {
        const latestPrice = await getMarketDataService().getLatestPrice(this.currentSymbol);
        this.pushToRedis(latestPrice);
      } catch (e: any) {
        logger.error(`Ingestion polling failed: ${e.message}`);
      }
    }, 60000);
  }

  private async pushToRedis(data: any) {
    try {
      if (!data.symbol || (!data.price && !data.close)) return;
      
      const streamKey = `market_stream:${data.symbol}`;
      await getQueueManager().streamPublish(streamKey, {
        id: `tick-${Date.now()}`,
        type: 'MARKET_DATA',
        payload: data,
        timestamp: data.timestamp,
        retryCount: 0
      });
    } catch (e) {
      // ignore
    }
  }
}

let _ingestionService: IngestionService | null = null;
export function getIngestionService() {
  if (!_ingestionService) {
    _ingestionService = new IngestionService();
  }
  return _ingestionService;
}
