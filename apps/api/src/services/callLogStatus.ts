import type { Prisma } from '@prisma/client';
import { appendLeadProcessNote } from './leadNotes';

const NEW_STATUS = 'NEW';
const INCOMING_STATUS = 'INCOMING';

export type CallLogStatusResult = {
  changed: boolean;
  status: string;
};

/**
 * When a call log is saved for a lead whose status is NEW, move it to INCOMING.
 * Later statuses are left as they are. Must run inside the call-log transaction.
 */
export async function applyCallLogStatusRule(
  leadId: string,
  tx: Prisma.TransactionClient,
  context: { tenantId: string; userId: string; callLogId: string },
): Promise<CallLogStatusResult> {
  const lead = await tx.lead.findFirst({
    where: { id: leadId, tenantId: context.tenantId },
    select: { id: true, status: true },
  });
  if (!lead) return { changed: false, status: '' };
  if (lead.status !== NEW_STATUS) return { changed: false, status: lead.status };

  await tx.lead.update({
    where: { id: lead.id },
    data: { status: INCOMING_STATUS },
  });
  await tx.auditLog.create({
    data: {
      tenantId: context.tenantId,
      userId: context.userId,
      leadId: lead.id,
      action: 'STATUS_CHANGE',
      objectType: 'Lead',
      objectId: lead.id,
      oldValues: { status: NEW_STATUS },
      newValues: {
        status: INCOMING_STATUS,
        reason: 'Status changed New -> Incoming (call logged)',
        note: 'Status changed New -> Incoming (call logged)',
        callLogId: context.callLogId,
      },
    },
  });
  await appendLeadProcessNote(tx, {
    tenantId: context.tenantId,
    leadId: lead.id,
    userId: context.userId,
    content: `Status changed New -> Incoming (call logged)\nCall log: ${context.callLogId}`,
  });

  return { changed: true, status: INCOMING_STATUS };
}
