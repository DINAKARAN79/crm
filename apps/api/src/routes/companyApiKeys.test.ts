import express from 'express';
import type { Server } from 'http';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  getCompanyApiKey: vi.fn(),
  getSetupCompanyApiKey: vi.fn(),
  revealCompanyApiKey: vi.fn(),
  revealSetupCompanyApiKey: vi.fn(),
  generateCompanyApiKey: vi.fn(),
  rotateCompanyApiKey: vi.fn(),
  revokeCompanyApiKey: vi.fn(),
  updateCompanyApiKeyScopes: vi.fn(),
}));

type TestUser = {
  id: string;
  email: string;
  tenantId: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  impersonatedBy?: string;
};

type TestRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: TestUser;
  tenantId?: string;
  impersonation?: { superadminId: string };
  apiKey?: { id: string; tenantId: string; scopes: string[] };
};

vi.mock('@dct-crm/db', () => ({
  prisma: {
    tenant: { findUnique: database.tenantFindUnique },
    user: { findUnique: database.userFindUnique },
    auditLog: { create: database.auditCreate },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: TestRequest, _res: object, next: () => void) => {
    const user = String(req.headers['x-test-user'] || '');
    req.user = user === 'admin-a'
      ? { id: 'admin-a', email: 'admin@example.com', tenantId: 'tenant-a', isSuperAdmin: false, isAdmin: true }
      : user === 'member-a'
        ? { id: 'member-a', email: 'member@example.com', tenantId: 'tenant-a', isSuperAdmin: false, isAdmin: false }
        : user === 'api-key'
          ? { id: 'key-actor', email: 'api-key', tenantId: 'tenant-a', isSuperAdmin: false, isAdmin: true }
          : user === 'impersonated-admin'
            ? { id: 'admin-a', email: 'admin@example.com', tenantId: 'tenant-a', isSuperAdmin: false, isAdmin: true, impersonatedBy: 'super-a' }
          : { id: 'super-a', email: 'super@example.com', tenantId: 'platform', isSuperAdmin: true, isAdmin: false };
    if (user === 'impersonated-admin') req.impersonation = { superadminId: 'super-a' };
    if (user === 'api-key') req.apiKey = { id: 'key-actor', tenantId: 'tenant-a', scopes: ['leads:read'] };
    req.tenantId = req.user.tenantId;
    next();
  },
}));

vi.mock('../services/apiKeys', () => {
  class ApiKeyAuthError extends Error {
    constructor(public status: number, message: string, public code = 'API_KEY_INVALID') {
      super(message);
    }
  }
  class ApiKeyEncryptionError extends Error {}
  return {
    ApiKeyAuthError,
    ApiKeyEncryptionError,
    DELETE_API_SCOPES: ['leads:delete'],
    generateCompanyApiKey: database.generateCompanyApiKey,
    getCompanyApiKey: database.getCompanyApiKey,
    getSetupCompanyApiKey: database.getSetupCompanyApiKey,
    revealCompanyApiKey: database.revealCompanyApiKey,
    revealSetupCompanyApiKey: database.revealSetupCompanyApiKey,
    revokeCompanyApiKey: database.revokeCompanyApiKey,
    rotateCompanyApiKey: database.rotateCompanyApiKey,
    updateCompanyApiKeyScopes: database.updateCompanyApiKeyScopes,
  };
});

import companyApiKeyRouter, { setupCompanyApiKeyRouter } from './companyApiKeys';

const servers: Server[] = [];

function listen() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/companies/:tenantId/api-key', companyApiKeyRouter);
  app.use('/api/setup', setupCompanyApiKeyRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return address.port;
}

