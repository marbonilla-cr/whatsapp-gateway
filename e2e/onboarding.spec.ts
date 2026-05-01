import { test, expect } from '@playwright/test';
import { loginJson } from './helpers/auth';
import { skipIfNoGateway } from './helpers/skipIfNoGateway';

const superEmail = process.env.E2E_SUPER_EMAIL;
const superPassword = process.env.E2E_SUPER_PASSWORD;

test.describe('Onboarding flow', () => {
  test.beforeEach(async ({ request }) => {
    await skipIfNoGateway(test, request);
  });

  test.beforeAll(() => {
    test.skip(
      !superEmail || !superPassword,
      'Set E2E_SUPER_EMAIL and E2E_SUPER_PASSWORD with a real super_admin user in the target database (local Postgres).'
    );
  });

  test('super admin can login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(superEmail!);
    await page.locator('#password').fill(superPassword!);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/\/super/);
  });

  test('super admin can create new tenant', async ({ page, request }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const { access } = await loginJson(request, base, superEmail!, superPassword!);

    const stamp = Date.now();
    const businessName = `E2E Tenant ${stamp}`;
    const contactEmail = `e2e-tenant-${stamp}@example.invalid`;

    const meJson = await fetchMeUserJson(request, base, access);
    await page.goto('/login');
    await page.evaluate(
      ([accessToken, refresh, userJson]) => {
        const user = JSON.parse(userJson as string) as {
          id: string;
          email: string;
          tenantId: string;
          role: 'super_admin' | 'tenant_admin' | 'tenant_operator';
        };
        localStorage.setItem('wg_access_token', accessToken as string);
        localStorage.setItem('wg_refresh_token', refresh as string);
        localStorage.setItem('wg_user', JSON.stringify(user));
      },
      [access, '', meJson]
    );

    await page.goto('/super/tenants');
    await page.getByRole('button', { name: 'Nuevo tenant' }).click();
    await page.getByLabel(/Razón social/i).fill(businessName);
    await page.getByLabel(/Email de contacto/i).fill(contactEmail);
    await page.getByRole('button', { name: /crear|guardar|confirmar/i }).first().click();

    await expect(page.getByRole('cell', { name: contactEmail })).toBeVisible({ timeout: 15_000 });
  });

  test('tenant admin can login and see only their tenant data', async ({ page, request }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const { access: superAccess } = await loginJson(request, base, superEmail!, superPassword!);

    const stamp = Date.now();
    const tenantRes = await request.post(`${base}/admin/v2/tenants`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAccess}`,
      },
      data: {
        businessName: `Iso Tenant ${stamp}`,
        contactEmail: `iso-${stamp}@example.invalid`,
        countryCode: 'CR',
      },
    });
    expect(tenantRes.ok()).toBeTruthy();
    const tenant = (await tenantRes.json()) as { id: string };
    const tenantAdminEmail = `tenant-admin-${stamp}@example.invalid`;
    const tenantAdminPassword = 'E2ETenantAdmin!9z';

    const userRes = await request.post(`${base}/admin/v2/tenants/${tenant.id}/users`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAccess}`,
      },
      data: {
        email: tenantAdminEmail,
        password: tenantAdminPassword,
        role: 'tenant_admin',
      },
    });
    expect(userRes.status()).toBe(201);

    await page.goto('/login');
    await page.locator('#email').fill(tenantAdminEmail);
    await page.locator('#password').fill(tenantAdminPassword);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/super');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('embedded signup button initiates onboarding', async ({ page, request }) => {
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const { access } = await loginJson(request, base, superEmail!, superPassword!);

    const stamp = Date.now();
    const tenantRes = await request.post(`${base}/admin/v2/tenants`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access}`,
      },
      data: {
        businessName: `Embed Tenant ${stamp}`,
        contactEmail: `embed-${stamp}@example.invalid`,
        countryCode: 'CR',
      },
    });
    expect(tenantRes.ok()).toBeTruthy();
    const tenant = (await tenantRes.json()) as { id: string };

    const userRes = await request.post(`${base}/admin/v2/tenants/${tenant.id}/users`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access}`,
      },
      data: {
        email: `embed-admin-${stamp}@example.invalid`,
        password: 'EmbedAdmin!9z',
        role: 'tenant_admin',
      },
    });
    expect(userRes.status()).toBe(201);

    const tenantLogin = await loginJson(request, base, `embed-admin-${stamp}@example.invalid`, 'EmbedAdmin!9z');

    await page.route('https://connect.facebook.net/**', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.FB = { init: function () {} };
          if (typeof window.fbAsyncInit === 'function') window.fbAsyncInit();
        `,
      });
    });

    let startPayload: unknown = null;
    await page.route('**/onboard/start', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      startPayload = route.request().postDataJSON();
      await route.fulfill({
        contentType: 'application/json',
        status: 200,
        body: JSON.stringify({
          signup_url: 'https://example.invalid/meta-embedded-signup',
          state: 'e2e-state',
          session_id: 'e2e-session',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
      });
    });

    await page.goto('/login');
    await page.evaluate(
      ([a, r, u]) => {
        const userParsed = JSON.parse(u as string) as {
          id: string;
          email: string;
          tenantId: string;
          role: 'super_admin' | 'tenant_admin' | 'tenant_operator';
        };
        localStorage.setItem('wg_access_token', a as string);
        localStorage.setItem('wg_refresh_token', r as string);
        localStorage.setItem('wg_user', JSON.stringify(userParsed));
      },
      [tenantLogin.access, tenantLogin.refresh, JSON.stringify(tenantLogin.user)]
    );

    await page.goto('/dashboard/onboard');
    await page.getByRole('button', { name: /Connect WhatsApp Account/i }).click();
    await expect.poll(() => startPayload !== null).toBeTruthy();
    const body = startPayload as { tenant_id?: string; redirect_uri?: string };
    expect(body.tenant_id).toBe(tenant.id);
    expect(String(body.redirect_uri ?? '')).toContain('/onboard/callback');
  });
});

async function fetchMeUserJson(request: import('@playwright/test').APIRequestContext, base: string, access: string): Promise<string> {
  const me = await request.get(`${base}/admin/v2/me`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const u = (await me.json()) as {
    id: string;
    email: string;
    tenantId: string;
    role: string;
  };
  return JSON.stringify({
    id: u.id,
    email: u.email,
    tenantId: u.tenantId,
    role: u.role as 'super_admin' | 'tenant_admin' | 'tenant_operator',
  });
}
