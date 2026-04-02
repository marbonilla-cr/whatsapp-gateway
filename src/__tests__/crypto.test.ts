import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  validateMetaSignature,
  hashApiKey,
  encryptToken,
  decryptToken,
  generateApiKey,
  apiKeyPrefixFromFullKey,
} from '../services/crypto';

const KEY_64_HEX = 'a'.repeat(64);

describe('crypto', () => {
  it('hashApiKey produces deterministic sha256 hex', () => {
    const h = hashApiKey('gw_testkey');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey('gw_testkey')).toBe(h);
  });

  it('encryptToken / decryptToken roundtrip', () => {
    const plain = 'EAAxxx-meta-token';
    const enc = encryptToken(plain, KEY_64_HEX);
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptToken(enc, KEY_64_HEX)).toBe(plain);
  });

  it('encryptToken rejects bad key length', () => {
    expect(() => encryptToken('x', 'abcd')).toThrow();
  });

  it('validateMetaSignature accepts valid HMAC', () => {
    const secret = 'my-meta-app-secret';
    const rawBody = Buffer.from('{"hello":"world"}');
    const sig =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(validateMetaSignature(rawBody, sig, secret)).toBe(true);
  });

  it('validateMetaSignature rejects wrong secret or tampered body', () => {
    const rawBody = Buffer.from('{"a":1}');
    const sig =
      'sha256=' + crypto.createHmac('sha256', 'good').update(rawBody).digest('hex');
    expect(validateMetaSignature(rawBody, sig, 'bad')).toBe(false);
    expect(validateMetaSignature(Buffer.from('{"a":2}'), sig, 'good')).toBe(false);
  });

  it('generateApiKey has gw_ prefix and apiKeyPrefixFromFullKey', () => {
    const k = generateApiKey();
    expect(k.startsWith('gw_')).toBe(true);
    expect(k.length).toBeGreaterThan(10);
    const p = apiKeyPrefixFromFullKey(k);
    expect(p.length).toBe(8);
  });
});
