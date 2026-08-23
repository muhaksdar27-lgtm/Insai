import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';


import { logger, requestContext } from '@/lib/utils/logger';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getQueueManager } from '@/lib/redis/queue';
import { validateEnvironment } from '@/lib/security/env-validator';
import { getIngestionService } from '@/lib/services/ingestion_service';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const rawPort = process.env.PORT || '3000';
const port = parseInt(rawPort, 10) || 3000;
const turbopack = false;

export type ServerLifecycleStatus = 'starting' | 'ready' | 'degraded' | 'failed' | 'shutting_down';

let serverStatus: ServerLifecycleStatus = 'starting';
let initErrorMessage: string | null = null;
let isAppPrepared = false;
let pyProcess: any = null;
const degradedComponents = new Map<string, string>();

logger.info(`[BOOT] Configuration loaded (NODE_ENV=${process.env.NODE_ENV || 'development'}, PORT=${port}, HOST=${hostname})`);

function registerDegradedComponent(name: string, reason: string) {
  degradedComponents.set(name, reason);
  if (serverStatus === 'ready') {
    serverStatus = 'degraded';
  }
  logger.warn(`[BOOT][DEGRADED] Component [${name}]: ${reason}`);
}

async function verifyPythonEngine() {
  const pyUrl = process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:8181';
  logger.info(`[BOOT] Python engine initialization started (Target: ${pyUrl})...`);
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${pyUrl}/health`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    
    if (res && res.ok) {
      logger.info(`[BOOT] Python analytical engine confirmed ONLINE at ${pyUrl}`);
    } else {
      registerDegradedComponent('pythonEngine', `Python sidecar unreachable at ${pyUrl}. Node.js deterministic fallback active.`);
    }
  } catch (e: any) {
    registerDegradedComponent('pythonEngine', `Python engine check failed: ${e.message}. Node.js fallback active.`);
  }
}

const app = next({ dev, hostname, port, turbopack });
const handle = app.getRequestHandler();

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.headers['x-request-id'] = correlationId;
  res.setHeader('X-Request-ID', correlationId);

  requestContext.run({ correlationId }, () => {
    try {
      const parsedUrl = parse(req.url!, true);
      const { pathname } = parsedUrl;
      
      // Request timeout to prevent hanging connections (skip for SSE)
      if (pathname !== '/api/stream') {
        req.setTimeout(30000, () => {
          logger.warn(`Request timeout: ${req.url}`);
          if (!res.headersSent) {
            res.writeHead(408, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request Timeout' }));
          } else {
            req.destroy();
          }
        });

        res.setTimeout(30000, () => {
          logger.warn(`Response timeout: ${req.url}`);
          if (!res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service Unavailable' }));
          } else {
            req.destroy();
          }
        });
      } else {
        req.setTimeout(0);
        res.setTimeout(0);
      }

      // Universal Health checks endpoints (before Next.js handle)
      const isLivenessPath = pathname === '/health/liveness' || pathname === '/health' || pathname === '/healthz' || pathname === '/live' || pathname === '/ping';
      const isReadinessPath = pathname === '/health/readiness' || pathname === '/ready' || pathname === '/healthcheck';

      if (isLivenessPath) {
        if (serverStatus === 'shutting_down') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'shutting_down', live: false, timestamp: new Date().toISOString() }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          live: true,
          serverStatus,
          port,
          hostname,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }));
        return;
      }
      
      if (isReadinessPath) {
        if (serverStatus === 'shutting_down') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'not_ready', isShuttingDown: true, timestamp: new Date().toISOString() }));
          return;
        }
        if (serverStatus === 'failed') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'failed',
            error: initErrorMessage || 'Backend initialization failed',
            timestamp: new Date().toISOString()
          }));
          return;
        }
        if (serverStatus === 'starting' || !isAppPrepared) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'starting',
            isAppPrepared,
            message: 'Server is compiling and preparing resources...',
            timestamp: new Date().toISOString()
          }));
          return;
        }
        if (serverStatus === 'degraded') {
          const degradedDetails: Record<string, string> = {};
          degradedComponents.forEach((reason, name) => {
            degradedDetails[name] = reason;
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'degraded',
            isAppPrepared,
            port,
            degradedComponents: degradedDetails,
            timestamp: new Date().toISOString()
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ready',
          isAppPrepared,
          port,
          hostname,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }));
        return;
      }

      if (serverStatus === 'shutting_down') {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify({ error: 'Server is shutting down' }));
        return;
      }

      if (!isAppPrepared) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
        res.end(JSON.stringify({ error: 'Server is starting...' }));
        return;
      }

      // Pass to Next.js
      handle(req, res, parsedUrl).catch((err: any) => {
        logger.error(`Error handling ${req.url}: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    } catch (err: any) {
      logger.error(`Server catch block error handling ${req.url}: ${err.message}`, { stack: err.stack });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  });
});

