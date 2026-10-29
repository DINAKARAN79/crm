import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  projectCount: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    project: {
      findMany: database.projectFindMany,
      count: database.projectCount,
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'svc-a', tenantId: 'tenant-a', isSuperAdmin: false };
    req.tenantId = 'tenant-a';
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

import projectsRouter from './projects';

const servers: Server[] = [];

async function requestProjects(query: string) {
  const app = express();
  app.use('/api/projects', projectsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/projects${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('GET /api/projects tenant scope', () => {
  it('filters active project options by the authenticated tenant, not a browser tenantId', async () => {
    const project = { id: 'project-a', tenantId: 'tenant-a', name: 'North Tower', isActive: true };
    database.projectFindMany.mockResolvedValue([project]);
    database.projectCount.mockResolvedValue(1);

    const response = await requestProjects('?tenantId=tenant-b&isActive=true');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: [project] });
    expect(database.projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a', isActive: true } }),
    );
    expect(database.projectCount).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', isActive: true },
    });
  });

  it('rejects malformed active filters instead of returning a misleading empty list', async () => {
    const response = await requestProjects('?isActive=maybe');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Invalid project active filter' });
    expect(database.projectFindMany).not.toHaveBeenCalled();
  });
});