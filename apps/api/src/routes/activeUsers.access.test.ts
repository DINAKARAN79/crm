import express from 'express';
import type { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'active-users-access-secret';

vi.mock('@dct-crm/db', () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'agent@example.test',
        tenantId: 'tenant-1',
        isActive: true,
        isSuperAdmin: false,
        profileId: 'profile-1',
        profile: { id: 'profile-1', name: 'Presales', isAdmin: false },
        tenant: { isActive: true, companyStartDate: null, companyExpiryDate: null },
      }),
    },
    userSession: { findUnique: async () => null },
    tenant: { findUnique: async () => ({ id: 'tenant-1' }) },
  },
}));

import { generateToken } from '../middleware/auth';
import activeUsersRouter from './activeUsers';

const servers: Server[] = [];

function listen(app: express.Express) {
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return address.port;
}

describe('active users access', () => {
  afterEach(() => {
    for (const server of servers) server.close();
    servers.splice(0, servers.length);
  });

  it('returns 403 for a non-admin on the count and the stream', async () => {
    const app = express();
    app.use('/api/admin', activeUsersRouter);
    const port = listen(app);
    const token = generateToken({
      id: 'user-1',
      email: 'agent@example.test',
      tenantId: 'tenant-1',
      isSuperAdmin: false,
    });
    const headers = { Authorization: `Bearer ${token}` };
    const count = await fetch(`http://127.0.0.1:${port}/api/admin/active-users`, { headers });
    expect(count.status).toBe(403);
    const stream = await fetch(`http://127.0.0.1:${port}/api/admin/active-users/stream`, { headers });
    expect(stream.status).toBe(403);
  });
});
