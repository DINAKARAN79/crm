import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './index';

const servers: Array<ReturnType<ReturnType<typeof createApp>['listen']>> = [];

afterEach(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })),
  );
  servers.length = 0;
});

describe('api app', () => {
  it('serves a root route', async () => {
    const app = createApp();
    const server = app.listen(0);
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'DCT CRM API',
    });
  });

  it.each(['/api/contacts', '/api/accounts', '/api/customers', '/api/workflows'])(
    'does not register the retired route %s',
    async (route) => {
      const app = createApp();
      const server = app.listen(0);
      servers.push(server);

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}${route}`);

      expect(response.status).toBe(404);
    },
  );
});
