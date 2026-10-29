import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  layoutFindMany: vi.fn(),
  layoutFindFirst: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    projectLayout: {
      findMany: database.layoutFindMany,
      findFirst: database.layoutFindFirst,
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; tenantId: string; isSuperAdmin: boolean } }).user = {
      id: 'user-a',
      email: 'user-a@example.test',
      tenantId: 'tenant-a',
      isSuperAdmin: false,
    };
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../services/fileUpload', () => ({
  getProjectLayoutPath: vi.fn(() => '/project-layout-test-file'),
}));

import projectLayoutQuotationRouter from './projectLayoutQuotation';

const servers: Server[] = [];

async function startServer() {
  const app = express();
  app.use('/api/project-layouts', projectLayoutQuotationRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return `http://127.0.0.1:${address.port}/api/project-layouts`;
}

beforeEach(() => {
  vi.clearAllMocks();
  database.layoutFindMany.mockResolvedValue([]);
  database.layoutFindFirst.mockResolvedValue(null);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('Tenant quotation project layouts', () => {
  it('returns no custom layout when the project has no saved draft', async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: null });
    expect(database.layoutFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        status: { in: ['DRAFT', 'PUBLISHED'] },
      }),
    }));
  });

  it('returns an incomplete saved draft so quotations can explain why mapping is required', async () => {
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-empty',
      name: 'Site plan',
      originalFilename: 'site-plan.png',
      mimeType: 'image/png',
      selectedPage: 1,
      status: 'DRAFT',
      shapes: [],
    }]);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        id: 'layout-empty',
        name: 'Site plan',
        isInteractive: false,
        shapes: [],
      },
    });
  });

  it('returns a complete mapped layout scoped to the authenticated tenant', async () => {
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-a',
      name: 'Site plan',
      originalFilename: 'site-plan.png',
      mimeType: 'image/png',
      selectedPage: 1,
      status: 'PUBLISHED',
      shapes: [{
        id: 'shape-a',
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        unit: {
          id: 'unit-a',
          tenantId: 'tenant-a',
          projectId: 'project-a',
          number: 'A-1',
          type: '2BHK',
          block: 'A',
          floor: 1,
          area: 1000,
          status: 'AVAILABLE',
        },
      }],
    }]);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);
    const body = await response.json() as {
      data: {
        isInteractive: boolean;
        shapes: Array<{
          unit: Record<string, unknown>;
          geometry: Record<string, number>;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.isInteractive).toBe(true);
    expect(body.data.shapes[0].unit).toEqual({
      id: 'unit-a',
      number: 'A-1',
      type: '2BHK',
      block: 'A',
      floor: 1,
      area: 1000,
      status: 'AVAILABLE',
    });
    expect(body.data.shapes[0].geometry).toEqual({ x: 0.1, y: 0.2, width: 0.2, height: 0.1 });
  });

  it('keeps saved draft mappings unavailable to quotation users until finalized', async () => {
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-draft',
      name: 'Site plan',
      originalFilename: 'site-plan.png',
      mimeType: 'image/png',
      selectedPage: 1,
      status: 'DRAFT',
      shapes: [{
        id: 'shape-a',
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        unit: {
          id: 'unit-a',
          tenantId: 'tenant-a',
          projectId: 'project-a',
          number: 'A-1',
          type: '2BHK',
          block: 'A',
          floor: 1,
          area: 1000,
          status: 'AVAILABLE',
        },
      }],
    }]);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);

    expect(await response.json()).toMatchObject({
      success: true,
      data: { status: 'DRAFT', isInteractive: false, shapes: [] },
    });

  });

  it('does not expose a published layout with unmapped shapes as interactive', async () => {
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-incomplete',
      name: 'Site plan',
      originalFilename: 'site-plan.png',
      mimeType: 'image/png',
      selectedPage: 1,
      status: 'PUBLISHED',
      shapes: [{
        id: 'shape-unmapped',
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        unit: null,
      }],
    }]);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        id: 'layout-incomplete',
        isInteractive: false,
        shapes: [],
      },
    });
  });

  it('does not expose a layout containing a unit from another tenant or project', async () => {
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-a',
      name: 'Invalid site plan',
      originalFilename: 'site-plan.png',
      mimeType: 'image/png',
      selectedPage: 1,
      status: 'PUBLISHED',
      shapes: [{
        id: 'shape-a',
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        unit: {
          id: 'unit-other',
          tenantId: 'tenant-other',
          projectId: 'project-other',
          number: 'A-1',
          type: null,
          block: null,
          floor: null,
          area: null,
          status: 'AVAILABLE',
        },
      }],
    }]);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a`);

    expect(await response.json()).toMatchObject({ success: true, data: null });
  });

  it('does not serve a drawing when its layout is outside the authenticated tenant/project', async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a/layout-other/drawing`);

    expect(response.status).toBe(404);
    expect(database.layoutFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'layout-other',
        tenantId: 'tenant-a',
        projectId: 'project-a',
      }),
    }));
  });

  it('does not serve a drawing whose mapped units are outside the authenticated project', async () => {
    database.layoutFindFirst.mockResolvedValue({
      storageKey: 'layout_0123456789abcdef0123456789abcdef.png',
      mimeType: 'image/png',
      originalFilename: 'site-plan.png',
      shapes: [{ unit: { tenantId: 'tenant-other', projectId: 'project-other' } }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/projects/project-a/layout-a/drawing`);

    expect(response.status).toBe(404);
  });
});
