import crypto from 'node:crypto';

export function validateMetaSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature.startsWith('sha256=')) {
    return false;
  }
  const receivedHex = signature.slice(7);
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(receivedHex, 'hex');
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

function getKeyBuffer(keyHex: string): Buffer {
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) {
    throw new Error('GATEWAY_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return buf;
}

/** AES-256-GCM: iv:authTag:ciphertext (each segment base64url-safe via standard base64) */
export function encryptToken(plaintext: string, key: string): string {
  const keyBuf = getKeyBuffer(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptToken(encrypted: string, key: string): string {
  const keyBuf = getKeyBuffer(key);
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/** ~12 chars, URL-safe (replaces nanoid(12)). */
export function randomId12(): string {
  return crypto.randomBytes(9).toString('base64url');
}

/** ~16 chars, URL-safe (replaces nanoid(16)). */
export function randomId16(): string {
  return crypto.randomBytes(12).toString('base64url');
}

export function generateApiKey(): string {
  return `gw_${crypto.randomBytes(24).toString('base64url')}`;
}

export function apiKeyPrefixFromFullKey(apiKey: string): string {
  const without = apiKey.startsWith('gw_') ? apiKey.slice(3) : apiKey;
  return without.slice(0, 8);
}
