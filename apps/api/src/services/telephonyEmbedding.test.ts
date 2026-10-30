import { describe, expect, it, vi } from 'vitest';
import { checkDialpadEmbedding, embeddingVerdict, readEmbeddingHeaders } from './telephonyEmbedding';

describe('telephony dialpad embedding check', () => {
  it('reports the real Bizcall frame headers and blocks an unlisted CRM origin', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('dialpad', {
      status: 200,
      headers: {
        'content-security-policy': "frame-ancestors 'self' *.salesforce.com *.force.com *.visualforce.com;",
        'x-frame-options': 'ALLOW-FROM https://*.force.com',
      },
    }));

    const result = await checkDialpadEmbedding(
      'https://bizcall.cxteletech.com/embed/dialpad',
      'http://localhost:3000',
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bizcall.cxteletech.com/embed/dialpad',
      expect.objectContaining({ method: 'GET', redirect: 'manual' }),
    );
    expect(result).toEqual({
      httpStatus: 200,
      headers: {
        xFrameOptions: 'ALLOW-FROM https://*.force.com',
        contentSecurityPolicy: "frame-ancestors 'self' *.salesforce.com *.force.com *.visualforce.com;",
        frameAncestors: "'self' *.salesforce.com *.force.com *.visualforce.com",
      },
      verdict: 'Blocked: Bizcall does not allow http://localhost:3000',
    });
  });

  it('allows a matching subdomain in frame-ancestors', () => {
    const headers = readEmbeddingHeaders(new Headers({
      'content-security-policy': "default-src 'none'; frame-ancestors *.force.com https://*.example.com",
      'x-frame-options': 'DENY',
    }));
    expect(embeddingVerdict(headers, 'https://crm.force.com', 'https://bizcall.cxteletech.com'))
      .toBe('Allowed for https://crm.force.com');
    expect(embeddingVerdict(headers, 'https://crm.example.com', 'https://bizcall.cxteletech.com'))
      .toBe('Allowed for https://crm.example.com');
  });

  it('does not follow a Bizcall redirect', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: {
        location: 'https://other.example/embed',
        'x-frame-options': 'DENY',
      },
    }));
    const result = await checkDialpadEmbedding(
      'https://bizcall.cxteletech.com/embed/dialpad',
      'https://crm.example.com',
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'manual' }));
    expect(result.verdict).toBe('Blocked: Bizcall redirected the dialpad request for https://crm.example.com');
  });
});
