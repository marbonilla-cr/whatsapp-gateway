import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { getDb } from './db';
import { createAdminAuthMiddleware } from './middleware/adminAuth';
import { createGatewayAuthMiddleware } from './middleware/auth';
import { createAdminRouter } from './routes/admin';
import { createHealthRouter } from './routes/health';
import { createSendRouter } from './routes/send';
import { createWebhookRouter } from './routes/webhook';

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

function ensureDataDirFromDatabaseUrl(databaseUrl: string): void {
  if (databaseUrl === ':memory:') {
    return;
  }
  const resolved = path.resolve(databaseUrl);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function buildApp() {
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

  ensureDataDirFromDatabaseUrl(databaseUrl);
  getDb(databaseUrl);

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
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url?.startsWith('/health?'),
      },
    })
  );

  // Raw body for Meta HMAC: `verify` runs on the raw buffer before JSON parse (spec: capture before parse).
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
  const gatewayAuth = createGatewayAuthMiddleware(() => getDb(databaseUrl));

  app.use(
    '/webhook',
    createWebhookRouter(
      () => getDb(databaseUrl),
      metaVerifyToken,
      metaWebhookHmacSecret,
      logger
    )
  );
  app.use(
    '/send',
    createSendRouter(() => getDb(databaseUrl), encryptionKey, gatewayAuth)
  );
  app.use('/health', createHealthRouter(() => getDb(databaseUrl)));
  app.use('/admin', createAdminRouter(() => getDb(databaseUrl), encryptionKey, adminAuth));

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

if (require.main === module) {
  const { app, port, logger } = buildApp();
  app.listen(port, () => {
    logger.info({ port }, 'WhatsApp Gateway listening');
  });
}
