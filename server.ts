
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger, requestContext } from '@/lib/utils/logger';
import { getMarketScanner } from '@/lib/trading-engine/scanner';
import { getQueueManager } from '@/lib/redis/queue';
import { validateEnvironment } from '@/lib/security/env-validator';
import { getIngestionService } from '@/lib/services/ingestion_service';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || "3000", 10);
const turbopack = false;

let pyProcess: ChildProcess | null = null;

function startPythonEngine() {
  const pythonPort = process.env.PYTHON_PORT || '8181';
  if (!process.env.PYTHON_ENGINE_URL) {
    process.env.PYTHON_ENGINE_URL = `http://127.0.0.1:${pythonPort}`;
  }
  const externalUrl = process.env.PYTHON_ENGINE_URL;
  
  if (externalUrl && !externalUrl.includes('127.0.0.1') && !externalUrl.includes('localhost')) {
    logger.info(`External Python Engine configured (${externalUrl}), skipping local spawn.`);
    return;
  }
  
  logger.info('Starting Python Engine locally...');
  
  try {
    const fs = require('fs');
    const pythonExecutable = fs.existsSync('/app/venv/bin/python') ? '/app/venv/bin/python' : 'python3';
    const pyScript = process.env.NODE_ENV === 'production'
      ? `${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port ${pythonPort}`
      : `bash ./ensure-python.sh && ${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port ${pythonPort}`;
    const pythonEngineDir = path.join(process.cwd(), 'python-engine');
    logger.info(`Spawning Python Engine with: ${pyScript}`);
    pyProcess = spawn('bash', ['-c', pyScript], {
      cwd: pythonEngineDir,
      stdio: 'inherit',
      env: { ...process.env, PYTHON_PORT: pythonPort, PYTHONPATH: `${pythonEngineDir}:.` }
    });

    pyProcess.on('error', (err: any) => {
      logger.error(`Failed to start local Python Engine: ${err.message}. Running in DEGRADED mode.`);
      pyProcess = null;
    });

    pyProcess.on('close', (code: any) => {
      if (isShuttingDown) return;
      if (code !== 0 && code !== null) {
        logger.error(`Local Python Engine exited unexpectedly with code ${code}. Running in DEGRADED mode.`);
      } else {
        logger.info('Local Python Engine exited normally.');
      }
      pyProcess = null;
    });
  } catch (err: any) {
    logger.error(`Failed to spawn Python Engine: ${err.message}. Running in DEGRADED mode.`);
    pyProcess = null;
  }
}

let isReady = false;
let isInitFailed = false;
let isShuttingDown = false;
let isAppPrepared = false;
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }
      
      if (pathname === '/health/readiness') {
        if (isShuttingDown) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'not_ready', isShuttingDown, timestamp: new Date().toISOString() }));
          return;
        }
        if (isInitFailed) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'unhealthy', error: 'Backend initialization failed', timestamp: new Date().toISOString() }));
          return;
        }
        if (!isReady) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'starting', timestamp: new Date().toISOString() }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', timestamp: new Date().toISOString() }));
        return;
      }

      if (isShuttingDown) {
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
  if (isShuttingDown) return;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;
  
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

server.on('error', (err: NodeJS.ErrnoException) => {
  logger.error(`Server error: ${err.message}`, { stack: err.stack });
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use`);
    process.exit(1);
  }
});

server.listen(port, hostname, () => {
  logger.info(`> Listening on http://${hostname}:${port} (Next.js preparing...)`);
  
  app.prepare()
    .then(() => {
      isAppPrepared = true;
      logger.info(`> Next.js prepared successfully`);
      
      // Initialize systems asynchronously to avoid blocking startup
      Promise.resolve().then(async () => {
        try {
          startPythonEngine();
          try {
            validateEnvironment();
          } catch (envErr: any) {
            logger.error(`Environment validation failed: ${envErr.message}`);
            process.exit(1);
          }
          logger.info('Services initialized asynchronously.');
          
          try {
            setTimeout(() => { getMarketScanner().start().catch(err => logger.error(`marketScanner error: ${err.message}`)); }, 3000);
          } catch (e: any) {
            logger.error(`Failed to start market scanner: ${e.message}`);
          }
          
          try {
             getIngestionService().start('XAUUSD').catch(err => logger.error(`IngestionService start error: ${err.message}`));
          } catch (e: any) {
             logger.error(`Failed to start Ingestion Service: ${e.message}`);
          }
          
          // Wait for a brief moment for async startups like Redis to connect before declaring ready
          setTimeout(() => {
             isReady = true;
             logger.info('Server marked as ready for healthchecks.');
          }, 3000);
          
        } catch (initErr: any) {
          logger.error(`Critical error during backend initialization: ${initErr.message}`);
          isReady = false;
          isInitFailed = true;
        }
      });
    })
    .catch((err: any) => {
      logger.error(`Failed to prepare Next.js app: ${err.message}`, { stack: err.stack });
      process.exit(1);
    });
});
