import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { futureFollowUpError, getNextFollowUpNumber } from './followUpService';

describe('futureFollowUpError', () => {
  const now = new Date('2026-10-17T10:00:00.000Z').getTime();

  it('rejects a past or current follow-up time', () => {
    expect(futureFollowUpError('2026-10-17T09:59:00.000Z', now)).toBe('Follow-up can only be scheduled for a future date and time.');
    expect(futureFollowUpError('2026-10-17T10:00:00.000Z', now)).toBe('Follow-up can only be scheduled for a future date and time.');
  });

  it('accepts a future follow-up time', () => {
    expect(futureFollowUpError('2026-10-17T10:01:00.000Z', now)).toBeNull();
  });

  it('rejects an invalid follow-up time', () => {
    expect(futureFollowUpError('not-a-date', now)).toBe('Follow-up date and time are invalid.');
  });
});

describe('getNextFollowUpNumber', () => {
  it('creates tenant-scoped, six-digit follow-up numbers', async () => {
    const upsert = vi.fn().mockResolvedValue({ nextValue: 1 });
    const db = { sequence: { upsert } } as unknown as Prisma.TransactionClient;

    await expect(getNextFollowUpNumber(db, 'tenant-1')).resolves.toBe('FU-000001');
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId_type: { tenantId: 'tenant-1', type: 'FOLLOW_UP' } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId: 'tenant-1', type: 'FOLLOW_UP', nextValue: 1 },
    });
  });

  it('keeps numbers longer than six digits intact', async () => {
    const db = { sequence: { upsert: vi.fn().mockResolvedValue({ nextValue: 266162 }) } } as unknown as Prisma.TransactionClient;

    await expect(getNextFollowUpNumber(db, 'tenant-1')).resolves.toBe('FU-266162');
  });
});
