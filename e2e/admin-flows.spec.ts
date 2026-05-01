import { test, expect } from '@playwright/test';
import { loginJson } from './helpers/auth';
import { skipIfNoGateway } from './helpers/skipIfNoGateway';

const superEmail = process.env.E2E_SUPER_EMAIL;
const superPassword = process.env.E2E_SUPER_PASSWORD;
const tenantAdminEmail = process.env.E2E_TENANT_ADMIN_EMAIL;
const tenantAdminPassword = process.env.E2E_TENANT_ADMIN_PASSWORD;

test.describe('Admin flows', () => {
  test.beforeEach(async ({ request }) => {
    await skipIfNoGateway(test, request);
  });

  test('wizard provisioning is reachable for tenant admin', async ({ page }) => {
    test.skip(
      !tenantAdminEmail || !tenantAdminPassword,
      'Set E2E_TENANT_ADMIN_EMAIL and E2E_TENANT_ADMIN_PASSWORD for a tenant_admin in the target DB.'
    );
    await page.goto('/login');
    await page.locator('#email').fill(tenantAdminEmail!);
    await page.locator('#password').fill(tenantAdminPassword!);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/dashboard/provision');
    await expect(page.getByRole('heading', { name: /Provisioning de número/i })).toBeVisible();
    await expect(page.getByText(/Método/i).first()).toBeVisible();
  });

  test('template editor renders preview correctly', async ({ page, request }) => {
    test.skip(
      !tenantAdminEmail || !tenantAdminPassword,
      'Set E2E_TENANT_ADMIN_EMAIL and E2E_TENANT_ADMIN_PASSWORD for a tenant_admin with at least one WABA.'
    );
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const login = await loginJson(request, base, tenantAdminEmail!, tenantAdminPassword!);
    const wabaRes = await request.get(`${base}/admin/v2/tenants/${login.user.tenantId}/wabas`, {
      headers: { Authorization: `Bearer ${login.access}` },
    });
    const wabas = (await wabaRes.json()) as unknown[];
    test.skip(wabas.length === 0, 'Tenant has no WABAs; add one before running this test.');

    await page.goto('/login');
    await page.locator('#email').fill(tenantAdminEmail!);
    await page.locator('#password').fill(tenantAdminPassword!);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await page.goto('/dashboard/templates');
    await page.getByRole('button', { name: /Nuevo template/i }).click();
    await page.locator('#tpl-name').fill('e2e_tpl_preview');
    await page.locator('form#template-editor-form textarea').first().fill('Hola {{1}}, bienvenido.');
    await expect(page.getByText(/Vista previa en vivo/i)).toBeVisible();
    await expect(page.getByText(/bienvenido/i).first()).toBeVisible();
  });

  test('audit log is visible for tenant admin', async ({ page }) => {
    test.skip(
      !tenantAdminEmail || !tenantAdminPassword,
      'Set E2E_TENANT_ADMIN_EMAIL and E2E_TENANT_ADMIN_PASSWORD.'
    );
    await page.goto('/login');
    await page.locator('#email').fill(tenantAdminEmail!);
    await page.locator('#password').fill(tenantAdminPassword!);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await page.goto('/dashboard/audit');
    await expect(page.getByRole('heading', { name: /Auditoría/i })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('super admin receives audit rows via API', async ({ request }) => {
    test.skip(!superEmail || !superPassword, 'Set E2E_SUPER_EMAIL and E2E_SUPER_PASSWORD.');
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const { access } = await loginJson(request, base, superEmail!, superPassword!);
    const res = await request.get(`${base}/admin/v2/audit-log?limit=10`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('tenant cannot access another tenant data via direct URL', async ({ page, request }) => {
    test.skip(
      !superEmail || !superPassword,
      'Set E2E_SUPER_EMAIL and E2E_SUPER_PASSWORD to create two tenants for isolation check.'
    );
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const { access: superAccess } = await loginJson(request, base, superEmail!, superPassword!);
    const stamp = Date.now();

    const t1 = await request.post(`${base}/admin/v2/tenants`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAccess}`,
      },
      data: {
        businessName: `Iso A ${stamp}`,
        contactEmail: `iso-a-${stamp}@example.invalid`,
        countryCode: 'CR',
      },
    });
    const t2 = await request.post(`${base}/admin/v2/tenants`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAccess}`,
      },
      data: {
        businessName: `Iso B ${stamp}`,
        contactEmail: `iso-b-${stamp}@example.invalid`,
        countryCode: 'CR',
      },
    });
    expect(t1.ok() && t2.ok()).toBeTruthy();
    const tenantA = (await t1.json()) as { id: string };
    const tenantB = (await t2.json()) as { id: string };

    const pwd = 'IsolationTest!9z';
    await request.post(`${base}/admin/v2/tenants/${tenantA.id}/users`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAccess}`,
      },
      data: { email: `iso-a-admin-${stamp}@example.invalid`, password: pwd, role: 'tenant_admin' },
    });

    const tenantLogin = await loginJson(request, base, `iso-a-admin-${stamp}@example.invalid`, pwd);

    const cross = await request.get(`${base}/admin/v2/tenants/${tenantB.id}/apps`, {
      headers: { Authorization: `Bearer ${tenantLogin.access}` },
    });
    expect(cross.status()).toBe(403);

    await page.goto('/login');
    await page.locator('#email').fill(`iso-a-admin-${stamp}@example.invalid`);
    await page.locator('#password').fill(pwd);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
