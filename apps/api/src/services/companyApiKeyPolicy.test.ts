import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  apiKeyFindFirst: vi.fn(),
  apiKeyCreate: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    tenant: { findMany: database.tenantFindMany },
    apiKey: {
      findFirst: database.apiKeyFindFirst,
      create: database.apiKeyCreate,
    },
  },
}));

import { DEFAULT_COMPANY_API_SCOPES, backfillPendingApiKeys, issueDefaultApiKey } from './apiKeys';

describe('default company API key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 7).toString('base64');
  });

  it('creates the key inside the company transaction and rolls the company back if the key fails', async () => {
    const companies = readFileSync(resolve(__dirname, '../routes/companies.ts'), 'utf8');
    const transactionStart = companies.indexOf('const result = await prisma.$transaction');
    const transactionEnd = companies.indexOf('await auditLog(', transactionStart);
    expect(companies.slice(transactionStart, transactionEnd)).toContain('issueDefaultApiKey');

    const tx = {
      apiKey: {
        create: vi.fn(async () => { throw new Error('key failed'); }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    await expect(issueDefaultApiKey(tx as never, 'tenant-new', 'super-admin')).rejects.toThrow('key failed');
    const saved = (tx.apiKey.create.mock.calls as unknown as Array<[{ data: { scopes: string[]; keyHash: string; keyPrefix: string; publicId: string } }]>)[0][0].data;
    expect(saved.scopes).toEqual(DEFAULT_COMPANY_API_SCOPES);
    expect(saved.scopes.some((scope: string) => scope.endsWith(':delete'))).toBe(false);
    expect(saved.keyHash).toHaveLength(64);
    expect(saved.keyPrefix.startsWith('dct_live_')).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(`${saved.keyPrefix}_`);
  });

  it('creates a pending key once per company when backfill runs twice', async () => {
    const rows: string[] = [];
    database.tenantFindMany.mockResolvedValue([{ id: 'tenant-a' }, { id: 'tenant-b' }]);
    database.apiKeyFindFirst.mockImplementation(async ({ where }: { where: { tenantId: string; status: { in: string[] } } }) => {
      expect(where.status.in).toEqual(['active', 'pending_reveal', 'grace']);
      return rows.includes(where.tenantId) ? { id: 'existing' } : null;
    });
    database.apiKeyCreate.mockImplementation(async ({ data }: { data: { tenantId: string; status: string; keyHash: string } }) => {
      rows.push(data.tenantId);
      expect(data.status).toBe('pending_reveal');
      expect(data.keyHash).toHaveLength(64);
      return { id: data.tenantId, ...data };
    });

    const first = await backfillPendingApiKeys();
    const second = await backfillPendingApiKeys();
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(rows).toEqual(['tenant-a', 'tenant-b']);
  });
});
