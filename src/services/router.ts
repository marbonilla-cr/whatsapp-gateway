import type { AppRow } from '../types';
import type { Logger } from 'pino';

export async function forwardToApp(app: AppRow, payload: object, log: Logger): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(app.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-App-Id': app.id,
        'X-Gateway-Timestamp': String(Date.now()),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.error(
        { status: res.status, appId: app.id, apiKeyPrefix: app.apiKeyPrefix },
        'callback returned non-OK status'
      );
    }
  } catch (err) {
    log.error(
      { err, appId: app.id, apiKeyPrefix: app.apiKeyPrefix },
      'forward to app callback failed'
    );
  } finally {
    clearTimeout(timeout);
  }
}
