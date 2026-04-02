import type { MetaMessagePayload } from '../types';
import { MetaApiError } from '../types';

export const META_API_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export async function sendMessage(
  phoneNumberId: string,
  accessToken: string,
  payload: MetaMessagePayload
): Promise<{ messageId: string }> {
  const url = `${META_GRAPH_BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      typeof body.error === 'object' &&
      body.error !== null &&
      'message' in body.error &&
      typeof (body.error as { message?: string }).message === 'string'
        ? (body.error as { message: string }).message
        : `Meta API error (${res.status})`;
    throw new MetaApiError(errMsg, res.status, body);
  }
  const messages = body.messages as { id?: string }[] | undefined;
  const messageId = messages?.[0]?.id;
  if (!messageId) {
    throw new MetaApiError('Meta response missing message id', 502, body);
  }
  return { messageId };
}
