import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  apiKeyFindMany: vi.fn(),
  apiKeyFindFirst: vi.fn(),
  apiKeyFindUnique: vi.fn(),
  apiKeyCreate: vi.fn(),
  apiKeyUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    apiKey: {
      findMany: database.apiKeyFindMany,
      findFirst: database.apiKeyFindFirst,
      findUnique: database.apiKeyFindUnique,
      create: database.apiKeyCreate,
      update: database.apiKeyUpdate,
    },
    tenant: { findUnique: database.tenantFindUnique },
    user: { findUnique: database.userFindUnique },
    auditLog: { create: database.auditCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = req.headers['x-test-user'] === 'member'
      ? { id: 'user-a', email: 'user@example.com', tenantId: 'tenant-a', isSuperAdmin: false }
      : { id: 'super-a', email: 'super@example.com', tenantId: 'platform', isSuperAdmin: true };
    req.tenantId = req.user.tenantId;
    next();
  },
}));

import companyApiKeyRouter from './companyApiKeys';
import { resetApiKeyRateLimits } from '../services/apiKeys';

const servers: Server[] = [];

function listen(app: express.Express) {
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return address.port;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetApiKeyRateLimits();
  database.tenantFindUnique.mockResolvedValue({ id: 'tenant-a', isActive: true, companyStartDate: null, companyExpiryDate: null });
  database.auditCreate.mockResolvedValue({});
  database.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    apiKey: { update: database.apiKeyUpdate, create: database.apiKeyCreate },
  }));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('company API key management', () => {
  it('creates a key once, lists it without the secret, and blocks a non-superadmin', async () => {
    database.apiKeyCreate.mockImplementation(async ({ data }: { data: { keyPrefix: string; scopes: string[] } }) => ({
      id: 'key-1',
      name: 'Website',
      keyPrefix: data.keyPrefix,
      scopes: data.scopes,
      rateLimitPerMinute: 120,
      ipAllowlist: [],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-10-28T00:00:00.000Z'),
    }));
    const app = express();
    app.use(express.json());
    app.use('/api/super-admin/companies/:tenantId/api-keys', companyApiKeyRouter);
    const port = listen(app);

    const created = await fetch(`http://127.0.0.1:${port}/api/super-admin/companies/tenant-a/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Website', scopes: ['leads:read'] }),
    });
    const createdBody = await created.json();
    expect(created.status).toBe(201);
    expect(createdBody.apiKey).toMatch(/^dct_/);
    expect(createdBody.data.keyPrefix).toBe(createdBody.apiKey.slice(0, 12));
    expect(createdBody.data.keyHash).toBeUndefined();
    expect(database.auditCreate).toHaveBeenCalled();

    database.apiKeyFindMany.mockResolvedValue([{ ...createdBody.data, keyHash: 'hidden' }]);
    const listed = await fetch(`http://127.0.0.1:${port}/api/super-admin/companies/tenant-a/api-keys`);
    const listedBody = await listed.json();
    expect(listedBody.data[0].keyHash).toBeUndefined();
    expect(JSON.stringify(listedBody)).not.toContain(createdBody.apiKey);

    const forbidden = await fetch(`http://127.0.0.1:${port}/api/super-admin/companies/tenant-a/api-keys`, {
      headers: { 'x-test-user': 'member' },
    });
    expect(forbidden.status).toBe(403);
  });
});