beforeEach(async () => {
  vi.clearAllMocks();
  database.tenantFindUnique.mockResolvedValue({ name: 'Test Company' });
  database.userFindUnique.mockResolvedValue({
    passwordHash: await bcrypt.hash('super-password', 4),
    isSuperAdmin: true,
    isActive: true,
  });
  database.auditCreate.mockResolvedValue({});
  database.getCompanyApiKey.mockResolvedValue({
    company: { id: 'tenant-a', name: 'Test Company', companyCode: 'TEST' },
    apiKey: { id: 'key-1', keyPrefix: 'dct_live_12345678', status: 'active', scopes: ['leads:read'], createdAt: new Date(), lastUsedAt: null },
  });
  database.getSetupCompanyApiKey.mockResolvedValue({
    company: { id: 'tenant-a', name: 'Test Company', companyCode: 'TEST' },
    apiKey: { id: 'key-1', keyPrefix: 'dct_live_12345678', status: 'active', createdAt: new Date(), lastUsedAt: null },
    canRevealOnce: true,
  });
  database.revealCompanyApiKey.mockResolvedValue({
    record: { id: 'key-1', keyPrefix: 'dct_live_12345678', scopes: ['leads:read'] },
    apiKey: 'dct_live_12345678_secret',
  });
  database.revealSetupCompanyApiKey.mockResolvedValue({
    record: { id: 'key-1', keyPrefix: 'dct_live_12345678', status: 'active' },
    apiKey: 'dct_live_12345678_secret',
  });
  database.generateCompanyApiKey.mockResolvedValue({
    record: { id: 'key-2', keyPrefix: 'dct_live_abcdefgh', status: 'active' },
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('company API key access', () => {
  it('lets Super Admin reveal repeatedly only after password re-entry and audits show/copy without the key', async () => {
    const port = listen();
    const revealUrl = `http://127.0.0.1:${port}/api/admin/companies/tenant-a/api-key/reveal`;
    const first = await fetch(revealUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-password', purpose: 'show' }),
    });
    const firstBody = await first.json() as { apiKey: string };
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toContain('no-store');
    expect(firstBody.apiKey).toBe('dct_live_12345678_secret');

    const second = await fetch(revealUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'super-password', purpose: 'copy' }),
    });
    expect(second.status).toBe(200);
    expect(database.revealCompanyApiKey).toHaveBeenCalledTimes(2);
    expect(database.auditCreate.mock.calls.map(([call]) => (call as { data: { action: string } }).data.action))
      .toEqual(['API_KEY_REVEALED', 'API_KEY_COPIED']);
    expect(JSON.stringify(database.auditCreate.mock.calls)).not.toContain('dct_live_12345678_secret');

    const badPassword = await fetch(revealUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect', purpose: 'show' }),
    });
    expect(badPassword.status).toBe(401);
  });

  it('does not expose raw or encrypted key material in metadata and limits legacy generation to metadata', async () => {
    const port = listen();
    const metadata = await fetch(`http://127.0.0.1:${port}/api/admin/companies/tenant-a/api-key`);
    const metadataBody = await metadata.json() as { data: { maskedKey: string } };
    expect(metadataBody.data.maskedKey).toBe('dct_live_••••••••');
    expect(JSON.stringify(metadataBody)).not.toMatch(/encryptedKey|keyIv|keyTag|keyHash|_secret/);

    const generated = await fetch(`http://127.0.0.1:${port}/api/admin/companies/tenant-a/api-key/generate`, { method: 'POST' });
    const generatedBody = await generated.json() as Record<string, unknown>;
    expect(generated.status).toBe(201);
    expect(generatedBody).not.toHaveProperty('apiKey');
  });

  it('denies non-admins and blocks company Admin tenant switching', async () => {
    const port = listen();
    const blocked = await fetch(`http://127.0.0.1:${port}/api/admin/companies/tenant-b/api-key`, {
      headers: { 'x-test-user': 'admin-a' },
    });
    expect(blocked.status).toBe(403);

    const noKeyPage = await fetch(`http://127.0.0.1:${port}/api/setup/api-key`, {
      headers: { 'x-test-user': 'member-a' },
    });
    expect(noKeyPage.status).toBe(403);

    const apiKeyPage = await fetch(`http://127.0.0.1:${port}/api/setup/api-key`, {
      headers: { 'x-test-user': 'api-key' },
    });
    expect(apiKeyPage.status).toBe(403);

    const superAdminPage = await fetch(`http://127.0.0.1:${port}/api/setup/api-key?tenantId=tenant-a`, {
      headers: { 'x-test-user': 'super-a' },
    });
    expect(superAdminPage.status).toBe(403);

    const impersonatedPage = await fetch(`http://127.0.0.1:${port}/api/setup/api-key`, {
      headers: { 'x-test-user': 'impersonated-admin' },
    });
    expect(impersonatedPage.status).toBe(403);

    const crossTenant = await fetch(`http://127.0.0.1:${port}/api/setup/api-key/reveal-once?tenantId=tenant-b`, {
      method: 'POST',
      headers: { 'x-test-user': 'admin-a' },
    });
    expect(crossTenant.status).toBe(403);
    expect(database.revealSetupCompanyApiKey).not.toHaveBeenCalled();
  });

  it('keeps company Admin key responses one-time and never returns encrypted fields', async () => {
    const port = listen();
    const response = await fetch(`http://127.0.0.1:${port}/api/setup/api-key/reveal-once`, {
      method: 'POST',
      headers: { 'x-test-user': 'admin-a' },
    });
    const body = await response.json() as { apiKey: string; data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.apiKey).toBe('dct_live_12345678_secret');
    expect(JSON.stringify(body.data)).not.toMatch(/encryptedKey|keyIv|keyTag|keyHash/);
    expect(database.revealSetupCompanyApiKey).toHaveBeenCalledWith('tenant-a', 'admin-a', expect.any(String));
  });
});
