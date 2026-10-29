import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  objectFindFirst: vi.fn(),
  layoutUpdate: vi.fn(),
}));

const metadata = vi.hoisted(() => ({
  getAllFieldDefinitions: vi.fn(),
  getPageLayout: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    objectDefinition: { findFirst: database.objectFindFirst },
    pageLayout: { update: database.layoutUpdate },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-a' };
    req.tenantId = 'tenant-a';
    next();
  },
}));

vi.mock('../middleware/permissions', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/metadata', () => metadata);

import { pageLayoutRoutes } from './pageLayouts';

const servers: Server[] = [];

async function getDefaultLeadLayout() {
  const app = express();
  app.use(express.json());
  app.use('/api/layouts', pageLayoutRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/layouts/Lead/default`);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.objectFindFirst.mockResolvedValue({ id: 'lead-object-a', name: 'Lead' });
  metadata.getAllFieldDefinitions.mockResolvedValue([
    { name: 'firstName', isActive: true, visible: true },
    { name: 'company', isActive: true, visible: true },
  ]);
  database.layoutUpdate.mockImplementation(({ data }: { data: { sections: string } }) => ({
    id: 'lead-layout-a',
    sections: data.sections,
  }));
  metadata.getPageLayout.mockResolvedValue({
    id: 'lead-layout-a',
    sections: [{ name: 'Prospect Information', fields: ['svc_call_summary_remarks'] }],
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('GET /api/layouts/:objectName/default', () => {
  it('repairs an SVC-only Lead layout so existing Lead fields are visible', async () => {
    const response = await getDefaultLeadLayout();

    expect(response.status).toBe(200);
    const body = await response.json() as { data: { sections: string } };
    expect(JSON.parse(body.data.sections)).toEqual([
      { name: 'Lead Information', fields: ['firstName', 'company'] },
      { name: 'Prospect Information', fields: ['svc_call_summary_remarks'] },
    ]);
    expect(database.layoutUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-layout-a' },
      data: {
        sections: JSON.stringify([
          { name: 'Lead Information', fields: ['firstName', 'company'] },
          { name: 'Prospect Information', fields: ['svc_call_summary_remarks'] },
        ]),
      },
    });
    expect(metadata.invalidateCache).toHaveBeenCalledWith('tenant-a', 'Lead');
  });
});
