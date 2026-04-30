const ACCESS = 'wg_access_token';
const REFRESH = 'wg_refresh_token';
const USER = 'wg_user';

export type AuthUser = {
  id: string;
  email: string;
  tenantId: string;
  role: 'super_admin' | 'tenant_admin' | 'tenant_operator';
};

function gatewayBase(): string {
  return (import.meta.env.VITE_GATEWAY_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    if (!u?.id || !u.role || !u.tenantId) return null;
    return u;
  } catch {
    return null;
  }
}

export function setSession(access: string, refresh: string, user: AuthUser): void {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
  localStorage.setItem(USER, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(USER);
}

export async function refreshAccessToken(): Promise<string | null> {
  const base = gatewayBase();
  const refresh = getRefreshToken();
  if (!base || !refresh) return null;
  const r = await fetch(`${base}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) {
    clearSession();
    return null;
  }
  const data = (await r.json()) as { access?: string };
  if (!data.access) {
    clearSession();
    return null;
  }
  localStorage.setItem(ACCESS, data.access);
  return data.access;
}

export async function loginRequest(email: string, password: string): Promise<{
  access: string;
  refresh: string;
  user: AuthUser;
}> {
  const base = gatewayBase();
  if (!base) throw new Error('Configurá VITE_GATEWAY_URL');
  const r = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const err = data as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? 'Login falló');
  }
  const body = data as { access: string; refresh: string; user: AuthUser };
  return body;
}
