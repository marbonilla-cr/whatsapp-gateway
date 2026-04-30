export type MetaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string;

export interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: unknown[];
  [key: string]: unknown;
}

export interface Template {
  id?: string;
  name: string;
  language?: string;
  category?: MetaTemplateCategory;
  status?: string;
  components?: MetaTemplateComponent[];
  [key: string]: unknown;
}

export interface TemplateInput {
  name: string;
  language: string;
  category: MetaTemplateCategory;
  components: MetaTemplateComponent[];
  allow_category_change?: boolean;
}

export interface SendTextPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface SendTemplatePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
}

export interface SendImagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image';
  image: { link?: string; id?: string };
}

export interface SendDocumentPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'document';
  document: { link?: string; id?: string; filename?: string };
}

export interface SendInteractivePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: Record<string, unknown>;
}

export type SendPayload =
  | SendTextPayload
  | SendTemplatePayload
  | SendImagePayload
  | SendDocumentPayload
  | SendInteractivePayload;

export interface MetaResponse {
  messageId?: string;
  success?: boolean;
  [key: string]: unknown;
}

export interface MetaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  [key: string]: unknown;
}

export interface PhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  status?: string;
  [key: string]: unknown;
}

export interface MessagingLimit {
  tier: string | null;
  qualityRating: string | null;
}

export interface QualityRating {
  phoneNumberId: string;
  qualityRating: string | null;
  messagingLimit: MessagingLimit;
}

export interface TokenResponse {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  expiresAt?: Date;
  [key: string]: unknown;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly metaBody: unknown,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly fbTraceId?: string
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}
