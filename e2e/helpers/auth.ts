import type { APIRequestContext } from '@playwright/test';

type LoginUser = {
  id: string;
  email: string;
  tenantId: string;
  role: 'super_admin' | 'tenant_admin' | 'tenant_operator';
};

type LoginResponse = {
  access: string;
  refresh: string;
  user: LoginUser;
};

export async function loginJson(
  request: APIRequestContext,
  baseURL: string,
  email: string,
  password: string
): Promise<LoginResponse> {
  const res = await request.post(`${baseURL}/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Login failed ${res.status()}: ${text}`);
  }
  return (await res.json()) as LoginResponse;
}

export function seedSession(access: string, refresh: string, user: LoginUser): void {
  localStorage.setItem('wg_access_token', access);
  localStorage.setItem('wg_refresh_token', refresh);
  localStorage.setItem('wg_user', JSON.stringify(user));
}
