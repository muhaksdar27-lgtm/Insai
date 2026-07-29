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
import { getSupabaseClient } from '@/lib/supabase/client';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || "3000", 10);
const turbopack = false;

let pyProcess: ChildProcess | null = null;

let isReady = false;
let isShuttingDown = false;
let isAppPrepared = false;

// Global unhandled handlers
process.on('unhandledRejection', (reason) => {
  try {
    logger.error('Unhandled Rejection', { reason: reason instanceof Error ? { message: reason.message, stack: (reason as any).stack } : reason });
  } catch (e) {
    console.error('Unhandled Rejection', reason);
  }
});
process.on('uncaughtException', (err) => {
  try {
    logger.error('Uncaught Exception', { message: err?.message, stack: err?.stack });
  } catch (e) {
    console.error('Uncaught Exception', err);
  }
  // In many server apps uncaught exceptions are fatal
  process.exit(1);
});

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function waitForPythonReady(url: string, timeoutMs = 30000, intervalMs = 1000) {
  const start = Date.now();
  const probeUrls = [url.replace(/\/$/, '') + '/health', url.replace(/\/$/, '')];
  while (Date.now() - start < timeoutMs) {
    for (const u of probeUrls) {
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 3000);
        // use global fetch (Node 18+). Cast to any to avoid TS lib mismatch
        const res = await (globalThis as any).fetch(u, { signal: controller.signal }).catch(() => null);
        clearTimeout(to);
        if (res && (res.status === 200 || res.status === 204 || res.status === 404)) {
          logger.info(`Python engine responded ok at ${u}`);
          return true;
        }
      } catch (err: any) {
        // ignore, next probe
      }
    }
    await sleep(intervalMs);
  }
  return false;
}

async function waitForSupabaseReady(timeoutMs = 10000, intervalMs = 1000) {
  const start = Date.now();
  const supabase = getSupabaseClient();
  while (Date.now() - start < timeoutMs) {
    try {
      if (supabase.isConnected()) {
        logger.info('Supabase client reports connected');
        return true;
      }
    } catch (e: any) {
      // ignore and retry
    }
    await sleep(intervalMs);
  }
  return false;
}

function startPythonEngine() {
  const pythonPort = process.env.PYTHON_PORT || '8181';
  if (!process.env.PYTHON_ENGINE_URL) {
    process.env.PYTHON_ENGINE_URL = `http://127.0.0.1:${pythonPort}`;
  }
  const externalUrl = process.env.PYTHON_ENGINE_URL;

  if (externalUrl && !externalUrl.includes('127.0.0.1') && !externalUrl.includes('localhost')) {
    logger.info(`External Python Engine configured (${externalUrl}), skipping local spawn. Will probe readiness.`);
    // Background probe for external engine
    waitForPythonReady(externalUrl).then(ok => {
      if (!ok) logger.warn(`External Python Engine did not respond within timeout: ${externalUrl}`);
    });
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
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHON_PORT: pythonPort, PYTHONPATH: `${pythonEngineDir}:.` }
    });

    if (pyProcess.stdout) pyProcess.stdout.on('data', (d) => logger.debug(`[py stdout] ${d.toString()}`));
    if (pyProcess.stderr) pyProcess.stderr.on('data', (d) => logger.error(`[py stderr] ${d.toString()}`));

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

    // probe readiness in background
    const pythonUrl = `http://127.0.0.1:${pythonPort}`;
    waitForPythonReady(pythonUrl, 30000).then(ok => {
      if (!ok) logger.warn('Local Python Engine did not respond within 30s; proceeding in DEGRADED mode.');
      else logger.info('Local Python Engine is healthy.');
    });
  } catch (err: any) {
    logger.error(`Failed to spawn Python Engine: ${err.message}. Running in DEGRADED mode.`);
    pyProcess = null;
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
    try {
      pyProcess.kill('SIGTERM');
    } catch (e) {
      logger.warn('Error sending SIGTERM to Python Engine', { e });
    }

    // wait up to 10s for process to exit
    const end = Date.now() + 10000;
    while (pyProcess && !pyProcess.killed && Date.now() < end) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(200);
    }
    if (pyProcess && !pyProcess.killed) {
      logger.warn('Python Engine did not stop in time, forcing SIGKILL');
      try { pyProcess.kill('SIGKILL'); } catch (e) { logger.warn('Error sending SIGKILL', { e }); }
    }
  }

  // Stop scanner
  try {
    const scanner = getMarketScanner();
    if (scanner && typeof scanner.stop === 'function') {
      await scanner.stop();
    }
  } catch (e: any) {
    logger.warn(`Error stopping scanner during shutdown: ${e.message}`);
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
            // Fatal: keep not ready and exit to avoid running with bad env
            isReady = false;
            process.exit(1);
          }

          // Probe dependencies (Python & Supabase) before marking ready
          const pythonUrl = process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:8181';
          const pythonOk = await waitForPythonReady(pythonUrl, 30000).catch(() => false);
          const supabaseOk = await waitForSupabaseReady(10000).catch(() => false);

          if (!pythonOk) {
            logger.warn('Python engine not healthy; continuing in DEGRADED mode (some features may be unavailable)');
          }
          if (!supabaseOk) {
            logger.warn('Supabase not ready; continuing in DEGRADED mode (persistence disabled)');
          }

          try {
            // Start scanner and ingestion even if deps are degraded; they should handle retries
            setTimeout(() => { getMarketScanner().start().catch(err => logger.error(`marketScanner error: ${err.message}`)); }, 3000);
          } catch (e: any) {
            logger.error(`Failed to start market scanner: ${e.message}`);
          }

          try {
             getIngestionService().start('XAUUSD');
          } catch (e: any) {
             logger.error(`Failed to start Ingestion Service: ${e.message}`);
          }

          // Mark readiness only if at least core dependencies responded
          if (pythonOk && supabaseOk) {
            isReady = true;
            logger.info('Server marked as ready for healthchecks. All core dependencies responded.');
          } else {
            isReady = false;
            logger.warn('Server NOT marked ready: one or more core dependencies failed readiness checks.');
          }

        } catch (initErr: any) {
          logger.error(`Critical error during backend initialization: ${initErr.message}`);
          isReady = false; // keep not-ready so health check will fail
        }
      });
    })
    .catch((err: any) => {
      logger.error(`Failed to prepare Next.js app: ${err.message}`, { stack: err.stack });
      process.exit(1);
    });
});
