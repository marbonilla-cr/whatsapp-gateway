import type { InferSelectModel } from 'drizzle-orm';
import type { apps } from '../db/schema';

/** App row with Meta routing fields (joined in gateway auth). */
export type GatewayAppContext = InferSelectModel<typeof apps> & {
  metaPhoneNumberId: string;
  accessTokenEncrypted: string;
};

/** Minimal app shape for webhook callback forwarding. */
export type AppRow = InferSelectModel<typeof apps>;

export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'META_ERROR'
  | 'INTERNAL_ERROR'
  | 'INVALID_SIGNATURE';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export type MetaMessageType = 'text' | 'template' | 'image' | 'document';

export interface MetaMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: MetaMessageType;
  text?: { body: string; preview_url?: boolean };
  template?: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
  image?: { link?: string; id?: string };
  document?: { link?: string; id?: string; filename?: string };
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly metaBody: unknown
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}
