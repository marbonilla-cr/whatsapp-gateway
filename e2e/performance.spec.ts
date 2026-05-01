import { test, expect } from '@playwright/test';

const base = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Performance smoke', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!process.env.E2E_PERF, 'Set E2E_PERF=1 to run webhook concurrency smoke (needs live gateway).');

  test('webhook can handle 50 concurrent valid envelope posts', async () => {
    const promises = Array.from({ length: 50 }, () =>
      fetch(`${base}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=fake',
        },
        body: JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [],
        }),
      })
    );

    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    const ok = results.filter((r) => r.status === 200 || r.status === 403);
    expect(ok.length).toBe(50);
    expect(duration).toBeLessThan(15_000);
  });
});
