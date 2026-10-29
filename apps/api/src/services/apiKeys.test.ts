import { describe, expect, it } from 'vitest';
import {
  consumeApiKeyRateLimit,
  hashApiKey,
  requiredScopeForRequest,
  resetApiKeyRateLimits,
  scopeAllows,
} from './apiKeys';

describe('company API key scopes', () => {
  it('maps CRM routes to scopes and lets write include read', () => {
    expect(requiredScopeForRequest('GET', '/api/leads?tenantId=other')).toBe('leads:read');
    expect(requiredScopeForRequest('POST', '/api/leads')).toBe('leads:write');
    expect(requiredScopeForRequest('GET', '/api/call-details/abc')).toBe('call-details:write');
    expect(requiredScopeForRequest('POST', '/api/follow-ups')).toBe('follow-ups:write');
    expect(requiredScopeForRequest('GET', '/api/site-visits/abc')).toBe('site-visits:read');
    expect(requiredScopeForRequest('GET', '/api/super-admin/companies')).toBeNull();
    expect(scopeAllows(['leads:write'], 'leads:read')).toBe(true);
    expect(scopeAllows(['leads:read'], 'leads:write')).toBe(false);
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
});
