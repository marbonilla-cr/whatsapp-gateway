import pino from 'pino';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../../db';
import { wabas } from '../../db/schema';
import { decryptToken } from '../crypto';
import type {
  MetaError,
  MetaResponse,
  MetaMediaUploadResponse,
  PhoneNumber,
  QualityRating,
  SendPayload,
  Template,
  TemplateInput,
  TokenResponse,
} from './types';
import { MetaApiError } from './types';

export const META_API_VERSION = 'v22.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

type LoggerLike = Pick<pino.Logger, 'debug' | 'info' | 'warn' | 'error'>;

interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseMetaError(body: unknown): MetaError | null {
  const bodyRecord = asRecord(body);
  if (!bodyRecord) {
    return null;
  }
  const errorValue = bodyRecord.error;
  const errorRecord = asRecord(errorValue);
  if (!errorRecord || typeof errorRecord.message !== 'string') {
    return null;
  }
  return errorRecord as MetaError;
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) {
    return '';
  }
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    sp.set(key, String(value));
  }
  const out = sp.toString();
  return out ? `?${out}` : '';
}

function parseTokenResponse(raw: Record<string, unknown>): TokenResponse {
  const accessToken = typeof raw.access_token === 'string' ? raw.access_token : '';
  if (!accessToken) {
    throw new MetaApiError('Meta token response missing access_token', 502, raw);
  }
  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : undefined;
  return {
    accessToken,
    tokenType: typeof raw.token_type === 'string' ? raw.token_type : undefined,
    expiresIn,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    ...raw,
  };
}

/**
 * Full Graph API client for a specific WABA.
 */
export class MetaApiClient {
  private readonly logger: LoggerLike;
  private readonly minIntervalMs: number;
  private nextRequestAtMs = 0;

  constructor(
    private readonly wabaId: string,
    private readonly accessToken: string,
    logger?: LoggerLike,
    private readonly onInvalidAccessToken?: () => Promise<void>
  ) {
    this.logger = logger ?? pino({ level: 'silent' });
    const parsed = Number(process.env.META_API_MIN_INTERVAL_MS ?? '100');
    this.minIntervalMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
  }

  /** Meta OAuth / session errors that indicate the WABA token is no longer valid. */
  private shouldTreatAsRevokedToken(code?: number): boolean {
    if (code === undefined) return false;
    // 190 = OAuthException invalid/expired session; 102 = API session / login status
    return code === 190 || code === 102;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    if (this.nextRequestAtMs > now) {
      await sleep(this.nextRequestAtMs - now);
    }
    this.nextRequestAtMs = Date.now() + this.minIntervalMs;
  }

  /**
   * Graph calls that use app id/secret in query (OAuth) must not send a user/WABA Bearer token.
   */
  private async oauthAppSecretRequest<T = Record<string, unknown>>(
    path: string,
    query: RequestOptions['query']
  ): Promise<T> {
    const url = `${META_GRAPH_BASE}/${path}${buildQuery(query)}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const metaError = parseMetaError(body);
      const errMessage =
        metaError?.message ??
        (body && typeof body === 'object' ? `Meta API error (${res.status})` : `Meta API non-json (${res.status})`);
      throw new MetaApiError(
        errMessage,
        res.status,
        body,
        metaError?.code,
        metaError?.error_subcode,
        metaError?.fbtrace_id
      );
    }
    return (body ?? {}) as T;
  }

  private async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${META_GRAPH_BASE}/${path}${buildQuery(options.query)}`;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await this.waitForRateLimit();
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }

        if (res.ok) {
          this.logger.debug({ method, path, status: res.status, attempt }, 'Meta API request ok');
          return (body ?? {}) as T;
        }

        const metaError = parseMetaError(body);
        const errMessage =
          metaError?.message ??
          (body && typeof body === 'object'
            ? `Meta API error (${res.status})`
            : `Meta API non-json error (${res.status})`);
        const err = new MetaApiError(
          errMessage,
          res.status,
          body,
          metaError?.code,
          metaError?.error_subcode,
          metaError?.fbtrace_id
        );

