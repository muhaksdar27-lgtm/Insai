import WebSocket from 'ws';
import { logger } from '../utils/logger';

export class PyWSClient {
  private static instance: PyWSClient;
  private ws: any = null;
  private url: string;
  private callbacks: Map<string, { resolve: Function, reject: Function, timer: any }> = new Map();
  private reconnectTimer: any = null;
  private connected: boolean = false;

  private constructor(url: string) {
    // ws://127.0.0.1:8181
    this.url = url.replace('http://', 'ws://').replace('https://', 'wss://');
    this.connect();
  }

  public static getInstance(url: string): PyWSClient {
    if (!PyWSClient.instance) {
      PyWSClient.instance = new PyWSClient(url);
    }
    return PyWSClient.instance;
  }

  private connect() {
    try {
      
      this.ws = new WebSocket(`${this.url}/ws/analyze`);
      
      this.ws.on('open', () => {
        logger.info(`WebSocket connected to Python Engine at ${this.url}`);
        this.connected = true;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.on('message', (data: any) => {
        try {
          const res = JSON.parse(data.toString());
          const correlationId = res.correlation_id;
          if (correlationId && this.callbacks.has(correlationId)) {
            const cb = this.callbacks.get(correlationId)!;
            clearTimeout(cb.timer);
            if (res.error) {
               cb.reject(new Error(res.error));
            } else {
               cb.resolve(res.result);
            }
            this.callbacks.delete(correlationId);
          }
        } catch (e: any) {
          logger.error(`WebSocket parse error: ${e.message}`);
        }
      });

      this.ws.on('error', (err: any) => {
        logger.error(`WebSocket error: ${err.message}`);
      });

      this.ws.on('close', () => {
        this.connected = false;
        logger.warn('WebSocket disconnected from Python Engine. Reconnecting in 5s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      });
    } catch (e: any) {
      logger.error(`Failed to initialize WebSocket: ${e.message}`);
    }
  }

  public async analyze(payload: any, timeoutMs: number = 3000): Promise<any> {
    if (!this.connected || !this.ws) {
       throw new Error("WebSocket not connected");
    }
    const crypto = require('crypto');
    const correlationId = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(correlationId);
        reject(new Error("WebSocket request timed out"));
      }, timeoutMs);
      
      this.callbacks.set(correlationId, { resolve, reject, timer });
      
      this.ws.send(JSON.stringify({
         correlation_id: correlationId,
         payload: payload
      }));
    });
  }
}
