import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  getObjectDefinitions: vi.fn(),
  getObjectDefinition: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({ prisma: {} }));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, {
      user: { id: 'user-1', tenantId: 'tenant-1', isSuperAdmin: state.isSuperAdmin },
      tenantId: 'tenant-1',
    });
    next();
  },
}));

vi.mock('../middleware/permissions', () => ({
  requirePermission: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../services/metadata', () => ({
  getObjectDefinitions: state.getObjectDefinitions,
  getObjectDefinition: state.getObjectDefinition,
  invalidateCache: vi.fn(),
}));

import { objectDefinitionRoutes } from './objectDefinitions';

const servers: Server[] = [];

async function request(path: string) {
  const server = express().use('/api/objects', objectDefinitionRoutes).listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

beforeEach(() => {
  state.isSuperAdmin = false;
  vi.clearAllMocks();
  state.getObjectDefinitions.mockResolvedValue([
    { name: 'Lead', pluralLabel: 'Leads' },
    { name: 'Company', pluralLabel: 'Companies' },
    { name: 'CompaniesAPI', pluralLabel: 'Companies API' },
  ]);
  state.getObjectDefinition.mockResolvedValue({ name: 'Company' });
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  servers.length = 0;
});

describe('object definition visibility', () => {
  it('hides Company and Companies API definitions from company users', async () => {
    const response = await request('/api/objects');
    const body = await response.json() as { data: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((object) => object.name)).toEqual(['Lead']);
  });

  it('returns Company and Companies API definitions to super admins', async () => {
    state.isSuperAdmin = true;
    const response = await request('/api/objects');
    const body = await response.json() as { data: Array<{ name: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((object) => object.name)).toEqual(['Lead', 'Company', 'CompaniesAPI']);
  });

  it('does not expose Company definitions by direct request to company users', async () => {
    const response = await request('/api/objects/COMPANY');

    expect(response.status).toBe(404);
    expect(state.getObjectDefinition).not.toHaveBeenCalled();
  });

  it('does not expose Companies API definitions by direct request to company users', async () => {
    const response = await request('/api/objects/companiesapi');

    expect(response.status).toBe(404);
    expect(state.getObjectDefinition).not.toHaveBeenCalled();
  });
});
