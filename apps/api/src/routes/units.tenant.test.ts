import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  unitFindMany: vi.fn(),
  unitCount: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    unit: {
      findMany: database.unitFindMany,
      count: database.unitCount,
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'sales-a', tenantId: 'tenant-a', isSuperAdmin: false, profileName: 'Sales' };
    req.tenantId = 'tenant-a';
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

import unitsRouter from './units';

const servers: Server[] = [];

async function requestUnits(query: string) {
  const app = express();
  app.use('/api/units', unitsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/units${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.unitFindMany.mockResolvedValue([]);
  database.unitCount.mockResolvedValue(0);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('GET /api/units tenant scope', () => {
  it('uses the authenticated tenant and requested project when listing units', async () => {
    const response = await requestUnits('?tenantId=tenant-b&projectId=project-b&status=AVAILABLE');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: [] });
    expect(database.unitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', projectId: 'project-b', status: 'AVAILABLE' },
      }),
    );
    expect(database.unitCount).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', projectId: 'project-b', status: 'AVAILABLE' },
    });
  });
});