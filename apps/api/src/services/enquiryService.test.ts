import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createEnquiryInTransactionWithStatus } from './enquiryService';

vi.mock('@dct-crm/db', () => ({ prisma: {} }));

function createTransaction() {
  return {
    enquiry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
    },
    sequence: { upsert: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

const baseInput = {
  tenantId: 'tenant-1',
  leadId: 'lead-1',
  leadType: 'ORIGINAL',
  enquiryType: 'ORIGINAL',
  source: 'WEBSITE',
  userId: 'user-1',
  originalSubmissionId: 'WEBSITE:submission-1',
};

describe('createEnquiryInTransactionWithStatus', () => {
  it('returns a previously-created enquiry for a replayed submission ID', async () => {
    const priorEnquiry = { id: 'enquiry-1', leadId: 'lead-1' };
    const tx = createTransaction();
    vi.mocked(tx.enquiry.findFirst).mockResolvedValue(priorEnquiry as never);

    const result = await createEnquiryInTransactionWithStatus(tx, baseInput);

    expect(result).toEqual({ enquiry: priorEnquiry, created: false });
    expect(tx.enquiry.create).not.toHaveBeenCalled();
    expect(tx.enquiry.findMany).not.toHaveBeenCalled();
  });

  it('preserves raw submitted contact values in a new enquiry snapshot', async () => {
    const tx = createTransaction();
    vi.mocked(tx.enquiry.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(tx.sequence.upsert).mockResolvedValue({ nextValue: 100001 } as never);
    vi.mocked(tx.enquiry.create).mockResolvedValue({ id: 'enquiry-2' } as never);

    await createEnquiryInTransactionWithStatus(tx, {
      ...baseInput,
      phone: ' (415) 555-0123 ',
      secondaryPhone: '+1 (415) 555-0199',
      email: '  Main@Example.com ',
      tertiaryEmail: ' Third@Example.com ',
    });

    expect(tx.enquiry.findMany).not.toHaveBeenCalled();
    expect(tx.enquiry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phone: ' (415) 555-0123 ',
        secondaryPhone: '+1 (415) 555-0199',
        email: '  Main@Example.com ',
        tertiaryEmail: ' Third@Example.com ',
        originalSubmissionId: 'WEBSITE:submission-1',
      }),
    }));
  });
});
