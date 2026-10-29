import { prisma } from '@dct-crm/db';
import { EffectivePermissionService } from './effectivePermissions';
import { canAccessLead } from './recordAccess';
import { createOwnerHistory } from './ownerHistory';
import { appendLeadProcessNote } from './leadNotes';

export async function changeLeadOwner(params: {
  leadId: string;
  newOwnerId: string;
  reason?: string;
  changedBy: {
    id: string;
    tenantId: string;
    isSuperAdmin?: boolean;
    isAdmin?: boolean;
    profileName?: string | null;
  };
}) {
  const reason = params.reason?.trim() || '';
  if (!params.newOwnerId.trim()) throw new Error('New owner is required');

  const lead = await prisma.lead.findFirst({
    where: { id: params.leadId, ...(params.changedBy.isSuperAdmin ? {} : { tenantId: params.changedBy.tenantId }) },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!lead) throw new Error('Lead not found');
  if (!(await canAccessLead(params.changedBy, lead))) {
    throw new Error('You do not have access to this lead');
  }
  if (lead.ownerId === params.newOwnerId) {
    throw new Error('New owner must be different from the current owner');
  }

  const newOwner = await prisma.user.findFirst({
    where: {
      id: params.newOwnerId,
      tenantId: lead.tenantId,
      isActive: true,
      profileId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      profile: { select: { name: true } },
    },
  });
  if (!newOwner) throw new Error('New owner is not an eligible active user in this tenant');
  if (!(await EffectivePermissionService.hasPermission(newOwner.id, 'LEAD_READ'))) {
    throw new Error('New owner does not have Lead access');
  }

  const changedByUser = await prisma.user.findUnique({
    where: { id: params.changedBy.id },
    select: { firstName: true, lastName: true },
  });
  const changedByName = changedByUser ? `${changedByUser.firstName} ${changedByUser.lastName}`.trim() : null;
  const assignedTo = `${newOwner.firstName} ${newOwner.lastName}`.trim();

  return prisma.$transaction(async (tx) => {
    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: { ownerId: newOwner.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    await createOwnerHistory({
      tenantId: lead.tenantId,
      leadId: lead.id,
      previousOwnerId: lead.ownerId,
      newOwnerId: newOwner.id,
      previousProfile: lead.ownerId
        ? (await tx.user.findUnique({
            where: { id: lead.ownerId },
            select: { profile: { select: { name: true } } },
          }))?.profile?.name || null
        : null,
      newProfile: newOwner.profile?.name || null,
      previousStatus: lead.status,
      newStatus: lead.status,
      handoffReason: reason || 'Manual owner change',
      changedById: params.changedBy.id,
    }, tx);

    await tx.auditLog.create({
      data: {
        tenantId: lead.tenantId,
        userId: params.changedBy.id,
        leadId: lead.id,
        action: 'OWNER_CHANGED',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: {
          ownerId: lead.ownerId,
          ownerName: lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : null,
          status: lead.status,
        },
        newValues: {
          ownerId: newOwner.id,
          ownerName: assignedTo,
          status: lead.status,
          ...(reason ? { reason } : {}),
          assignmentSource: 'Manual',
          ...(changedByName ? { changedByName } : {}),
          assignedTo,
        },
      },
    });
    await appendLeadProcessNote(tx, {
      tenantId: lead.tenantId,
      leadId: lead.id,
      userId: params.changedBy.id,
      content: reason
        ? `Lead owner changed to ${assignedTo}.\nReason: ${reason}`
        : `Lead owner changed to ${assignedTo}.`,
    });

    return updatedLead;
  });
}

export async function getEligibleLeadOwners(tenantId: string, currentOwnerId: string | null) {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      profileId: { not: null },
      ...(currentOwnerId ? { id: { not: currentOwnerId } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profile: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  const eligible = [];
  const checked = await Promise.all(
    users.map(async (user) => ({
      user,
      allowed: await EffectivePermissionService.hasPermission(user.id, 'LEAD_READ'),
    })),
  );
  for (const entry of checked) {
    if (entry.allowed) {
      eligible.push(entry.user);
    }
  }
  return eligible;
}
