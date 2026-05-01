import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { apps, phoneNumbers, tenants, wabas } from '../db/schema';
import { hashApiKey } from '../services/crypto';
import type { V1ApiKeyContext, V1LegacyApiKeyParts } from '../types';

const TOKEN_PREFIX = 'wgw_';

type BearerParseResult =
  | { ok: true; parts: V1LegacyApiKeyParts }
  | { ok: false; reason: 'AUTH_REQUIRED' | 'INVALID_API_KEY' };

function parseBearerToken(authHeader: string | undefined): BearerParseResult {
  if (!authHeader) {
    return { ok: false, reason: 'AUTH_REQUIRED' };
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || !token.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: 'INVALID_API_KEY' };
  }

  const parts = token.slice(TOKEN_PREFIX.length).split('_');
  if (parts.length < 2) {
    return { ok: false, reason: 'INVALID_API_KEY' };
  }

  const [prefix, ...secretParts] = parts;
  const secret = secretParts.join('_');
  if (!prefix || !secret) {
    return { ok: false, reason: 'INVALID_API_KEY' };
  }

  return {
    ok: true,
    parts: {
      prefix,
      secret,
      reconstructedLegacyKey: `gw_${secret}`,
      fullBearerToken: `${TOKEN_PREFIX}${prefix}_${secret}`,
    },
  };
}

function unauthorized(res: Response, code: 'AUTH_REQUIRED' | 'INVALID_API_KEY') {
  const message =
    code === 'AUTH_REQUIRED' ? 'Missing Authorization Bearer token' : 'Invalid or inactive API key';
  res.status(401).json({
    error: {
      code,
      message,
    },
  });
}

async function resolveContext(db: AppDb, parts: V1LegacyApiKeyParts): Promise<V1ApiKeyContext | null> {
  const tokenHashCandidates = [
    hashApiKey(parts.fullBearerToken),
    hashApiKey(parts.reconstructedLegacyKey),
    hashApiKey(parts.secret),
  ];

  let row:
    | {
        app: typeof apps.$inferSelect;
        tenant: typeof tenants.$inferSelect;
        phoneNumber: typeof phoneNumbers.$inferSelect;
        waba: typeof wabas.$inferSelect;
      }
    | undefined;

  for (const tokenHash of tokenHashCandidates) {
    row = (
      await db
        .select({
          app: apps,
          tenant: tenants,
          phoneNumber: phoneNumbers,
          waba: wabas,
        })
        .from(apps)
        .innerJoin(tenants, eq(apps.tenantId, tenants.id))
        .innerJoin(phoneNumbers, eq(apps.phoneNumberId, phoneNumbers.id))
        .innerJoin(wabas, eq(phoneNumbers.wabaId, wabas.id))
        .where(
          and(eq(apps.apiKeyPrefix, parts.prefix), eq(apps.apiKeyHash, tokenHash), eq(apps.isActive, true))
        )
        .limit(1)
    )[0];
    if (row) {
      break;
    }
  }

  if (!row) {
    return null;
  }

  return {
    app: row.app,
    tenant: row.tenant,
    waba: row.waba,
    phoneNumber: row.phoneNumber,
    tenantId: row.tenant.id,
    wabaId: row.waba.id,
    phoneNumberId: row.phoneNumber.metaPhoneNumberId,
  };
}

export function createApiKeyV1Middleware(getDb: () => AppDb) {
  return async function apiKeyV1(req: Request, res: Response, next: NextFunction) {
    const parsed = parseBearerToken(req.header('Authorization'));
    if (!parsed.ok) {
      unauthorized(res, parsed.reason);
      return;
    }

    const context = await resolveContext(getDb(), parsed.parts);
    if (!context) {
      unauthorized(res, 'INVALID_API_KEY');
      return;
    }

    req.v1Auth = context;
    next();
  };
}

export function createApiKeyV1RateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.v1Auth?.app.id ?? req.ip ?? 'v1-anon',
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests for this app',
      },
    },
  });
}
