import { prisma } from '@dct-crm/db';
import { impersonationStore } from '../services/impersonationContext';

export const auditLog = async (
  tenantId: string,
  userId: string | undefined,
  action: string,
  objectType: string,
  objectId: string | undefined,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string
) => {
  let leadId: string | undefined;
  if (objectId && (objectType === 'Booking' || objectType === 'Receipt')) {
    try {
      const record = objectType === 'Booking'
        ? await prisma.booking.findUnique({ where: { id: objectId }, select: { leadId: true } })
        : await prisma.receipt.findUnique({ where: { id: objectId }, select: { leadId: true } });
      leadId = record?.leadId ?? undefined;
    } catch {
      leadId = undefined;
    }
  }
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        leadId,
        userId,
        action,
        objectType,
        objectId,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
        ipAddress,
        impersonatedById: impersonationStore.getStore()?.impersonatedById,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};
