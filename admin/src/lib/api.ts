const BASE = import.meta.env.VITE_GATEWAY_URL ?? '';

function adminHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Secret': sessionStorage.getItem('adminSecret') ?? '',
  };
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
  name: string;
  apiKeyPrefix: string;
  callbackUrl: string;
  phoneNumberId: string;
  wabaId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type MessageLog = {
  id: string;
  appId: string;
  direction: 'IN' | 'OUT';
  fromNumber: string;
  toNumber: string;
  messageType: string;
  bodyPreview: string | null;
  /** JSON del evento Meta (diagnóstico). */
  rawPayload: string | null;
  metaMessageId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

export type CreateAppResponse = GatewayApp & { apiKey: string };

export const api = {
  listApps: () => fetch(`${BASE}/admin/apps`, { headers: adminHeaders() }).then((r) => handleJson<GatewayApp[]>(r)),

  createApp: (data: object) =>
    fetch(`${BASE}/admin/apps`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(data),
    }).then((r) => handleJson<CreateAppResponse>(r)),

  updateApp: (id: string, data: object) =>
    fetch(`${BASE}/admin/apps/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(data),
    }).then((r) => handleJson<GatewayApp & { updatedAt?: string }>(r)),

  rotateKey: (id: string) =>
    fetch(`${BASE}/admin/apps/${id}/rotate-key`, {
      method: 'POST',
      headers: adminHeaders(),
    }).then((r) => handleJson<{ apiKey: string }>(r)),

  deleteApp: async (id: string) => {
    const r = await fetch(`${BASE}/admin/apps/${id}`, { method: 'DELETE', headers: adminHeaders() });
    if (r.status === 204) return;
    await handleJson(r);
  },

  getLogs: () => fetch(`${BASE}/admin/logs`, { headers: adminHeaders() }).then((r) => handleJson<MessageLog[]>(r)),

  /** POST /send — requiere API key de la app (no el admin secret). */
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
