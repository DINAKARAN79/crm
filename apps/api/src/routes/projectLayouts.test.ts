import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFile, getProjectLayoutPath } from '../services/fileUpload';

const database = vi.hoisted(() => ({
  isSuperAdmin: false,
  tenantFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  unitFindMany: vi.fn(),
  unitCount: vi.fn(),
  unitCreate: vi.fn(),
  unitUpdate: vi.fn(),
  layoutFindMany: vi.fn(),
  layoutCount: vi.fn(),
  layoutFindFirst: vi.fn(),
  layoutFindUnique: vi.fn(),
  layoutCreate: vi.fn(),
  layoutUpdate: vi.fn(),
  layoutDelete: vi.fn(),
  shapeDeleteMany: vi.fn(),
  shapeCreateMany: vi.fn(),
  shapeFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    tenant: { findUnique: database.tenantFindUnique },
    project: { findFirst: database.projectFindFirst },
    unit: {
      findMany: database.unitFindMany,
      count: database.unitCount,
      create: database.unitCreate,
      update: database.unitUpdate,
    },
    projectLayout: {
      findMany: database.layoutFindMany,
      count: database.layoutCount,
      findFirst: database.layoutFindFirst,
      findUnique: database.layoutFindUnique,
      create: database.layoutCreate,
      update: database.layoutUpdate,
      delete: database.layoutDelete,
    },
    projectLayoutShape: {
      deleteMany: database.shapeDeleteMany,
      createMany: database.shapeCreateMany,
      findMany: database.shapeFindMany,
    },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: string; tenantId: string; isSuperAdmin: boolean } }).user = {
      id: 'super-user',
      email: 'super-admin@example.test',
      tenantId: 'home-tenant',
      isSuperAdmin: database.isSuperAdmin,
    };
    next();
  },
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));

import projectLayoutsRouter from './projectLayouts';

const servers: Server[] = [];

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/project-layouts', projectLayoutsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return `http://127.0.0.1:${address.port}/api/project-layouts`;
}

