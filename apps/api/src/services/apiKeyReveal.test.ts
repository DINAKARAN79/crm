import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  apiKeyFindFirst: vi.fn(),
  apiKeyFindMany: vi.fn(),
  apiKeyFindUnique: vi.fn(),
  apiKeyCreate: vi.fn(),
  apiKeyUpdateMany: vi.fn(),
  transaction: vi.fn(),
  auditCreate: vi.fn(),
  tx: {} as Record<string, unknown>,
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    apiKey: {
      findFirst: database.apiKeyFindFirst,
      findMany: database.apiKeyFindMany,
      findUnique: database.apiKeyFindUnique,
      create: database.apiKeyCreate,
      updateMany: database.apiKeyUpdateMany,
    },
    $transaction: database.transaction,
  },
}));

import { issueDefaultApiKey, revealSetupCompanyApiKey, rotateCompanyApiKey } from './apiKeys';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 7).toString('base64');
  database.tx = {
    apiKey: {
      findFirst: database.apiKeyFindFirst,
      findMany: database.apiKeyFindMany,
      findUnique: database.apiKeyFindUnique,
      findUniqueOrThrow: database.apiKeyFindUnique,
      create: database.apiKeyCreate,
      updateMany: database.apiKeyUpdateMany,
    },
    auditLog: { create: database.auditCreate },
  };
  database.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(database.tx));
});

async function newKeyRow() {
  let stored: Record<string, unknown> | undefined;
  const issued = await issueDefaultApiKey({
    apiKey: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        stored = {
          id: 'key-1',
          ...data,
          lastUsedAt: null,
          graceUntil: null,
          revokedAt: null,
          createdAt: new Date('2026-10-30T00:00:00.000Z'),
        };
        return stored;
      },
    },
  } as never, 'tenant-a', 'admin-a');
  return { record: stored!, rawKey: issued.apiKey };
}

describe('company Admin one-time API-key reveal', () => {
  it('atomically permits only one of two simultaneous reveals and audits the successful reveal', async () => {
    const { record, rawKey } = await newKeyRow();
    let revealedAt: Date | null = null;
    database.apiKeyFindFirst.mockResolvedValue(record);
    database.apiKeyUpdateMany.mockImplementation(async ({ data }: { data: { revealedToCompanyAdminAt: Date } }) => {
      if (revealedAt) return { count: 0 };
      revealedAt = data.revealedToCompanyAdminAt;
      return { count: 1 };
    });
    database.apiKeyFindUnique.mockImplementation(async () => ({ ...record, revealedToCompanyAdminAt: revealedAt }));

    const results = await Promise.allSettled([
      revealSetupCompanyApiKey('tenant-a', 'admin-a', '192.0.2.1'),
      revealSetupCompanyApiKey('tenant-a', 'admin-a', '192.0.2.1'),
    ]);

    const successful = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((successful[0] as PromiseFulfilledResult<{ apiKey: string }>).value.apiKey).toBe(rawKey);
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(410);
    expect(database.auditCreate).toHaveBeenCalledTimes(1);
    expect(database.auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { tenantId: 'tenant-a', userId: 'admin-a', ipAddress: '192.0.2.1', action: 'API_KEY_REVEALED_ONCE' },
    });
    expect(JSON.stringify(database.auditCreate.mock.calls)).not.toContain(rawKey);
  });

  it('rotates to a new encrypted key and re-arms the one-time view', async () => {
    const { record } = await newKeyRow();
    database.apiKeyFindFirst.mockResolvedValue(record);
    database.apiKeyFindMany.mockResolvedValue([record]);
    database.apiKeyUpdateMany.mockResolvedValue({ count: 1 });
    database.apiKeyCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'key-2',
      ...data,
      lastUsedAt: null,
      graceUntil: null,
      revokedAt: null,
      createdAt: new Date(),
    }));

    const rotated = await rotateCompanyApiKey('tenant-a', String(record.id), 'admin-a');
    const saved = database.apiKeyCreate.mock.calls[0]?.[0].data as Record<string, unknown>;

    expect(database.apiKeyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a' }),
      data: expect.objectContaining({ status: 'revoked' }),
    }));
    expect(saved.encryptedKey).toBeTruthy();
    expect(saved.revealedToCompanyAdminAt).toBeNull();
    expect(rotated.record.id).toBe('key-2');
    expect(rotated.record.needsRegenerate).toBe(false);
  });
});
