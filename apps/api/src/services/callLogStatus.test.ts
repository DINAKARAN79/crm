import { beforeEach, describe, expect, it, vi } from 'vitest';

const notes = vi.hoisted(() => ({
  appendLeadProcessNote: vi.fn(),
}));

vi.mock('./leadNotes', () => notes);

import { applyCallLogStatusRule } from './callLogStatus';

function transactionFor(status: string | null, tenantId = 'tenant-a') {
  const lead = status
    ? { id: 'lead-a', status, tenantId }
    : null;
  const update = vi.fn().mockResolvedValue({ id: 'lead-a', status: 'INCOMING' });
  const audit = vi.fn().mockResolvedValue({});
  const tx = {
    lead: {
      findFirst: vi.fn().mockResolvedValue(lead),
      update,
    },
    auditLog: { create: audit },
  };
  return { tx, update, audit };
}

const context = { tenantId: 'tenant-a', userId: 'user-a', callLogId: 'call-a' };

describe('applyCallLogStatusRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves a New lead to Incoming for any call outcome', async () => {
    const { tx, update, audit } = transactionFor('NEW');

    const result = await applyCallLogStatusRule('lead-a', tx as never, context);

    expect(result).toEqual({ changed: true, status: 'INCOMING' });
    expect(tx.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'lead-a', tenantId: 'tenant-a' },
      select: { id: true, status: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'lead-a' },
      data: { status: 'INCOMING' },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'STATUS_CHANGE',
        oldValues: { status: 'NEW' },
        newValues: expect.objectContaining({ status: 'INCOMING', callLogId: 'call-a' }),
      }),
    }));
    expect(notes.appendLeadProcessNote).toHaveBeenCalledWith(tx, expect.objectContaining({
      content: expect.stringContaining('Status changed New -> Incoming (call logged)'),
    }));
  });

  it.each(['INCOMING', 'PROSPECT', 'SITE_VISIT_HAPPENED', 'BOOKED', 'LOST'])(
    'leaves a %s lead unchanged',
    async (status) => {
      const { tx, update, audit } = transactionFor(status);

      const result = await applyCallLogStatusRule('lead-a', tx as never, context);

      expect(result).toEqual({ changed: false, status });
      expect(update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it('does not touch a lead in another tenant', async () => {
    const { tx, update } = transactionFor(null);

    const result = await applyCallLogStatusRule('lead-a', tx as never, context);

    expect(result).toEqual({ changed: false, status: '' });
    expect(tx.lead.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lead-a', tenantId: 'tenant-a' },
    }));
    expect(update).not.toHaveBeenCalled();
  });
});
