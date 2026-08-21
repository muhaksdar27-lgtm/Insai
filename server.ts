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
const hostname = '0.0.0.0';
const port = 3000;
const turbopack = false;

export type ServerLifecycleStatus = 'starting' | 'ready' | 'degraded' | 'failed' | 'shutting_down';

let serverStatus: ServerLifecycleStatus = 'starting';
let initErrorMessage: string | null = null;
let isAppPrepared = false;
let pyProcess: any = null;
const degradedComponents = new Map<string, string>();

function registerDegradedComponent(name: string, reason: string) {
  degradedComponents.set(name, reason);
  if (serverStatus === 'ready') {
    serverStatus = 'degraded';
    logger.warn(`Server lifecycle status changed to DEGRADED [${name}]: ${reason}`);
  }
}

function startPythonEngine() {
  const externalUrl = process.env.PYTHON_ENGINE_URL;
  if (!externalUrl) {
    logger.warn('PYTHON_ENGINE_URL is not set. Engine requires a public external Python Engine URL to function correctly.');
    return;
  }
  
  if (externalUrl.includes('127.0.0.1') || externalUrl.includes('localhost')) {
    logger.warn('PYTHON_ENGINE_URL is set to localhost. This might not work in production without a sidecar. Please provide a public external URL.');
  }

  logger.info(`External Python Engine configured (${externalUrl}), skipping local spawn.`);
  return;
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

      // Health checks endpoints (before Next.js handle)
      if (pathname === '/health/liveness') {
        if (serverStatus === 'shutting_down') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'shutting_down', timestamp: new Date().toISOString() }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }
      
      if (pathname === '/health/readiness') {
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
          res.end(JSON.stringify({ status: 'starting', isAppPrepared, timestamp: new Date().toISOString() }));
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
            degradedComponents: degradedDetails,
            timestamp: new Date().toISOString()
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', timestamp: new Date().toISOString() }));
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
  logger.error(`Server error: ${err.message}`, { stack: err.stack });
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use`);
    process.exit(1);
  }
});

async function initializeBackendServices() {
  if (serverStatus === 'shutting_down') return;

  logger.info('Initializing backend services...');

  try {
    // 1. Environment validation
    try {
      validateEnvironment();
    } catch (envErr: any) {
      logger.error(`Environment validation error: ${envErr.message}`);
      serverStatus = 'failed';
      initErrorMessage = `Environment validation failed: ${envErr.message}`;
      return;
    }

    // 2. Local Python Engine
    try {
      startPythonEngine();
    } catch (pyErr: any) {
      logger.error(`Failed to start Python Engine: ${pyErr.message}`);
      registerDegradedComponent('pythonEngine', pyErr.message);
    }

    // 3. Ingestion Service
    try {
      await getIngestionService().start('XAUUSD');
      logger.info('Ingestion Service started successfully.');
    } catch (e: any) {
      logger.error(`Failed to start Ingestion Service: ${e.message}`);
      registerDegradedComponent('ingestionService', e.message);
    }

    // 4. Market Scanner
    try {
      await getMarketScanner().start();
      logger.info('Market Scanner started successfully.');
    } catch (e: any) {
      logger.error(`Failed to start Market Scanner: ${e.message}`);
      registerDegradedComponent('marketScanner', e.message);
    }

    if ((serverStatus as ServerLifecycleStatus) === 'shutting_down') return;

    if (degradedComponents.size > 0) {
      serverStatus = 'degraded';
      logger.warn(`Backend services initialized in DEGRADED mode (${degradedComponents.size} component(s) degraded).`);
    } else {
      serverStatus = 'ready';
      logger.info('Backend services initialized successfully. Server is READY.');
    }

  } catch (initErr: any) {
    logger.error(`Critical error during backend initialization: ${initErr.message}`, { stack: initErr.stack });
    serverStatus = 'failed';
    initErrorMessage = initErr.message || 'Unknown backend initialization error';
  }
}

server.listen(port, hostname, () => {
  logger.info(`> Listening on http://${hostname}:${port} (Next.js preparing...)`);
  
  app.prepare()
    .then(() => {
      isAppPrepared = true;
      logger.info(`> Next.js prepared successfully`);
      
      initializeBackendServices().catch((err: any) => {
        logger.error(`Unhandled error during backend initialization: ${err.message}`, { stack: err.stack });
        serverStatus = 'failed';
        initErrorMessage = err.message || 'Unhandled error during backend initialization';
      });
    })
    .catch((err: any) => {
      logger.error(`Failed to prepare Next.js app: ${err.message}`, { stack: err.stack });
      serverStatus = 'failed';
      initErrorMessage = `Next.js preparation failed: ${err.message}`;
      process.exit(1);
    });
});
