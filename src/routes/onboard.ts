import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { AppDb } from '../db';
import { onboardingSessions } from '../db/schema';
import { DEFAULT_CLIENT_TENANT_ID } from '../db/constants';
import { completeOnboarding, generateSignedState } from '../services/onboarding';

function adminPublicBaseUrl(): string {
  const explicit = process.env.ADMIN_PUBLIC_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const redirect = process.env.META_REDIRECT_URI?.trim();
  if (redirect) {
    try {
      const u = new URL(redirect);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  return '';
}

export function createOnboardRouter(
  getDb: () => AppDb,
  encryptionKey: string,
  adminAuth: (req: Request, res: Response, next: NextFunction) => void,
  log: Logger
) {
  const r = Router();

  async function handleStart(req: Request, res: Response): Promise<void> {
    const db = getDb();
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const tenantFromBody = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
    const redirectFromBody = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
    const tenantId =
      tenantFromBody ||
      (req.query.tenant_id as string | undefined)?.trim() ||
      DEFAULT_CLIENT_TENANT_ID;
    const redirectUri =
      redirectFromBody ||
      (req.query.redirect_uri as string | undefined)?.trim() ||
      process.env.META_REDIRECT_URI;
    if (!redirectUri) {
      res.status(400).json({
        error: { code: 'CONFIG_ERROR' as const, message: 'META_REDIRECT_URI is required' },
      });
      return;
    }
    try {
      const { sessionId, state, expiresAt, signupUrl } = await generateSignedState(
        db,
        tenantId,
        redirectUri,
        encryptionKey
      );
      res.status(200).json({
        signup_url: signupUrl,
        state,
        session_id: sessionId,
        expires_at: expiresAt.toISOString(),
      });
    } catch (err) {
      log.error({ err }, 'onboard start failed');
      const message = err instanceof Error ? err.message : 'Failed to start onboarding';
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR' as const, message },
      });
    }
  }

  r.get('/start', adminAuth, (req, res, next) => {
    void handleStart(req, res).catch(next);
  });
  r.post('/start', adminAuth, (req, res, next) => {
    void handleStart(req, res).catch(next);
  });

  r.get('/callback', async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const base = adminPublicBaseUrl();

    const redirectError = (reason: string) => {
      const target = base
        ? `${base}/onboard?onboard=error&reason=${encodeURIComponent(reason)}`
        : `/onboard?onboard=error&reason=${encodeURIComponent(reason)}`;
      res.redirect(302, target);
    };

    if (!code || !state) {
      redirectError('missing_code_or_state');
      return;
    }

    const db = getDb();
    try {
      const result = await completeOnboarding(db, code, state, encryptionKey, log);
      const firstWaba = result.wabaIds[0] ?? '';
      const target = base
        ? `${base}/onboard?onboard=success&waba_id=${encodeURIComponent(firstWaba)}`
        : `/onboard?onboard=success&waba_id=${encodeURIComponent(firstWaba)}`;
      res.redirect(302, target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'INVALID_STATE' || msg === 'STATE_ALREADY_USED') {
        redirectError(msg.toLowerCase());
        return;
      }
      log.warn({ err: msg }, 'onboard callback error');
      redirectError('exchange_failed');
    }
  });

  r.get('/status/:sessionId', adminAuth, async (req: Request, res: Response) => {
    const sessionId = req.params.sessionId;
    const db = getDb();
    const rows = await db.select().from(onboardingSessions).where(eq(onboardingSessions.id, sessionId)).limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND' as const, message: 'Session not found' } });
      return;
    }
    res.status(200).json({
      id: row.id,
      tenant_id: row.tenantId,
      status: row.status,
      metadata: row.metadataJson,
      error_message: row.errorMessage,
      expires_at: row.expiresAt.toISOString(),
      completed_at: row.completedAt?.toISOString() ?? null,
    });
  });

  return r;
}
