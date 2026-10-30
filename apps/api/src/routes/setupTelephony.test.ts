import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telephony = vi.hoisted(() => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  listLogs: vi.fn(),
  probe: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    telephonySetting: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    const role = req.headers['x-test-role'];
    const isAdmin = role === 'admin';
    const isSuperAdmin = role === 'superadmin';
    const tenantId = isSuperAdmin && typeof req.query.tenantId === 'string'
      ? req.query.tenantId
      : 'tenant-1';
    Object.assign(req, {
      user: { id: 'test-user', tenantId, isAdmin, isSuperAdmin },
      tenantId,
    });
    next();
  },
}));

vi.mock('../../services/clickToCall', () => ({
  probeTelephonyConnection: telephony.probe,
}));

vi.mock('../../services/telephonySettings', () => ({
  getTelephonySettings: telephony.getSettings,
  listTelephonyRequestLogs: telephony.listLogs,
  saveTelephonySettings: telephony.saveSettings,
  telephonySettingsSchema: {
    parse: (value: unknown) => value,
  },
}));

import telephonySetupRouter from './setup/telephony';

const servers: Server[] = [];

async function request(path: string, method = 'GET', role?: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/setup/telephony', telephonySetupRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/setup/telephony${path}`, {
    method,
    headers: {
      ...(role ? { 'x-test-role': role } : {}),
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method !== 'GET' ? { body: '{}' } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  telephony.getSettings.mockResolvedValue({ hasKey: true, keyLastFour: '1234' });
  telephony.saveSettings.mockResolvedValue({ hasKey: true, keyLastFour: '1234' });
  telephony.probe.mockResolvedValue({ reached: true, httpStatus: 400, durationMs: 1, reason: 'Body rejected' });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('telephony settings authorization', () => {
  it('returns 403 for non-admin users on settings and test-connection routes', async () => {
    const settings = await request('', 'GET', 'member');
    const update = await request('', 'PUT', 'member');
    const test = await request('/test-connection', 'POST', 'member');

    expect(settings.status).toBe(403);
    expect(update.status).toBe(403);
    expect(test.status).toBe(403);
    expect(telephony.getSettings).not.toHaveBeenCalled();
    expect(telephony.saveSettings).not.toHaveBeenCalled();
    expect(telephony.probe).not.toHaveBeenCalled();
  });
});
