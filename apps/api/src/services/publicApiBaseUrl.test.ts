import { describe, expect, it, vi } from 'vitest';
import { PRIVATE_API_URL_WARNING, getPublicApiBaseUrl, probeOwnApiHealth } from './publicApiBaseUrl';

describe('public API base URL', () => {
  it('uses PUBLIC_API_BASE_URL and drops any path', () => {
    const resolved = getPublicApiBaseUrl({
      nodeEnv: 'production',
      publicBaseUrl: 'https://api.yourdomain.com/ignored',
      host: 'evil.example',
      protocol: 'http',
      forwardedHost: 'also-evil.example',
      forwardedProto: 'http',
      trustProxy: true,
    });
    expect(resolved).toMatchObject({
      baseUrl: 'https://api.yourdomain.com',
      source: 'env',
      privateHost: false,
      warning: null,
    });
    expect(resolved.baseUrl).not.toContain('evil.example');
  });

  it('uses forwarded host and proto behind a trusted proxy and omits port 443', () => {
    const resolved = getPublicApiBaseUrl({
      nodeEnv: 'production',
      allowedHosts: 'api.example.com',
      trustProxy: true,
      protocol: 'http',
      host: 'localhost:3001',
      forwardedProto: 'https,http',
      forwardedHost: 'api.example.com:443',
    });
    expect(resolved).toMatchObject({
      baseUrl: 'https://api.example.com',
      source: 'request',
      privateHost: false,
      warning: null,
    });
    expect(resolved.baseUrl).not.toContain(':443');
    expect(resolved.baseUrl).not.toContain('localhost');
  });

  it('detects a direct localhost request and shows the external warning', () => {
    const resolved = getPublicApiBaseUrl({
      nodeEnv: 'development',
      trustProxy: false,
      protocol: 'http',
      host: 'localhost:3001',
      forwardedHost: 'api.example.com',
      forwardedProto: 'https',
    });
    expect(resolved).toMatchObject({
      baseUrl: 'http://localhost:3001',
      source: 'request',
      privateHost: true,
      warning: PRIVATE_API_URL_WARNING,
    });
    expect(resolved.baseUrl).not.toContain('api.example.com');
  });

  it('never puts a spoofed production host into the URL', () => {
    const resolved = getPublicApiBaseUrl({
      nodeEnv: 'production',
      trustProxy: false,
      protocol: 'https',
      host: 'evil.example',
      forwardedHost: 'evil.example',
      forwardedProto: 'https',
    });
    expect(resolved.baseUrl).toBe('');
    expect(resolved.source).toBe('rejected');
    expect(JSON.stringify(resolved)).not.toContain('evil.example');
  });

  it('probes only this API health route on the resolved host', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });
    const result = await probeOwnApiHealth('https://api.example.com', fetchImpl);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.example.com/api/health');
    const refused = await probeOwnApiHealth('', fetchImpl);
    expect(refused.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
