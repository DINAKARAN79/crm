import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  settingCreateMany: vi.fn(),
  settingFindMany: vi.fn(),
  settingUpsert: vi.fn(),
  leadCount: vi.fn(),
  transaction: vi.fn(),
}));
const authState = vi.hoisted(() => ({ isAdmin: true }));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    leadStatusSetting: {
      createMany: database.settingCreateMany,
      findMany: database.settingFindMany,
    },
    lead: { count: database.leadCount },
    $transaction: database.transaction,
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, {
      user: { id: 'admin-a', tenantId: 'tenant-a', isSuperAdmin: false, isAdmin: authState.isAdmin },
      tenantId: 'tenant-a',
    });
    next();
  },
}));

vi.mock('../../middleware/permissions', () => ({
  requirePermission: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

import leadStatusesRouter from './lead-statuses';
import { getLeadStatusSettings } from '../../services/leadStatusSettings';

const servers: Server[] = [];

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/setup/lead-statuses', leadStatusesRouter);
  return app;
}

async function request(path: string, method = 'GET', body?: unknown) {
  const server = createApp().listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const completeSettings = Array.from({ length: 7 }, (_, index) => ({
  statusId: String(index + 1),
  label: `Company A ${index + 1}`,
  enabled: true,
}));

beforeEach(() => {
  authState.isAdmin = true;
  vi.clearAllMocks();
  database.settingCreateMany.mockResolvedValue({ count: 7 });
  database.settingFindMany.mockImplementation(async ({ where }: { where: { tenantId: string } }) =>
    Array.from({ length: 7 }, (_, index) => ({
      statusId: index + 1,
      label: `${where.tenantId} label ${index + 1}`,
      enabled: true,
    })),
  );
  database.settingUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => create);
  database.leadCount.mockResolvedValue(0);
  database.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      lead: { count: database.leadCount },
      leadStatusSetting: {
        upsert: database.settingUpsert,
        findMany: database.settingFindMany,
      },
    }),
  );
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  servers.length = 0;
});

describe('company lead status settings', () => {
  it('uses the authenticated tenant even when a company ID is supplied by the caller', async () => {
    const response = await request('/api/setup/lead-statuses?tenantId=tenant-b');
    const body = await response.json() as { data: Array<{ statusId: string; label: string }> };

    expect(response.status).toBe(200);
    expect(database.settingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a' } }));
    expect(body.data[0]).toMatchObject({ statusId: '1', label: 'tenant-a label 1' });
  });

  it('writes all mappings to the authenticated tenant only', async () => {
    const response = await request('/api/setup/lead-statuses?tenantId=tenant-b', 'PUT', { statuses: completeSettings });

    expect(response.status).toBe(200);
    expect(database.settingUpsert).toHaveBeenCalledTimes(7);
    expect(database.settingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_statusId: { tenantId: 'tenant-a', statusId: 1 } },
      create: expect.objectContaining({ tenantId: 'tenant-a', statusId: 1 }),
    }));
    expect(database.settingUpsert).not.toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ tenantId: 'tenant-b' }),
    }));
  });

  it('allows ordinary company users to read statuses but prevents them from changing settings', async () => {
    authState.isAdmin = false;
    const readResponse = await request('/api/setup/lead-statuses');
    const updateResponse = await request('/api/setup/lead-statuses', 'PUT', { statuses: completeSettings });

    expect(readResponse.status).toBe(200);
    expect(updateResponse.status).toBe(403);
    expect(database.settingUpsert).not.toHaveBeenCalled();
  });

  it('keeps the same status ID independently configurable for different companies', async () => {
    const [companyA, companyB] = await Promise.all([
      getLeadStatusSettings('tenant-a'),
      getLeadStatusSettings('tenant-b'),
    ]);

    expect(companyA[0]).toMatchObject({ statusId: '1', label: 'tenant-a label 1' });
    expect(companyB[0]).toMatchObject({ statusId: '1', label: 'tenant-b label 1' });
  });

  it('rejects duplicate IDs and prevents disabling a status in use', async () => {
    const duplicate = completeSettings.map((status, index) => index === 1 ? { ...status, statusId: '1' } : status);
    const duplicateResponse = await request('/api/setup/lead-statuses', 'PUT', { statuses: duplicate });
    expect(duplicateResponse.status).toBe(400);

    database.settingUpsert.mockClear();
    database.leadCount.mockImplementation(({ where }: { where: { status: string } }) =>
      Promise.resolve(where.status === 'PROSPECT' ? 1 : 0),
    );
    const disableResponse = await request('/api/setup/lead-statuses', 'PUT', {
      statuses: completeSettings.map((status) => status.statusId === '3' ? { ...status, enabled: false } : status),
    });
    expect(disableResponse.status).toBe(409);
    expect(database.settingUpsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_statusId: { tenantId: 'tenant-a', statusId: 3 } },
    }));
  });
});
