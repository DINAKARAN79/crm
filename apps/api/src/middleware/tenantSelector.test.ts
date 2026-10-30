import express from 'express';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'tenant-selector-secret';

const audits = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@dct-crm/db', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === 'super-1') {
          return {
            id: 'super-1',
            email: 'super@example.test',
            tenantId: 'platform',
            isActive: true,
            isSuperAdmin: true,
            profileId: null,
            profile: null,
            tenant: { isActive: true, companyStartDate: null, companyExpiryDate: null },
          };
        }
        return {
          id: 'user-a',
          email: 'agent@example.test',
          tenantId: 'tenant-a',
          isActive: true,
          isSuperAdmin: false,
          profileId: 'profile-1',
          profile: { id: 'profile-1', name: 'Sales', isAdmin: false },
          tenant: { isActive: true, companyStartDate: null, companyExpiryDate: null },
        };
      },
    },
    userSession: { findUnique: async () => null },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => (
        where.id === 'tenant-b' || where.id === 'tenant-a' ? { id: where.id } : null
      ),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  },
}));

import { authenticate, generateToken } from './auth';

const servers: Server[] = [];

function listen(app: express.Express) {
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return address.port;
}

describe('tenantId query selector', () => {
  afterEach(() => {
    audits.splice(0, audits.length);
    for (const server of servers) server.close();
    servers.splice(0, servers.length);
  });

  it('returns 401 when tenantId is present and no credential is sent', async () => {
    const app = express();
    app.get('/api/leads', authenticate, (_req, res) => res.json({ ok: true }));
    const port = listen(app);
    const response = await fetch(`http://127.0.0.1:${port}/api/leads?tenantId=tenant-b`);
    expect(response.status).toBe(401);
    expect(audits).toEqual([]);
  });

  it('returns 403 when a company session asks for another company', async () => {
    const app = express();
    app.get('/api/leads', authenticate, (req, res) => res.json({ tenantId: (req as { tenantId?: string }).tenantId }));
    const port = listen(app);
    const token = generateToken({
      id: 'user-a',
      email: 'agent@example.test',
      tenantId: 'tenant-a',
      isSuperAdmin: false,
    });
    const mismatch = await fetch(`http://127.0.0.1:${port}/api/leads?tenantId=tenant-b`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mismatch.status).toBe(403);
    const match = await fetch(`http://127.0.0.1:${port}/api/leads?tenantId=tenant-a`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(match.status).toBe(200);
    expect(await match.json()).toEqual({ tenantId: 'tenant-a' });
    expect(audits).toEqual([]);
  });

  it('lets a superadmin read another company and writes an audit row', async () => {
    const app = express();
    app.get('/api/leads', authenticate, (req, res) => res.json({ tenantId: (req as { tenantId?: string }).tenantId }));
    const port = listen(app);
    const token = generateToken({
      id: 'super-1',
      email: 'super@example.test',
      tenantId: 'platform',
      isSuperAdmin: true,
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/leads?tenantId=tenant-b`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tenantId: 'tenant-b' });
    expect(audits).toEqual([expect.objectContaining({
      action: 'SUPERADMIN_TENANT_ACCESS',
      tenantId: 'tenant-b',
      userId: 'super-1',
      objectType: 'Tenant',
      objectId: 'tenant-b',
    })]);
  });
});
