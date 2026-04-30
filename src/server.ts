import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino, { type Logger } from 'pino';
import pinoHttp from 'pino-http';
import http from 'node:http';
import { initDb, getDb, resetDbSingleton } from './db';
import { createAdminAuthMiddleware } from './middleware/adminAuth';
import { createGatewayAuthMiddleware } from './middleware/auth';
import { createAdminRouter } from './routes/admin';
import { createHealthRouter } from './routes/health';
import { createSendRouter } from './routes/send';
import { createWebhookRouter } from './routes/webhook';
import { shutdown as shutdownQueues } from './queue';
import { startForwardWorker, stopForwardWorker } from './queue/workers/forwardWorker';

const CRITICAL_ENV = [
  'ADMIN_SECRET',
  'GATEWAY_ENCRYPTION_KEY',
  'META_VERIFY_TOKEN',
  'DATABASE_URL',
  'LOG_LEVEL',
] as const;

function validateEnv(): void {
  const missing = CRITICAL_ENV.filter((k) => !process.env[k] || process.env[k] === '');
  if (missing.length > 0) {
    console.error(
      'Missing required environment variables:',
      missing.join(', '),
      '\nSet them in .env or your host environment (see .env.example).'
    );
    process.exit(1);
  }
  const hex = process.env.GATEWAY_ENCRYPTION_KEY!;
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    console.error('GATEWAY_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).');
    process.exit(1);
  }
}

export async function buildApp() {
  validateEnv();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  process.env.NODE_ENV = nodeEnv;
  const port = Number(process.env.PORT ?? '3000');
  const databaseUrl = process.env.DATABASE_URL!;
  const adminSecret = process.env.ADMIN_SECRET!;
  const encryptionKey = process.env.GATEWAY_ENCRYPTION_KEY!;
  const metaVerifyToken = process.env.META_VERIFY_TOKEN!;
  const logLevel = process.env.LOG_LEVEL!;
  const metaWebhookHmacSecret = process.env.META_APP_SECRET ?? encryptionKey;

  await initDb(databaseUrl);

  const logger = pino({
    level: logLevel,
    transport:
      nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
  });

  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Admin-Secret', 'X-Gateway-Key', 'x-hub-signature-256'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url?.startsWith('/health?'),
      },
    })
  );

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    })
  );

  const sendLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.header('X-Gateway-Key') ?? req.ip ?? 'anonymous',
  });

  const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/send', sendLimiter);
  app.use(globalLimiter);

  const adminAuth = createAdminAuthMiddleware(adminSecret);
  const gatewayAuth = createGatewayAuthMiddleware(() => getDb());

  app.use('/webhook', createWebhookRouter(() => getDb(), metaVerifyToken, metaWebhookHmacSecret, logger));
  app.use('/send', createSendRouter(() => getDb(), encryptionKey, gatewayAuth));
  app.use('/health', createHealthRouter(() => getDb()));
  app.use('/admin', createAdminRouter(() => getDb(), encryptionKey, adminAuth));

  startForwardWorker(() => getDb(), logger);

  const adminUiDir = path.join(__dirname, 'admin-ui');
  if (fs.existsSync(adminUiDir)) {
    logger.info({ adminUiDir }, 'admin UI enabled');
    app.use(express.static(adminUiDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      const p = req.path;
      if (
        p.startsWith('/webhook') ||
        p.startsWith('/send') ||
        p.startsWith('/health') ||
        p.startsWith('/admin')
      ) {
        next();
        return;
      }
      if (path.extname(p) !== '' && p !== '/') {
        next();
        return;
      }
      res.sendFile(path.join(adminUiDir, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    logger.warn(
      'Admin UI missing (dist/admin-ui not next to server.js). Run full `npm run build` so /login works; until then use the admin app locally with VITE_GATEWAY_URL.'
    );
  }

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND' as const, message: 'Not found' },
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR' as const, message },
    });
  });

  return { app, port, logger };
}

async function gracefulShutdown(server: http.Server, logger: Logger, signal: string): Promise<void> {
  logger.info({ signal }, 'graceful shutdown');
  await stopForwardWorker(logger);
  await shutdownQueues();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await resetDbSingleton();
  process.exit(0);
}

if (require.main === module) {
  void buildApp().then(({ app, port, logger }) => {
    const server = http.createServer(app);
    server.listen(port, () => {
      logger.info({ port }, 'WhatsApp Gateway listening');
    });
    const onSignal = (sig: string) => {
      void gracefulShutdown(server, logger, sig).catch((err) => {
        logger.error({ err }, 'shutdown error');
        process.exit(1);
      });
    };
    process.on('SIGTERM', () => onSignal('SIGTERM'));
    process.on('SIGINT', () => onSignal('SIGINT'));
  });
}