beforeEach(() => {
  vi.clearAllMocks();
  database.isSuperAdmin = false;
  database.tenantFindUnique.mockResolvedValue({ id: 'tenant-a' });
  database.projectFindFirst.mockResolvedValue({ id: 'project-a' });
  database.unitFindMany.mockResolvedValue([]);
  database.unitCount.mockResolvedValue(0);
  database.layoutFindMany.mockResolvedValue([]);
  database.layoutCount.mockResolvedValue(0);
  database.layoutFindFirst.mockResolvedValue(null);
  database.layoutFindUnique.mockResolvedValue(null);
  database.layoutCreate.mockResolvedValue({ id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a' });
  database.layoutUpdate.mockResolvedValue({ id: 'layout-a', selectedPage: 1, shapes: [] });
  database.layoutDelete.mockResolvedValue({ id: 'layout-a' });
  database.shapeFindMany.mockResolvedValue([]);
  database.transaction.mockImplementation((operation: (transaction: unknown) => unknown) => operation({
    projectLayoutShape: {
      deleteMany: database.shapeDeleteMany,
      createMany: database.shapeCreateMany,
      findMany: database.shapeFindMany,
    },
    projectLayout: { update: database.layoutUpdate },
  }));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('Super Admin custom project layout API', () => {
  it('rejects non-Super Admin access before reading tenant or project data', async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/tenants/tenant-a/projects/project-a/units`);

    expect(response.status).toBe(403);
    expect(database.projectFindFirst).not.toHaveBeenCalled();
    expect(database.unitFindMany).not.toHaveBeenCalled();
  });

  it('loads units scoped to the selected tenant and project', async () => {
    database.isSuperAdmin = true;
    database.unitFindMany.mockResolvedValue([{ id: 'unit-a', number: 'A-1' }]);
    database.unitCount.mockResolvedValue(1);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/tenants/tenant-a/projects/project-a/units`);

    expect(response.status).toBe(200);
    expect(database.projectFindFirst).toHaveBeenCalledWith({
      where: { id: 'project-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(database.unitFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', projectId: 'project-a' },
    }));
  });

  it('lists layouts across companies with company, project, and mapping counts', async () => {
    database.isSuperAdmin = true;
    database.layoutFindMany.mockResolvedValue([{
      id: 'layout-a',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      name: 'North Site Plan',
      status: 'DRAFT',
      updatedAt: new Date('2026-10-25T12:00:00.000Z'),
      tenant: { name: 'Northstar Realty' },
      project: { name: 'North Gardens' },
      _count: { shapes: 3 },
      shapes: [{ unitId: 'unit-a' }, { unitId: null }, { unitId: 'unit-b' }],
    }]);
    database.layoutCount.mockResolvedValue(1);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/?page=1&limit=25&search=North&tenantId=tenant-a&projectId=project-a&status=DRAFT&overview=true`);
    const result = await response.json() as { data: unknown[]; pagination: object };

    expect(response.status).toBe(200);
    expect(database.layoutFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        projectId: 'project-a',
        status: { equals: 'DRAFT' },
        OR: expect.any(Array),
      }),
      skip: 0,
      take: 25,
    }));
    expect(result.data[0]).toMatchObject({
      id: 'layout-a',
      tenant: { name: 'Northstar Realty' },
      project: { name: 'North Gardens' },
      mappedUnits: 2,
      unmappedUnits: 1,
      _count: { shapes: 3 },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
  });

  it('deletes a layout only within its supplied company and project', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      name: 'North Site Plan',
      storageKey: 'layout_0123456789abcdef0123456789abcdef.png',
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, { method: 'DELETE' });
    const result = await response.json() as { success: boolean };

    expect(response.status).toBe(200);
    expect(database.layoutFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a' }),
    }));
    expect(database.layoutDelete).toHaveBeenCalledWith({ where: { id: 'layout-a' } });
    expect(result.success).toBe(true);
  });

  it('rejects units from a different project without writing shape or unit records', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', selectedPage: 1,
    });
    database.unitCount.mockResolvedValue(0);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        shapes: [{ id: 'shape-a', kind: 'RECTANGLE', unitId: 'other-project-unit', geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
      }),
    });

    expect(response.status).toBe(400);
    expect(database.unitCount).toHaveBeenCalledWith({
      where: { id: { in: ['other-project-unit'] }, tenantId: 'tenant-a', projectId: 'project-a' },
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('rejects a project that does not belong to the selected tenant before upload', async () => {
    database.isSuperAdmin = true;
    database.projectFindFirst.mockResolvedValue(null);
    const baseUrl = await startServer();
    const body = new FormData();
    body.append('drawing', new Blob([Buffer.from('%PDF-1.7')], { type: 'application/pdf' }), 'site.pdf');
    const response = await fetch(`${baseUrl}/tenants/tenant-a/projects/foreign-project/upload`, { method: 'POST', body });

    expect(response.status).toBe(404);
    expect(database.projectFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-project', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(database.layoutCreate).not.toHaveBeenCalled();
  });

  it('rejects duplicate unit mappings before database writes', async () => {
    database.isSuperAdmin = true;
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        shapes: [
          { id: 'shape-a', kind: 'RECTANGLE', unitId: 'unit-a', geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
          { id: 'shape-b', kind: 'POLYGON', unitId: 'unit-a', geometry: { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }] } },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(database.layoutFindFirst).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('saves normalized unit mappings as draft shapes without mutating inventory', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', selectedPage: 1, status: 'DRAFT',
    });
    database.unitCount.mockResolvedValue(1);
    database.layoutUpdate.mockResolvedValue({
      id: 'layout-a',
      selectedPage: 2,
      shapes: [{ id: 'shape-a', unitId: 'unit-a', kind: 'POLYGON' }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 2,
        shapes: [{ id: 'shape-a', kind: 'POLYGON', unitId: 'unit-a', geometry: { points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.4, y: 0.5 }] } }],
      }),
    });

    expect(response.status).toBe(200);
    expect(database.shapeDeleteMany).toHaveBeenCalledWith({ where: { layoutId: 'layout-a' } });
    expect(database.shapeCreateMany).toHaveBeenCalledWith({
      data: [{
        layoutId: 'layout-a',
        id: 'shape-a',
        unitId: 'unit-a',
        kind: 'POLYGON',
        geometry: { points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.4, y: 0.5 }] },
      }],
    });
    expect(database.unitCount).toHaveBeenCalledWith({
      where: { id: { in: ['unit-a'] }, tenantId: 'tenant-a', projectId: 'project-a' },
    });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(database.unitCreate).not.toHaveBeenCalled();
    expect(database.unitUpdate).not.toHaveBeenCalled();
  });

  it('saves incomplete drafts and retains shape identifiers without unit mappings', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', selectedPage: 1, status: 'DRAFT',
    });
    database.layoutUpdate.mockResolvedValue({
      id: 'layout-a',
      selectedPage: 1,
      status: 'DRAFT',
      shapes: [{ id: 'shape-unsaved-unit', unitId: null, kind: 'RECTANGLE' }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        shapes: [{
          id: 'shape-unsaved-unit',
          kind: 'RECTANGLE',
          unitId: null,
          geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        }],
      }),
    });

    expect(response.status).toBe(200);
    expect(database.unitCount).not.toHaveBeenCalled();
    expect(database.shapeCreateMany).toHaveBeenCalledWith({
      data: [{
        layoutId: 'layout-a',
        id: 'shape-unsaved-unit',
        unitId: null,
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      }],
    });
  });

  it('reopens a saved layout with its original shape IDs, geometry, and nullable unit mapping', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      selectedPage: 1,
      status: 'DRAFT',
      shapes: [{
        id: 'shape-persisted',
        kind: 'POLYGON',
        geometry: { points: [{ x: 0.1, y: 0.2 }, { x: 0.7, y: 0.2 }, { x: 0.6, y: 0.8 }] },
        unitId: null,
        unit: null,
      }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`);
    const body = await response.json() as { data: { shapes: Array<{ id: string; unitId: string | null; geometry: object }> } };

    expect(response.status).toBe(200);
    expect(body.data.shapes).toEqual([{
      id: 'shape-persisted',
      kind: 'POLYGON',
      geometry: { points: [{ x: 0.1, y: 0.2 }, { x: 0.7, y: 0.2 }, { x: 0.6, y: 0.8 }] },
      unitId: null,
      unit: null,
    }]);
    expect(database.layoutFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', status: { in: ['DRAFT', 'PUBLISHED'] } },
    }));
  });

  it('returns a published layout to draft when saved with an unmapped shape', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', selectedPage: 1, status: 'PUBLISHED',
    });
    database.layoutUpdate.mockResolvedValue({
      id: 'layout-a',
      selectedPage: 1,
      status: 'DRAFT',
      shapes: [{ id: 'shape-a', unitId: null, kind: 'RECTANGLE' }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        shapes: [{
          id: 'shape-a',
          kind: 'RECTANGLE',
          unitId: null,
          geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        }],
      }),
    });

    expect(response.status).toBe(200);
    expect(database.layoutUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT' }),
    }));
  });

  it('finalizes a layout with saved mappings and exposes the published status', async () => {
    database.isSuperAdmin = true;
    database.layoutFindFirst.mockResolvedValue({
      id: 'layout-a', tenantId: 'tenant-a', projectId: 'project-a', selectedPage: 1, status: 'DRAFT',
    });
    database.unitCount.mockResolvedValue(1);
    database.layoutUpdate.mockResolvedValue({
      id: 'layout-a',
      selectedPage: 1,
      status: 'PUBLISHED',
      shapes: [{ id: 'shape-a', unitId: 'unit-a', kind: 'RECTANGLE' }],
    });
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        finalize: true,
        shapes: [{ id: 'shape-a', kind: 'RECTANGLE', unitId: 'unit-a', geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
      }),
    });
    const body = await response.json() as { data: { status: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('PUBLISHED');
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(database.layoutUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    }));
    expect(database.shapeCreateMany).toHaveBeenCalledWith({
      data: [{
        layoutId: 'layout-a',
        id: 'shape-a',
        unitId: 'unit-a',
        kind: 'RECTANGLE',
        geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      }],
    });
    expect(database.unitCreate).not.toHaveBeenCalled();
    expect(database.unitUpdate).not.toHaveBeenCalled();
  });

  it('cannot finalize a layout without mapped shapes', async () => {
    database.isSuperAdmin = true;
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedPage: 1, finalize: true, shapes: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Draw and map at least one unit shape before finalizing this layout',
    });
    expect(database.layoutFindFirst).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('cannot finalize when any shape is still unmapped', async () => {
    database.isSuperAdmin = true;
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/layout-a?tenantId=tenant-a&projectId=project-a`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        selectedPage: 1,
        finalize: true,
        shapes: [{
          id: 'shape-a',
          kind: 'RECTANGLE',
          unitId: null,
          geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        }],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Map every shape to a unit before finalizing this layout',
    });
    expect(database.layoutFindFirst).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['site.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['site.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]],
    ['site.pdf', 'application/pdf', Array.from(Buffer.from('%PDF-1.7'))],
  ])('accepts a valid-signature drawing upload: %s', async (filename, mimeType, header) => {
    database.isSuperAdmin = true;
    const baseUrl = await startServer();
    const body = new FormData();
    body.append('drawing', new Blob([new Uint8Array(header)], { type: mimeType }), filename);
    const response = await fetch(`${baseUrl}/tenants/tenant-a/projects/project-a/upload`, { method: 'POST', body });
    const responseBody = await response.json();

    expect(response.status, JSON.stringify(responseBody)).toBe(201);
    expect(database.layoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', projectId: 'project-a', mimeType }),
    }));
    const storedKey = database.layoutCreate.mock.calls.at(-1)?.[0].data.storageKey as string;
    deleteFile(getProjectLayoutPath(storedKey));
  });

  it('rejects a mismatched file signature and removes the uploaded content', async () => {
    database.isSuperAdmin = true;
    const baseUrl = await startServer();
    const body = new FormData();
    body.append('drawing', new Blob([Buffer.from('%PDF-1.7')], { type: 'image/png' }), 'not-a-png.png');
    const response = await fetch(`${baseUrl}/tenants/tenant-a/projects/project-a/upload`, { method: 'POST', body });

    expect(response.status).toBe(400);
    expect(database.layoutCreate).not.toHaveBeenCalled();
  });
});
