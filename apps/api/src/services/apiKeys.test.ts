import { describe, expect, it } from 'vitest';
import {
  consumeApiKeyRateLimit,
  decryptApiKey,
  ApiKeyEncryptionError,
  hashApiKey,
  issueDefaultApiKey,
  requiredScopeForRequest,
  resetApiKeyRateLimits,
  scopeAllows,
} from './apiKeys';

describe('company API key scopes', () => {
  it('maps CRM routes to scopes and lets write include read', () => {
    expect(requiredScopeForRequest('GET', '/api/leads?tenantId=other')).toBe('leads:read');
    expect(requiredScopeForRequest('POST', '/api/leads')).toBe('leads:write');
    expect(requiredScopeForRequest('GET', '/api/call-details/abc')).toBe('call-details:read');
    expect(requiredScopeForRequest('DELETE', '/api/leads/abc')).toBe('leads:delete');
    expect(requiredScopeForRequest('GET', '/api/projects')).toBe('projects:read');
    expect(requiredScopeForRequest('POST', '/api/follow-ups')).toBe('follow-ups:write');
    expect(requiredScopeForRequest('GET', '/api/site-visits/abc')).toBe('site-visits:read');
    expect(requiredScopeForRequest('GET', '/api/super-admin/companies')).toBeNull();
    expect(scopeAllows(['leads:write'], 'leads:read')).toBe(true);
    expect(scopeAllows(['leads:read'], 'leads:write')).toBe(false);
    expect(scopeAllows(['leads:write'], 'leads:delete')).toBe(false);
    expect(scopeAllows(['leads:delete'], 'leads:delete')).toBe(true);
    expect(scopeAllows(['site-visits:read'], 'leads:read')).toBe(false);
  });

  it('hashes the key and enforces the per-key limit', () => {
    expect(hashApiKey('dct_secret')).toHaveLength(64);
    expect(hashApiKey('dct_secret')).toBe(hashApiKey('dct_secret'));
    resetApiKeyRateLimits();
    expect(consumeApiKeyRateLimit('key-a', 2, 1_000)).toBe(true);
    expect(consumeApiKeyRateLimit('key-a', 2, 1_100)).toBe(true);
    expect(consumeApiKeyRateLimit('key-a', 2, 1_200)).toBe(false);
    expect(consumeApiKeyRateLimit('key-b', 2, 1_200)).toBe(true);
    expect(consumeApiKeyRateLimit('key-a', 2, 62_000)).toBe(true);
  });

  it('encrypts each issued key with AES-GCM while exposing only the hash and prefix', async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 7).toString('base64');
    let stored: Record<string, unknown> | undefined;
    const tx = {
      apiKey: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          stored = {
            id: 'key-1',
            ...data,
            lastUsedAt: null,
            expiresAt: null,
            graceUntil: null,
            revokedAt: null,
            createdAt: new Date('2026-10-30T00:00:00.000Z'),
          };
          return stored;
        },
      },
    };
    const issued = await issueDefaultApiKey(tx as never, 'tenant-a', 'admin-a');
    expect(stored).toBeDefined();
    expect(stored!.keyHash).toBe(hashApiKey(issued.apiKey));
    expect(stored!.encryptedKey).not.toContain(issued.apiKey);
    expect(Buffer.from(String(stored!.keyIv), 'base64')).toHaveLength(12);
    expect(Buffer.from(String(stored!.keyTag), 'base64')).toHaveLength(16);
    expect(stored!.encryptionKeyVersion).toBe(1);
    const encryptedRecord = {
      encryptedKey: String(stored!.encryptedKey),
      keyIv: String(stored!.keyIv),
      keyTag: String(stored!.keyTag),
      encryptionKeyVersion: Number(stored!.encryptionKeyVersion),
    };
    expect(decryptApiKey(encryptedRecord)).toBe(issued.apiKey);
    expect(JSON.stringify(issued.record)).not.toMatch(/encryptedKey|keyIv|keyTag|keyHash|_secret/);

    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 8).toString('base64');
    expect(() => decryptApiKey(encryptedRecord)).toThrow(ApiKeyEncryptionError);
    expect(() => decryptApiKey(encryptedRecord)).not.toThrow(issued.apiKey);
  });

  it('rejects a missing or invalid encryption master secret', async () => {
    process.env.API_KEY_ENCRYPTION_SECRET = '';
    const tx = { apiKey: { create: async () => { throw new Error('must not create'); } } };
    await expect(issueDefaultApiKey(tx as never, 'tenant-a', 'admin-a')).rejects.toThrow(ApiKeyEncryptionError);
    process.env.API_KEY_ENCRYPTION_SECRET = 'not-base64';
    await expect(issueDefaultApiKey(tx as never, 'tenant-a', 'admin-a')).rejects.toThrow(ApiKeyEncryptionError);
  });
});
