import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('API proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards session and GRE authentication headers to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost/api/proxy/api/gre/public/form/submit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gre-session': 'gre-session-token',
        'x-session-auth': 'required',
        authorization: 'Bearer crm-session-token',
      },
      body: JSON.stringify({ draft: {} }),
    });

    await POST(request, {
      params: { path: ['api', 'gre', 'public', 'form', 'submit'] },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/gre/public/form/submit',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-gre-session': 'gre-session-token',
          'x-session-auth': 'required',
          authorization: 'Bearer crm-session-token',
        }),
      }),
    );
  });
});