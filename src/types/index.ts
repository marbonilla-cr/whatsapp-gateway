import type { InferSelectModel } from 'drizzle-orm';
import type { apps, phoneNumbers, tenants, wabas } from '../db/schema';

/** App row with Meta routing fields (joined in gateway auth). */
export type GatewayAppContext = InferSelectModel<typeof apps> & {
  wabaId: string;
  metaPhoneNumberId: string;
  accessTokenEncrypted: string;
};

/** Minimal app shape for webhook callback forwarding. */
export type AppRow = InferSelectModel<typeof apps>;

export type V1ApiKeyContext = {
  app: InferSelectModel<typeof apps>;
  tenant: InferSelectModel<typeof tenants>;
  waba: InferSelectModel<typeof wabas>;
  phoneNumber: InferSelectModel<typeof phoneNumbers>;
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
};

export type V1LegacyApiKeyParts = {
  prefix: string;
  secret: string;
  reconstructedLegacyKey: string;
  fullBearerToken: string;
};

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

