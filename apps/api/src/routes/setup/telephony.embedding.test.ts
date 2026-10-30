import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  isAdmin: false,
  findSettings: vi.fn(),
  checkEmbedding: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: { telephonySetting: { findUnique: routeMocks.findSettings } },
}));
vi.mock('../../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, {
      user: { id: 'user-1', isAdmin: routeMocks.isAdmin, isSuperAdmin: false },
      tenantId: 'tenant-1',
    });
    next();
  },
}));
vi.mock('../../middleware/audit', () => ({ auditLog: vi.fn() }));
vi.mock('../../services/clickToCall', () => ({
  probeTelephonyConnection: vi.fn(),
  buildClickToCallPayload: vi.fn(),
}));
vi.mock('../../services/telephonyCredentials', () => ({
  TelephonyCredentialError: class TelephonyCredentialError extends Error {},
  decryptTelephonyToken: vi.fn(),
}));
vi.mock('../../services/telephonyUrl', () => ({
  TelephonyUrlError: class TelephonyUrlError extends Error {},
  assertClickToCallUrl: vi.fn(),
}));
vi.mock('../../services/telephonySettings', () => ({
  getTelephonySettings: vi.fn(),
  listTelephonyRequestLogs: vi.fn(),
  saveTelephonySettings: vi.fn(),
  telephonySettingsSchema: { parse: vi.fn() },
}));
vi.mock('../../services/effectivePermissions', () => ({ EffectivePermissionService: {} }));
vi.mock('../../services/leadDuplicateDetection', () => ({ normalizeLeadPhone: vi.fn() }));
vi.mock('../../services/telephonyEmbedding', () => ({ checkDialpadEmbedding: routeMocks.checkEmbedding }));

import telephonySetupRouter from './telephony';

const servers: Server[] = [];

afterEach(async () => {
  routeMocks.isAdmin = false;
  routeMocks.findSettings.mockReset();
  routeMocks.checkEmbedding.mockReset();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('POST /api/setup/telephony/check-embedding authorization', () => {
  async function postEmbeddingCheck() {
    const app = express();
    app.use(express.json());
    app.use('/api/setup/telephony', telephonySetupRouter);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');

    return fetch(`http://127.0.0.1:${address.port}/api/setup/telephony/check-embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'https://crm.example.com' }),
    });
  }

  it('returns 403 for non-admin users', async () => {
    const response = await postEmbeddingCheck();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NO_PERMISSION' });
  });

  it('returns the headers and verdict from the server-side fetch', async () => {
    routeMocks.isAdmin = true;
    routeMocks.findSettings.mockResolvedValue({ dialpadUrl: 'https://bizcall.cxteletech.com/embed/dialpad' });
    routeMocks.checkEmbedding.mockResolvedValue({
      httpStatus: 200,
      headers: {
        xFrameOptions: 'DENY',
        contentSecurityPolicy: "frame-ancestors 'self'",
        frameAncestors: "'self'",
      },
      verdict: 'Blocked: Bizcall does not allow https://crm.example.com',
    });

    const response = await postEmbeddingCheck();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { headers: { xFrameOptions: 'DENY' }, verdict: 'Blocked: Bizcall does not allow https://crm.example.com' } });
    expect(routeMocks.checkEmbedding).toHaveBeenCalledWith(
      'https://bizcall.cxteletech.com/embed/dialpad',
      'https://crm.example.com',
    );
  });
});
