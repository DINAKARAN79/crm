import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@dct-crm/db', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    user: { count: vi.fn(), findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@dct-crm/db';
import { checkCapacityLimits } from './users';

describe('checkCapacityLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows editing an existing active user when the tenant is already at capacity', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ maxTotalUsers: 10, maxAdminUsers: 2 } as any);
    vi.mocked(prisma.user.count).mockResolvedValue(10);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'user-1' } as any);

    const result = await checkCapacityLimits('tenant-1', null, 'user-1');

    expect(result).toEqual({ allowed: true });
  });

  it('blocks creating a new user when the tenant is already at the total limit', async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ maxTotalUsers: 10, maxAdminUsers: 2 } as any);
    vi.mocked(prisma.user.count).mockResolvedValue(10);

    const result = await checkCapacityLimits('tenant-1');

    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Total user limit reached');
  });
});
