import { getAccessToken, refreshAccessToken, clearSession } from './auth';

const BASE = import.meta.env.VITE_GATEWAY_URL ?? '';

async function fetchWithAuth(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  if (r.status === 401 && !retried) {
    const newTok = await refreshAccessToken();
    if (newTok) {
      return fetchWithAuth(path, init, true);
    }
  }
  return r;
}

async function handleJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    if (r.status === 401) {
      clearSession();
      window.location.assign('/login');
    }
    const errObj =
      typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error?: { message?: string; code?: string } }).error
        : undefined;
    const msg = errObj?.message ?? (r.status === 403 ? 'Forbidden' : r.statusText) ?? `Error ${r.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export type GatewayApp = {
  id: string;
  tenantId: string;
  name: string;
  apiKeyPrefix: string;
  callbackUrl: string;
  phoneNumberId: string;
  /** Meta WABA id (Graph). */
  wabaId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type MessageLog = {
  id: string;
  appId: string;
  tenantId?: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  messageType: string;
  bodyPreview: string | null;
  rawPayload: unknown;
  metaMessageId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export type CreateAppResponse = GatewayApp & { apiKey: string };

export type OnboardStartResponse = {
  signup_url: string;
  state: string;
  session_id: string;
  expires_at: string;
};

export type OnboardStatusResponse = {
  id: string;
  tenant_id: string;
  status: string;
  metadata: unknown;
  error_message: string | null;
  expires_at: string;
  completed_at: string | null;
};

export type TenantRow = {
  id: string;
  businessName: string;
  contactEmail: string;
  status: string;
  plan: string;
  countryCode: string;
};

export type WabaRow = {
  id: string;
  metaWabaId: string;
  status: string;
  tokenExpiresAt: string | null;
};

export type PhoneNumberRow = {
  id: string;
  wabaId: string;
  metaPhoneNumberId: string;
  displayPhoneNumber: string;
  displayName: string | null;
  status: string;
};

export type TemplateRow = {
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
  rejected_reason: string | null;
};

export type AuditRow = {
  id: string;
  tenantId: string | null;
  action: string;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

function metaRedirectUriForOnboarding(): string {
  const v = import.meta.env.VITE_META_REDIRECT_URI as string | undefined;
  if (v && v.trim()) return v.trim();
  const base = BASE.replace(/\/$/, '');
  return `${base}/onboard/callback`;
}

export const api = {
  listTenants: () =>
    fetchWithAuth('/admin/v2/tenants').then((r) => handleJson<TenantRow[]>(r)),

  getTenant: (id: string) =>
    fetchWithAuth(`/admin/v2/tenants/${encodeURIComponent(id)}`).then((r) => handleJson<TenantRow>(r)),

  createTenant: (body: object) =>
    fetchWithAuth('/admin/v2/tenants', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      handleJson<TenantRow>(r)
    ),

  listApps: (tenantId: string) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/apps`).then((r) => handleJson<GatewayApp[]>(r)),

  startOnboarding: (tenantId: string) =>
    fetchWithAuth('/onboard/start', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId, redirect_uri: metaRedirectUriForOnboarding() }),
    }).then((r) => handleJson<OnboardStartResponse>(r)),

  getOnboardingStatus: (sessionId: string) =>
    fetchWithAuth(`/onboard/status/${sessionId}`).then((r) => handleJson<OnboardStatusResponse>(r)),

  createApp: (tenantId: string, data: object) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/apps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => handleJson<CreateAppResponse>(r)),

  updateApp: (tenantId: string, id: string, data: object) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/apps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r) => handleJson<GatewayApp & { updatedAt?: string }>(r)),

  rotateKey: (tenantId: string, id: string) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/apps/${id}/rotate-key`, { method: 'POST' }).then((r) =>
      handleJson<{ apiKey: string }>(r)
    ),

  deleteApp: async (tenantId: string, id: string) => {
    const r = await fetchWithAuth(`/admin/v2/tenants/${tenantId}/apps/${id}`, { method: 'DELETE' });
    if (r.status === 204) return;
    await handleJson(r);
  },

  getMessages: (tenantId: string, limit = 100) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/messages?limit=${limit}`).then((r) =>
      handleJson<{ data: MessageLog[] }>(r)
    ),

  listWabas: (tenantId: string) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/wabas`).then((r) => handleJson<WabaRow[]>(r)),

  listWabaPhones: (tenantId: string, wabaId: string) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones`).then((r) =>
      handleJson<PhoneNumberRow[]>(r)
    ),

  requestPhoneCode: (tenantId: string, wabaId: string, phoneRowId: string, codeMethod: 'SMS' | 'VOICE') =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones/${encodeURIComponent(phoneRowId)}/request-code`,
      { method: 'POST', body: JSON.stringify({ code_method: codeMethod }) }
    ).then(async (r) => {
      if (r.status === 204) return;
      await handleJson(r);
    }),

  verifyPhoneCode: (tenantId: string, wabaId: string, phoneRowId: string, code: string) =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones/${encodeURIComponent(phoneRowId)}/verify-code`,
      { method: 'POST', body: JSON.stringify({ code }) }
    ).then(async (r) => {
      if (r.status === 204) return;
      await handleJson(r);
    }),

  registerPhoneNumber: (tenantId: string, wabaId: string, phoneRowId: string, pin: string) =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones/${encodeURIComponent(phoneRowId)}/register`,
      { method: 'POST', body: JSON.stringify({ pin }) }
    ).then(async (r) => {
      if (r.status === 204) return;
      await handleJson(r);
    }),

  setTwoFAPin: (tenantId: string, wabaId: string, phoneRowId: string, pin: string) =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones/${encodeURIComponent(phoneRowId)}/two-step`,
      { method: 'POST', body: JSON.stringify({ pin }) }
    ).then(async (r) => {
      if (r.status === 204) return;
      await handleJson(r);
    }),

  updatePhoneProfileName: (tenantId: string, wabaId: string, phoneRowId: string, name: string) =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/wabas/${encodeURIComponent(wabaId)}/phones/${encodeURIComponent(phoneRowId)}/profile`,
      { method: 'PATCH', body: JSON.stringify({ name }) }
    ).then(async (r) => {
      if (r.status === 204) return;
      await handleJson(r);
    }),

  getTemplateStatus: (tenantId: string, wabaId: string, name: string) =>
    fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/templates/${encodeURIComponent(name)}?waba_id=${encodeURIComponent(wabaId)}`
    ).then((r) => handleJson<TemplateRow>(r)),

  listTemplates: (tenantId: string, wabaId: string) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/templates?waba_id=${encodeURIComponent(wabaId)}`).then((r) =>
      handleJson<{ data: TemplateRow[] }>(r)
    ),

  createTemplate: (tenantId: string, wabaId: string, body: object) =>
    fetchWithAuth(`/admin/v2/tenants/${tenantId}/templates?waba_id=${encodeURIComponent(wabaId)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => handleJson<TemplateRow>(r)),

  deleteTemplate: async (tenantId: string, wabaId: string, name: string) => {
    const r = await fetchWithAuth(
      `/admin/v2/tenants/${tenantId}/templates/${encodeURIComponent(name)}?waba_id=${encodeURIComponent(wabaId)}`,
      { method: 'DELETE' }
    );
    if (r.status === 204) return;
    await handleJson(r);
  },

  getAuditLog: (limit = 50) =>
    fetchWithAuth(`/admin/v2/audit-log?limit=${limit}`).then((r) => handleJson<{ data: AuditRow[] }>(r)),

  /** POST /send — requiere API key de la app (no JWT). */
  sendMessage: (gatewayApiKey: string, body: object) =>
    fetch(`${BASE}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Key': gatewayApiKey,
      },
      body: JSON.stringify(body),
    }).then((r) => handleJson<{ success: boolean; messageId?: string }>(r)),
};

export function getGatewayBase(): string {
  return BASE;
}