// Setup graceful shutdown
const gracefulShutdown = async (signal: string) => {
  if (serverStatus === 'shutting_down') return;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  serverStatus = 'shutting_down';
  
  // Cleanup Python Process
  if (pyProcess && !pyProcess.killed) {
    logger.info('Shutting down local Python Engine...');
    pyProcess.kill('SIGTERM');
  }

  // Stop scanner
  try {
    const scanner = getMarketScanner();
    if (scanner) {
      scanner.stop();
    }
  } catch (e: any) {
    logger.warn(`Error stopping scanner during shutdown: ${e.message}`);
  }

  // Stop ingestion service
  try {
    const ingestion = getIngestionService();
    if (ingestion) {
      ingestion.stop();
    }
  } catch (e: any) {
    logger.warn(`Error stopping ingestion service during shutdown: ${e.message}`);
  }

  // Close Redis Queue
  try {
    await getQueueManager().close();
  } catch (e: any) {
    logger.warn(`Error stopping queue during shutdown: ${e.message}`);
  }

  // Give existing connections up to 5 seconds to finish
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Forcing server shutdown after timeout');
    process.exit(1);
  }, 5000);

  server.close(() => {
    logger.info('Server successfully closed.');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason: any) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled Rejection: ${message}`, { stack });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  logger.error(`[ERROR][BOOT][HTTP] Server error: ${err.message}`, { stack: err.stack });
  if (err.code === 'EADDRINUSE') {
    logger.error(`[ERROR][BOOT][PORT] Port ${port} is already in use`);
    process.exit(1);
  }
});

async function initializeBackendServices() {
  if (serverStatus === 'shutting_down') return;

  logger.info('[BOOT] Initializing background backend services asynchronously...');

  try {
    // 1. Environment validation
    try {
      validateEnvironment();
    } catch (envErr: any) {
      logger.error(`[ERROR][BOOT][ENV] Environment validation error: ${envErr.message}`);
      serverStatus = 'failed';
      initErrorMessage = `Environment validation failed: ${envErr.message}`;
      return;
    }

    // 2. Redis initialization check
    try {
      logger.info('[BOOT] Queue & Redis initialization started...');
      const queueMgr = getQueueManager();
      if (process.env.REDIS_URL) {
        await queueMgr.connect();
        if (queueMgr.isConnected()) {
          logger.info('[BOOT] Redis connected successfully.');
        } else {
          logger.info('[BOOT] Redis not reachable on configured URL. Operating in standalone high-performance local queue mode.');
        }
      } else {
        logger.info('[BOOT] REDIS_URL not configured. Local in-memory queue fallback active.');
      }
    } catch (redisErr: any) {
      logger.info(`[BOOT] Operating in standalone local queue mode (${redisErr.message}).`);
    }

    // 3. Python Engine verification
    try {
      await verifyPythonEngine();
    } catch (pyErr: any) {
      logger.warn(`[WARN][BOOT][PYTHON] Python Engine probe error: ${pyErr.message}`);
      registerDegradedComponent('pythonEngine', pyErr.message);
    }

    // 4. Market data ingestion service
    try {
      logger.info('[BOOT] Market data initialization started...');
      await getIngestionService().start('XAUUSD');
      logger.info('[BOOT] Market data Ingestion Service started successfully.');
    } catch (e: any) {
      logger.error(`[ERROR][BOOT][TWELVEDATA] Failed to start Ingestion Service: ${e.message}`);
      registerDegradedComponent('ingestionService', e.message);
    }

    // 5. Market Scanner & Trading Engine
    try {
      logger.info('[BOOT] Trading engine started (Market Scanner initializing)...');
      await getMarketScanner().start();
      logger.info('[BOOT] Market Scanner & Trading Engine started successfully.');
    } catch (e: any) {
      logger.error(`[ERROR][BOOT][SCANNER] Failed to start Market Scanner: ${e.message}`);
      registerDegradedComponent('marketScanner', e.message);
    }

    if ((serverStatus as ServerLifecycleStatus) === 'shutting_down') return;

    if (degradedComponents.size > 0) {
      serverStatus = 'degraded';
      logger.warn(`[BOOT] Backend services initialized in DEGRADED mode (${degradedComponents.size} component(s) degraded).`);
    } else {
      serverStatus = 'ready';
      logger.info('[BOOT] All backend services initialized successfully. Server is READY.');
    }

  } catch (initErr: any) {
    logger.error(`[ERROR][BOOT] Critical error during backend initialization: ${initErr.message}`, { stack: initErr.stack });
    serverStatus = 'failed';
    initErrorMessage = initErr.message || 'Unknown backend initialization error';
  }
}

logger.info(`[BOOT] HTTP server starting on ${hostname}:${port}...`);
server.listen(port, hostname, () => {
  logger.info(`[BOOT] Listening on http://${hostname}:${port}`);
  logger.info(`[BOOT] Health endpoints ready (/health/liveness, /health/readiness, /health, /healthz, /ping, /ready, /live)`);
  logger.info(`[BOOT] Next.js preparing...`);
  
  app.prepare()
    .then(() => {
      isAppPrepared = true;
      if (serverStatus === 'starting') {
        serverStatus = 'ready';
      }
      logger.info(`[BOOT] Next.js prepared successfully`);
      
      // Start background services asynchronously (does NOT block HTTP serving or health probes)
      initializeBackendServices().catch((err: any) => {
        logger.error(`[ERROR][BOOT] Unhandled error during background initialization: ${err.message}`, { stack: err.stack });
        registerDegradedComponent('backendInit', err.message);
      });
    })
    .catch((err: any) => {
      logger.error(`[ERROR][BOOT][NEXT] Failed to prepare Next.js app: ${err.message}`, { stack: err.stack });
      serverStatus = 'failed';
      initErrorMessage = `Next.js preparation failed: ${err.message}`;
      process.exit(1);
    });
});