        if (res.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
          const delayMs = RETRY_DELAYS_MS[attempt];
          this.logger.warn(
            { method, path, status: res.status, attempt, delayMs, code: err.code },
            'Meta API transient error, retrying'
          );
          await sleep(delayMs);
          continue;
        }

        if (res.status === 401 && this.shouldTreatAsRevokedToken(err.code)) {
          try {
            await this.onInvalidAccessToken?.();
          } catch (hookErr) {
            this.logger.warn({ hookErr }, 'onInvalidAccessToken hook failed');
          }
        }

        this.logger.error(
          { method, path, status: res.status, attempt, code: err.code, subcode: err.subcode },
          'Meta API request failed'
        );
        throw err;
      } catch (error) {
        if (error instanceof MetaApiError) {
          throw error;
        }
        if (attempt < RETRY_DELAYS_MS.length) {
          const delayMs = RETRY_DELAYS_MS[attempt];
          this.logger.warn(
            { method, path, attempt, delayMs, error: error instanceof Error ? error.message : String(error) },
            'Meta API network error, retrying'
          );
          await sleep(delayMs);
          continue;
        }
        throw new MetaApiError(
          error instanceof Error ? error.message : 'Unknown Meta API network error',
          503,
          null
        );
      }
    }

    throw new MetaApiError('Unreachable Meta API retry state', 500, null);
  }

  /**
   * Sends a WhatsApp message from a configured number.
   */
  async sendMessage(phoneNumberId: string, payload: SendPayload): Promise<MetaResponse> {
    const body = await this.request<Record<string, unknown>>('POST', `${phoneNumberId}/messages`, {
      body: payload as unknown as Record<string, unknown>,
    });
    const messages = Array.isArray(body.messages) ? (body.messages as Array<{ id?: string }>) : [];
    const messageId = messages[0]?.id;
    if (!messageId) {
      throw new MetaApiError('Meta response missing message id', 502, body);
    }
    return { ...body, messageId };
  }

  /**
   * Lists templates available for this WABA.
   */
  async listTemplates(): Promise<Template[]> {
    const body = await this.request<{ data?: Template[] }>('GET', `${this.wabaId}/message_templates`);
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Creates a new template in this WABA.
   */
  async createTemplate(template: TemplateInput): Promise<Template> {
    const body = await this.request<Template>('POST', `${this.wabaId}/message_templates`, {
      body: template as unknown as Record<string, unknown>,
    });
    return body;
  }

  /**
   * Deletes a template by name in this WABA.
   */
  async deleteTemplate(name: string): Promise<void> {
    await this.request('DELETE', `${this.wabaId}/message_templates`, {
      query: { name },
    });
  }

  /**
   * Uploads a media binary to a specific WhatsApp phone number.
   */
  async uploadMedia(phoneNumberId: string, media: {
    file: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<MetaMediaUploadResponse> {
    const form = new FormData();
    const blob = new Blob([media.file], { type: media.mimeType });
    form.set('messaging_product', 'whatsapp');
    form.set('file', blob, media.filename);

    const url = `${META_GRAPH_BASE}/${phoneNumberId}/media`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const metaError = parseMetaError(body);
      throw new MetaApiError(
        metaError?.message ?? `Meta media upload failed (${response.status})`,
        response.status,
        body,
        metaError?.code,
        metaError?.error_subcode,
        metaError?.fbtrace_id
      );
    }

    const parsed = body as Record<string, unknown> | null;
    const id = parsed && typeof parsed.id === 'string' ? parsed.id : '';
    if (!id) {
      throw new MetaApiError('Meta media response missing id', 502, body);
    }
    return {
      id,
      mime_type: parsed && typeof parsed.mime_type === 'string' ? parsed.mime_type : undefined,
      sha256: parsed && typeof parsed.sha256 === 'string' ? parsed.sha256 : undefined,
    };
  }

  /**
   * Lists phone numbers for this WABA.
   */
  async listPhoneNumbers(): Promise<PhoneNumber[]> {
    const body = await this.request<{ data?: PhoneNumber[] }>('GET', `${this.wabaId}/phone_numbers`);
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * Fetches details for one phone number.
   */
  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumber> {
    return this.request<PhoneNumber>('GET', phoneNumberId);
  }

  /**
   * Requests an OTP verification code for a phone number.
   */
  async requestVerificationCode(
    phoneNumberId: string,
    method: 'SMS' | 'VOICE',
    locale = 'en_US'
  ): Promise<void> {
    await this.request('POST', `${phoneNumberId}/request_code`, {
      body: { code_method: method, language: locale },
    });
  }

  /**
   * Confirms OTP code received by phone verification.
   */
  async verifyCode(phoneNumberId: string, code: string): Promise<void> {
    await this.request('POST', `${phoneNumberId}/verify_code`, {
      body: { code },
    });
  }

  /**
   * Registers a phone number for messaging.
   */
  async registerPhone(phoneNumberId: string, pin: string): Promise<void> {
    await this.request('POST', `${phoneNumberId}/register`, {
      body: { messaging_product: 'whatsapp', pin },
    });
  }

  /**
   * Updates display name/profile for a phone number.
   */
  async updateProfileName(phoneNumberId: string, displayName: string): Promise<void> {
    await this.request('POST', `${phoneNumberId}/whatsapp_business_profile`, {
      body: { messaging_product: 'whatsapp', name: displayName },
    });
  }

  /**
   * Sets two-step verification pin for a phone number.
   */
  async setTwoStepPin(phoneNumberId: string, pin: string): Promise<void> {
    await this.request('POST', `${phoneNumberId}/two_step_verification`, {
      body: { pin },
    });
  }

  /**
   * Subscribes this WABA to app webhook events.
   */
  async subscribeWebhook(): Promise<void> {
    await this.request('POST', `${this.wabaId}/subscribed_apps`);
  }

  /**
   * Unsubscribes this WABA from app webhook events.
   */
  async unsubscribeWebhook(): Promise<void> {
    await this.request('DELETE', `${this.wabaId}/subscribed_apps`);
  }

  /**
   * Exchanges an OAuth code for a Meta access token.
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      throw new MetaApiError('META_APP_ID and META_APP_SECRET are required', 500, null);
    }

    const body = await this.oauthAppSecretRequest<Record<string, unknown>>('oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    return parseTokenResponse(body);
  }

  /**
   * Renews an existing token into a long-lived token.
   */
  async refreshLongLivedToken(currentToken: string): Promise<TokenResponse> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      throw new MetaApiError('META_APP_ID and META_APP_SECRET are required', 500, null);
    }

    const body = await this.oauthAppSecretRequest<Record<string, unknown>>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    });
    return parseTokenResponse(body);
  }

  /**
   * Reads quality rating and messaging tier for a phone number.
   */
  async getQualityRating(phoneNumberId: string): Promise<QualityRating> {
    const details = await this.getPhoneNumber(phoneNumberId);
    return {
      phoneNumberId,
      qualityRating: details.quality_rating ?? null,
      messagingLimit: {
        tier: details.messaging_limit_tier ?? null,
        qualityRating: details.quality_rating ?? null,
      },
    };
  }
}

export async function getMetaApiClient(options: {
  db: AppDb;
  wabaId: string;
  encryptionKey: string;
  logger?: LoggerLike;
}): Promise<MetaApiClient> {
  const row = (
    await options.db
      .select({
        id: wabas.id,
        metaWabaId: wabas.metaWabaId,
        accessTokenEncrypted: wabas.accessTokenEncrypted,
      })
      .from(wabas)
      .where(eq(wabas.id, options.wabaId))
      .limit(1)
  )[0];

  if (!row) {
    throw new MetaApiError(`WABA not found: ${options.wabaId}`, 404, null);
  }

  let token: string;
  try {
    token = decryptToken(row.accessTokenEncrypted, options.encryptionKey);
  } catch {
    throw new MetaApiError('Failed to decrypt Meta access token', 500, null);
  }

  const internalId = row.id;
  const onInvalid = async (): Promise<void> => {
    await options.db
      .update(wabas)
      .set({ status: 'revoked', updatedAt: new Date(), errorMessage: 'Meta returned 401 invalid session' })
      .where(eq(wabas.id, internalId));
  };

  /** Graph paths use Meta WABA id, not internal PK. */
  return new MetaApiClient(row.metaWabaId, token, options.logger, onInvalid);
}
