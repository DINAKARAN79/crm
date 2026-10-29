import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { canTransitionStatus } from './workflow';
import { tagLeadFollowUpEvents } from './leadEventTagging';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * First meaningful activity on a NEW lead promotes it to INCOMING.
 * Only runs when the creating profile is allowed NEW→INCOMING by workflow rules.
 * Additional activities on an already-INCOMING lead do nothing.
 * Must be called inside the caller's transaction when one is open.
 */
export async function promoteNewLeadOnFirstActivity(
  db: Db,
  params: {
    tenantId: string;
    leadId: string;
    userId: string;
    profileName?: string | null;
    activityLabel: string;
  },
): Promise<boolean> {
  const profileName = params.profileName || 'Admin';
  if (!canTransitionStatus(profileName, 'NEW', 'INCOMING')) return false;

  const lead = await db.lead.findFirst({
    where: { id: params.leadId, tenantId: params.tenantId },
    select: { id: true, status: true },
  });
  if (!lead || lead.status !== 'NEW') return false;

  await db.lead.update({
    where: { id: lead.id },
    data: { status: 'INCOMING' },
  });

  await db.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      leadId: lead.id,
      action: 'STATUS_CHANGE',
      objectType: 'Lead',
      objectId: lead.id,
      oldValues: { status: 'NEW' },
      newValues: {
        status: 'INCOMING',
        reason: `First activity: ${params.activityLabel}`,
        note: `First activity: ${params.activityLabel}`,
      },
    },
  });

  return true;
}

/** Tenant-safe sequential Site Visit number using existing Sequence infrastructure. */
export async function getNextSiteVisitNumber(
  db: Db,
  tenantId: string,
): Promise<string> {
  const seq = await db.sequence.upsert({
    where: { tenantId_type: { tenantId, type: 'SITE_VISIT' } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, type: 'SITE_VISIT', nextValue: 1 },
  });
  return `SV${String(seq.nextValue).padStart(6, '0')}`;
}

export async function getNextSiteVisitNumberDefault(tenantId: string): Promise<string> {
  return getNextSiteVisitNumber(prisma, tenantId);
}

export { AUTO_MISSED_REASON, normalizeOverdueSiteVisits } from './siteVisitMissedJob';

export async function normalizeOverdueFollowUps(tenantId: string): Promise<void> {
  const now = new Date();
  const overdue = await prisma.followUp.findMany({
    where: { tenantId, isCompleted: false, isMissed: false, status: { not: 'CANCELLED' }, dueDate: { lte: now } },
    select: { id: true, leadId: true, dueDate: true },
  });
  if (overdue.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const followUp of overdue) {
      const missedAt = new Date();
      const updated = await tx.followUp.updateMany({
        where: { id: followUp.id, isCompleted: false, isMissed: false },
        data: { isMissed: true, missedAt, status: 'MISSED' },
      });
      if (updated.count === 0) continue;

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: null,
          leadId: followUp.leadId || undefined,
          action: 'FOLLOW_UP_MISSED',
          objectType: 'FollowUp',
          objectId: followUp.id,
          oldValues: { isCompleted: false, isMissed: false, dueDate: followUp.dueDate.toISOString() },
          newValues: { isCompleted: false, isMissed: true, missedAt: missedAt.toISOString(), source: 'SYSTEM' },
        },
      });
      if (followUp.leadId) await tagLeadFollowUpEvents(tx, tenantId, followUp.leadId);
    }
  });
}

export async function normalizeOverdueScheduledItems(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await normalizeOverdueFollowUps(tenant.id);
  }
}