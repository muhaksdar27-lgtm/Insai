import WebSocket from 'ws';
import { logger } from '../utils/logger';

export class PyWSClient {
  private static instance: PyWSClient;
  private ws: any = null;
  private url: string;
  private callbacks: Map<string, { resolve: Function, reject: Function, timer: any }> = new Map();
  private reconnectTimer: any = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxBackoffMs: number = 30000;

  private constructor(url: string) {
    this.url = url.replace('http://', 'ws://').replace('https://', 'wss://');
    this.connect();
  }

  public static getInstance(url: string): PyWSClient {
    const formattedUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');
    if (!PyWSClient.instance) {
      PyWSClient.instance = new PyWSClient(formattedUrl);
    } else if (PyWSClient.instance.url !== formattedUrl) {
      PyWSClient.instance.url = formattedUrl;
      PyWSClient.instance.reconnectAttempts = 0;
      PyWSClient.instance.connect();
    }
    return PyWSClient.instance;
  }

  private connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(`${this.url}/ws/analyze`);
      
      this.ws.on('open', () => {
        if (!this.connected) {
          logger.info(`WebSocket connected to Python Engine at ${this.url}`);
        }
        this.connected = true;
        this.reconnectAttempts = 0;
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
        // Only log detailed error on initial attempts or periodically to prevent log spamming
        if (this.reconnectAttempts <= 1 || this.reconnectAttempts % 10 === 0) {
          logger.warn(`WebSocket connection issue with Python Engine (${this.url}): ${err.message}`);
        }
      });

      this.ws.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.reconnectAttempts++;

        const backoffMs = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts - 1), this.maxBackoffMs);
        if (wasConnected) {
          logger.warn(`WebSocket disconnected from Python Engine. Reconnecting in ${(backoffMs / 1000).toFixed(1)}s...`);
        }

        this.reconnectTimer = setTimeout(() => this.connect(), backoffMs);
      });
    } catch (e: any) {
      logger.warn(`Failed to initialize WebSocket: ${e.message}`);
      this.reconnectAttempts++;
      const backoffMs = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts - 1), this.maxBackoffMs);
      this.reconnectTimer = setTimeout(() => this.connect(), backoffMs);
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
      
      try {
        this.ws.send(JSON.stringify({
           correlation_id: correlationId,
           payload: payload
        }));
      } catch (err: any) {
        clearTimeout(timer);
        this.callbacks.delete(correlationId);
        reject(err);
      }
    });
  }
}
