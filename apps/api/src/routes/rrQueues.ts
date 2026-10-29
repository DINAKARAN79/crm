import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  assignCompletedSiteVisitToSalesInTransaction,
  calculateQueueMatchScore,
  getRoundRobinProfileNames,
  isEligibleRRQueueMember,
  RoundRobinAssignmentService,
} from '../services/rrQueue';

const router = Router();
router.use(authenticate);

function requireAdmin(req: AuthRequest, res: Response) {
  if (req.user?.isSuperAdmin || req.user?.isAdmin) return true;
  res.status(403).json({ success: false, error: 'Admin access required' });
  return false;
}

const jsonList = z.array(z.string().trim().min(1)).default([]);
const queueInput = z.object({
  name: z.string().trim().min(1, 'Complete this field.'),
  projectId: z.string().min(1).optional(),
  leadStatus: jsonList.optional(),
  leadSource: jsonList.optional(),
  secondarySource: jsonList.optional(),
  tertiarySource: jsonList.optional(),
  leadPriority: jsonList.optional(),
  category: jsonList.optional(),
  projectInterested: jsonList.optional(),
  country: jsonList.optional(),
  excludeFromNoSource: jsonList.optional(),
  presalesQueue: z.boolean().optional(),
  active: z.boolean().optional(),
  ownerId: z.string().nullable().optional(),
  defaultOwnerId: z.string().nullable().optional(),
  leadCount: z.number().int().nonnegative().optional(),
  previousId: z.number().int().nonnegative().optional(),
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
});
const queueUpdateInput = queueInput.partial();

function queueData(input: z.infer<typeof queueInput>) {
  return {
    name: input.name,
    projectId: input.projectId ?? null,
    leadStatus: input.leadStatus || [],
    leadSource: input.leadSource || [],
    secondarySource: input.secondarySource || [],
    tertiarySource: input.tertiarySource || [],
    leadPriority: input.leadPriority || [],
    category: input.category || [],
    projectInterested: input.projectInterested || [],
    country: input.country || [],
    excludeFromNoSource: input.excludeFromNoSource || [],
    presalesQueue: input.presalesQueue ?? false,
    active: input.active ?? true,
    ownerId: input.ownerId || null,
    defaultOwnerId: input.defaultOwnerId || null,
    leadCount: input.leadCount ?? 0,
    previousId: input.previousId ?? 0,
    startTime: input.startTime ? new Date(input.startTime) : null,
    endTime: input.endTime ? new Date(input.endTime) : null,
  };
}

async function nextMemberName(tx: any, tenantId: string) {
  const sequence = await tx.sequence.findUnique({
    where: { tenantId_type: { tenantId, type: 'RRMEMBER' } },
  });

  let nextValue = sequence ? Math.max(1, Number(sequence.nextValue) || 1) : 1;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = `UID-${String(nextValue).padStart(4, '0')}`;
    const existing = await tx.rRQueueMember.findFirst({
      where: { tenantId, name: candidate },
      select: { id: true },
    });

    if (!existing) {
      await tx.sequence.upsert({
        where: { tenantId_type: { tenantId, type: 'RRMEMBER' } },
        update: { nextValue: nextValue + 1 },
        create: { tenantId, type: 'RRMEMBER', nextValue: nextValue + 1 },
      });
      return candidate;
    }

    nextValue += 1;
  }

  throw new Error('UNABLE_TO_GENERATE_MEMBER_NAME');
}

async function historyActorName(tx: any, req: AuthRequest) {
  const actor = await tx.user.findFirst({
    where: { id: req.user!.id, tenantId: req.tenantId! },
    select: { firstName: true, lastName: true },
  });
  return `${actor?.firstName || ''} ${actor?.lastName || ''}`.trim() || req.user?.email || req.user!.id;
}

function memberUserName(user: { firstName?: string | null; lastName?: string | null }) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown user';
}

const RR_QUEUE_HISTORY_LABELS: Record<string, string> = {
  name: 'Name',
  projectId: 'Project Assigned',
  active: 'Active',
  leadStatus: 'Lead Status',
  leadSource: 'Lead Source',
  secondarySource: 'Secondary Source',
  tertiarySource: 'Tertiary Source',
  leadPriority: 'Lead Priority',
  category: 'Category',
  projectInterested: 'Project Interested',
  country: 'Country',
  excludeFromNoSource: 'Excluded No-Source Values',
  presalesQueue: 'Pre Sales Queue',
  ownerId: 'Owner',
  defaultOwnerId: 'Default Owner',
  leadCount: 'Lead Count',
  previousId: 'Previous ID',
  startTime: 'Start Time',
  endTime: 'End Time',
};

function queueHistoryValue(
  field: string,
  value: unknown,
  queue: { project?: { name: string } | null; owner?: { firstName: string; lastName: string } | null },
): string | null {
  if (value === null || value === undefined) return null;
  if (field === 'projectId') return queue.project?.name || String(value);
  if (field === 'ownerId') {
    return queue.owner ? memberUserName(queue.owner) : 'Unassigned';
  }
  if (field === 'active') return value ? 'Active' : 'Inactive';
  if (field === 'presalesQueue') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).join(', ') || null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const queues = await prisma.rRQueue.findMany({
    where: { tenantId: req.tenantId!, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true } },
      project: { select: { id: true, name: true } },
      members: {
        select: {
          activeMember: true,
          isAvailable: true,
          isWorking: true,
          weekOff: true,
          user: { select: { isActive: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    success: true,
    data: queues.map((queue) => ({
      ...queue,
      noOfUsers: queue.members.filter((member) =>
        isEligibleRRQueueMember(member),
      ).length,
    })),
  });
});

router.get('/options', async (req: AuthRequest, res: Response) => {
  const [fields, projects] = await Promise.all([
    prisma.fieldDefinition.findMany({
      where: { tenantId: req.tenantId!, name: { in: ['status', 'source'] }, object: { name: 'Lead' } },
      include: { picklistValues: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    }),
    prisma.project.findMany({ where: { tenantId: req.tenantId!, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const values = (name: string) => fields.find((field) => field.name === name)?.picklistValues.map((item) => ({ value: item.value, label: item.label })) || [];
  res.json({ success: true, data: { statuses: values('status'), sources: values('source'), projects: projects.map((project) => ({ value: project.id, label: project.name })) } });
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const queue = await prisma.rRQueue.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      members: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
              profile: { select: { name: true } },
            },
          },
        },
        orderBy: { sequenceId: 'asc' },
      },
      history: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!queue) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
  res.json({
    success: true,
    data: {
      ...queue,
      noOfUsers: queue.members.filter((member) =>
        isEligibleRRQueueMember(member),
      ).length,
    },
  });
});

router.post('/', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = queueInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  try {
    if (!parsed.data.projectId) return res.status(400).json({ success: false, error: 'Select an active project in this tenant.' });
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, tenantId: req.tenantId!, isActive: true },
      select: { id: true },
    });
    if (!project) return res.status(400).json({ success: false, error: 'Select an active project in this tenant.' });
    const queue = await prisma.rRQueue.create({ data: { tenantId: req.tenantId!, createdById: req.user!.id, ...queueData(parsed.data) } });
    res.status(201).json({ success: true, data: queue });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A queue with this name already exists.' });
    res.status(500).json({ success: false, error: 'Failed to create Round Robin Queue.' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = queueUpdateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  try {
    if (parsed.data.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: parsed.data.projectId, tenantId: req.tenantId!, isActive: true },
        select: { id: true },
      });
      if (!project) return res.status(400).json({ success: false, error: 'Select an active project in this tenant.' });
    }
    const queue = await prisma.$transaction(async (tx) => {
      const where = { id: req.params.id, tenantId: req.tenantId! };
      const existing = await tx.rRQueue.findFirst({
        where,
        include: {
          project: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!existing) return null;

      const updateData = {
        ...parsed.data,
        ...(Object.prototype.hasOwnProperty.call(parsed.data, 'startTime')
          ? { startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(parsed.data, 'endTime')
          ? { endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : null }
          : {}),
        updatedById: req.user!.id,
      };
      const updated = await tx.rRQueue.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          project: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      const changedFields = Object.entries(parsed.data).filter(([field, value]) =>
        JSON.stringify((existing as unknown as Record<string, unknown>)[field] ?? null)
        !== JSON.stringify(value ?? null),
      );
      if (changedFields.length) {
        const userName = await historyActorName(tx, req);
        await tx.rRQueueHistory.createMany({
          data: changedFields.map(([field, value]) => ({
            tenantId: req.tenantId!,
            rrQueueId: existing.id,
            field: RR_QUEUE_HISTORY_LABELS[field] || field,
            userId: req.user!.id,
            userName,
            originalValue: queueHistoryValue(field, (existing as unknown as Record<string, unknown>)[field], existing),
            newValue: queueHistoryValue(field, value, updated),
          })),
        });
      }
      return updated;
    });
    if (!queue) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
    res.json({ success: true, data: queue });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A queue with this name already exists.' });
    res.status(500).json({ success: false, error: 'Failed to update Round Robin Queue.' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.rRQueue.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!deleted.count) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
  res.json({ success: true });
});

router.get('/:id/members', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = { rrQueueId: req.params.id, tenantId: req.tenantId! };
  const [members, total] = await Promise.all([
    prisma.rRQueueMember.findMany({ where, include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, profile: { select: { name: true } } } } }, orderBy: { sequenceId: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.rRQueueMember.count({ where }),
  ]);
  res.json({ success: true, data: members, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  const member = await prisma.rRQueueMember.findFirst({
    where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, profile: { select: { name: true } } } },
      rrQueue: { select: { id: true, name: true } },
    },
  });
  if (!member) return res.status(404).json({ success: false, error: 'Queue member not found.' });

  const leadScope = { tenantId: req.tenantId!, rrQueueId: member.rrQueueId, ownerId: member.userId };
  const [leadsOwned, noOfNewLeads] = await Promise.all([
    prisma.lead.count({ where: leadScope }),
    prisma.lead.count({ where: { ...leadScope, status: 'NEW' } }),
  ]);

  res.json({
    success: true,
    data: {
      ...member,
      active: member.activeMember && member.user.isActive && member.isAvailable && member.isWorking && !member.weekOff,
      leadsOwned,
      noOfNewLeads,
    },
  });
});

router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    userId: z.string().min(1),
    userType: z.enum(['Pre Sales', 'Sales', 'Post Sales', 'Recovery', 'Channel Partner', 'SVC', 'CRM']),
    activeMember: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    isWorking: z.boolean().optional(),
    weekOff: z.boolean().optional(),
    maxLeadCapacity: z.number().int().min(-1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    const hasUserIssue = parsed.error.issues.some((issue) => issue.path[0] === 'userId');
    const hasUserTypeIssue = parsed.error.issues.some((issue) => issue.path[0] === 'userType');
    return res.status(400).json({ success: false, error: hasUserIssue ? 'User is required.' : hasUserTypeIssue ? 'Select a user type.' : 'Invalid member details.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const queue = await tx.rRQueue.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
      if (!queue) throw new Error('QUEUE_NOT_FOUND');
      const userType = parsed.data.userType;
      const profileNames = getRoundRobinProfileNames(userType);
      const user = await tx.user.findFirst({
        where: { id: parsed.data.userId, tenantId: req.tenantId!, isActive: true, profile: { name: { in: profileNames } } },
      });
      if (!user) throw new Error('USER_NOT_FOUND');
      const existing = await tx.rRQueueMember.findFirst({ where: { rrQueueId: queue.id, userId: user.id, userType } });
      if (existing) throw new Error('DUPLICATE_MEMBER');
      const last = await tx.rRQueueMember.findFirst({ where: { rrQueueId: queue.id }, orderBy: { sequenceId: 'desc' } });
      const member = await tx.rRQueueMember.create({
        data: {
          tenantId: req.tenantId!,
          name: await nextMemberName(tx, req.tenantId!),
          rrQueueId: queue.id,
          userId: user.id,
          userType,
          sequenceId: (last?.sequenceId || 0) + 1,
          activeMember: parsed.data.activeMember ?? true,
          isAvailable: parsed.data.isAvailable ?? true,
          isWorking: parsed.data.isWorking ?? true,
          weekOff: parsed.data.weekOff ?? false,
          maxLeadCapacity: parsed.data.maxLeadCapacity ?? -1,
        } as any,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, profile: { select: { name: true } } } } },
      }).catch((error: any) => {
        if (error?.code === 'P2002') throw new Error('DUPLICATE_MEMBER');
        throw error;
      });
      await tx.rRQueue.update({
        where: { id: queue.id },
        data: { noOfUsers: { increment: isEligibleRRQueueMember(member) ? 1 : 0 } },
      });
      await tx.rRQueueHistory.createMany({
        data: [{
          tenantId: req.tenantId!,
          rrQueueId: queue.id,
          field: 'Created.',
          userId: req.user!.id,
          userName: await historyActorName(tx, req),
          originalValue: null,
          newValue: `${member.name} (${memberUserName(member.user)})`,
        }],
      });
      return member;
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Add RRQueue member error:', error);
    const messages: Record<string, [number, string]> = {
      QUEUE_NOT_FOUND: [404, 'Round Robin Queue not found.'],
      USER_NOT_FOUND: [404, 'User not found.'],
      DUPLICATE_MEMBER: [409, 'User is already a member of this queue.'],
      UNABLE_TO_GENERATE_MEMBER_NAME: [500, 'Unable to generate a unique queue member name.'],
    };

    if (messages[error.message]) return res.status(messages[error.message][0]).json({ success: false, error: messages[error.message][1] });
    if (error?.code === 'P2002') return res.status(409).json({ success: false, error: 'This queue member already exists.' });
    res.status(500).json({ success: false, error: 'Failed to add queue member.' });
  }
});

router.put('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    activeMember: z.boolean().optional(),
    userId: z.string().min(1).optional(),
    userType: z.enum(['Pre Sales', 'Sales', 'Post Sales', 'Recovery', 'Channel Partner', 'SVC', 'CRM']).optional(),
    isAvailable: z.boolean().optional(),
    isWorking: z.boolean().optional(),
    weekOff: z.boolean().optional(),
    maxLeadCapacity: z.number().int().min(-1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid member details.' });
  let updated: any;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const member = await tx.rRQueueMember.findFirst({
        where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
        include: { user: { select: { id: true, firstName: true, lastName: true, isActive: true, profile: { select: { name: true } } } } },
      });
      if (!member) return null;
      const nextUserId = parsed.data.userId || member.userId;
      const nextUserType = parsed.data.userType || member.userType;
      let nextUser: any;
      if (parsed.data.userId || parsed.data.userType) {
        nextUser = await tx.user.findFirst({
          where: {
            id: nextUserId,
            tenantId: req.tenantId!,
            isActive: true,
            profile: { name: { in: getRoundRobinProfileNames(nextUserType) } },
          },
          select: { id: true, firstName: true, lastName: true, isActive: true, profile: { select: { name: true } } },
        });
        if (!nextUser) throw new Error('ACTIVE_USER_NOT_FOUND');
      }

      const data = {
        ...(parsed.data.activeMember === undefined ? {} : { activeMember: parsed.data.activeMember }),
        ...(nextUser ? { userId: nextUser.id } : {}),
        ...(parsed.data.userType === undefined ? {} : { userType: parsed.data.userType }),
        ...(parsed.data.isAvailable === undefined ? {} : { isAvailable: parsed.data.isAvailable }),
        ...(parsed.data.isWorking === undefined ? {} : { isWorking: parsed.data.isWorking }),
        ...(parsed.data.weekOff === undefined ? {} : { weekOff: parsed.data.weekOff }),
        ...(parsed.data.maxLeadCapacity === undefined ? {} : { maxLeadCapacity: parsed.data.maxLeadCapacity }),
      } as any;
      const wasEligible = isEligibleRRQueueMember(member);
      const willBeEligible = isEligibleRRQueueMember({
        ...member,
        ...data,
        user: nextUser || member.user,
      });
      const result = Object.keys(data).length
        ? await tx.rRQueueMember.update({ where: { id: member.id }, data })
        : member;
      const prefix = `${member.name} - `;
      const changes: Array<{ field: string; originalValue: string | null; newValue: string | null }> = [];
      if (nextUser && nextUser.id !== member.userId) {
        changes.push({ field: `${prefix}User`, originalValue: memberUserName(member.user), newValue: memberUserName(nextUser) });
      }
      if (parsed.data.userType !== undefined && parsed.data.userType !== member.userType) {
        changes.push({ field: `${prefix}User Type`, originalValue: member.userType, newValue: parsed.data.userType });
      }
      if (parsed.data.activeMember !== undefined && parsed.data.activeMember !== member.activeMember) {
        changes.push({ field: `${prefix}Active Member`, originalValue: member.activeMember ? 'Active' : 'Inactive', newValue: parsed.data.activeMember ? 'Active' : 'Inactive' });
      }
      if (parsed.data.isAvailable !== undefined && parsed.data.isAvailable !== member.isAvailable) {
        changes.push({ field: `${prefix}Available`, originalValue: member.isAvailable ? 'Yes' : 'No', newValue: parsed.data.isAvailable ? 'Yes' : 'No' });
      }
      if (parsed.data.isWorking !== undefined && parsed.data.isWorking !== member.isWorking) {
        changes.push({ field: `${prefix}Working`, originalValue: member.isWorking ? 'Yes' : 'No', newValue: parsed.data.isWorking ? 'Yes' : 'No' });
      }
      if (parsed.data.weekOff !== undefined && parsed.data.weekOff !== member.weekOff) {
        changes.push({ field: `${prefix}Week Off`, originalValue: member.weekOff ? 'Yes' : 'No', newValue: parsed.data.weekOff ? 'Yes' : 'No' });
      }
      if (
        parsed.data.maxLeadCapacity !== undefined
        && parsed.data.maxLeadCapacity !== member.maxLeadCapacity
      ) {
        changes.push({
          field: `${prefix}Max Lead Capacity`,
          originalValue: String(member.maxLeadCapacity ?? -1),
          newValue: String(parsed.data.maxLeadCapacity),
        });
      }
      if (wasEligible !== willBeEligible) {
        await tx.rRQueue.update({
          where: { id: member.rrQueueId },
          data: { noOfUsers: { increment: willBeEligible ? 1 : -1 } },
        });
      }
      if (changes.length) {
        const userName = await historyActorName(tx, req);
        await tx.rRQueueHistory.createMany({
          data: changes.map((change) => ({
            tenantId: req.tenantId!,
            rrQueueId: member.rrQueueId,
            field: change.field,
            userId: req.user!.id,
            userName,
            originalValue: change.originalValue,
            newValue: change.newValue,
          })),
        });
      }
      return result;
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, error: 'This user is already a member of the queue.' });
    if (error?.message === 'ACTIVE_USER_NOT_FOUND') return res.status(404).json({ success: false, error: 'Active user not found.' });
    throw error;
  }
  if (!updated) return res.status(404).json({ success: false, error: 'Queue member not found.' });
  res.json({ success: true, data: updated });
});

router.delete('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.$transaction(async (tx) => {
    const member = await tx.rRQueueMember.findFirst({
      where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
      include: { user: { select: { firstName: true, lastName: true, isActive: true } } },
    });
    if (!member) return false;
    await tx.rRQueueHistory.createMany({
      data: [{
        tenantId: req.tenantId!,
        rrQueueId: member.rrQueueId,
        field: 'Deleted.',
        userId: req.user!.id,
        userName: await historyActorName(tx, req),
        originalValue: `${member.name} (${memberUserName(member.user)})`,
        newValue: null,
      }],
    });
    await tx.rRQueueMember.delete({ where: { id: member.id } });
    if (isEligibleRRQueueMember(member)) {
      await tx.rRQueue.update({ where: { id: member.rrQueueId }, data: { noOfUsers: { decrement: 1 } } });
    }
    return true;
  });
  if (!deleted) return res.status(404).json({ success: false, error: 'Queue member not found.' });
  res.json({ success: true });
});

router.get('/:id/history', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = { rrQueueId: req.params.id, tenantId: req.tenantId! };
  const [history, total] = await Promise.all([
    prisma.rRQueueHistory.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.rRQueueHistory.count({ where }),
  ]);
  res.json({ success: true, data: history, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.post('/preview', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    projectId: z.string().optional().nullable(),
    projectName: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    secondarySource: z.string().optional().nullable(),
    tertiarySource: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid preview payload.' });

  const criteria = parsed.data;
  const queues = await prisma.rRQueue.findMany({ where: { tenantId: req.tenantId!, active: true }, orderBy: { createdAt: 'asc' } });
  const scores = queues.map((queue) => ({
    queue,
    score: calculateQueueMatchScore(queue as any, {
      status: criteria.status,
      source: criteria.source,
      secondarySource: criteria.secondarySource,
      tertiarySource: criteria.tertiarySource,
      priority: criteria.priority,
      category: criteria.category,
      projectId: criteria.projectId,
      projectName: criteria.projectName,
    }),
  })).sort((left, right) => right.score - left.score);

  const selectedQueue = scores.find(({ score }) => score > 0)?.queue ?? scores[0]?.queue ?? null;
  const [preview, queueState] = selectedQueue
    ? await Promise.all([
        RoundRobinAssignmentService.getNextEligibleMember(selectedQueue.id, req.tenantId!, prisma),
        RoundRobinAssignmentService.getQueueState(selectedQueue.id, req.tenantId!, prisma),
      ])
    : [{ member: null, skipped: ['No matching queue'] }, null];

  res.json({
    success: true,
    data: {
      matchingQueues: scores.map(({ queue, score }) => ({ id: queue.id, name: queue.name, score })),
      selectedQueue: selectedQueue ? { id: selectedQueue.id, name: selectedQueue.name, score: scores[0]?.score ?? 0 } : null,
      queueCount: selectedQueue?.leadCount ?? 0,
      users: queueState?.noOfUsers ?? 0,
      roundRobin: preview,
    },
  });
});

router.post('/:id/assign', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({ leadId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Lead is required.' });
  try {
    const [queue, visit] = await Promise.all([
      prisma.rRQueue.findFirst({
        where: { id: req.params.id, tenantId: req.tenantId!, active: true },
      }),
      prisma.siteVisit.findFirst({
        where: {
          tenantId: req.tenantId!,
          leadId: parsed.data.leadId,
          status: 'COMPLETED',
          salesHandoffAt: null,
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, projectId: true },
      }),
    ]);
    if (!queue) return res.status(404).json({ success: false, error: 'Active Sales queue not found.' });
    if (!visit) return res.status(409).json({ success: false, error: 'A completed GRE site visit is required before Sales assignment.' });
    if (!visit.projectId || visit.projectId !== queue.projectId) {
      return res.status(409).json({ success: false, error: 'This queue is not configured for the completed visit project.' });
    }
    const result = await prisma.$transaction((tx) =>
      assignCompletedSiteVisitToSalesInTransaction(tx, visit.id, req.tenantId!),
    );
    if (result.pendingReason) return res.status(409).json({ success: false, error: result.pendingReason, data: result });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'SITE_VISIT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Site visit not found.' });
    }
    console.error('Manual RR assignment retry failed:', error);
    res.status(500).json({ success: false, error: 'Lead assignment failed. No queue state was changed.' });
  }
});

router.get('/:id/next-member', async (req: AuthRequest, res: Response) => {
  const parsed = z.enum(['Pre Sales', 'Sales', 'Post Sales', 'Recovery', 'Channel Partner', 'SVC', 'CRM']).safeParse(req.query.userType || 'Sales');
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid queue member user type.' });
  const member = await RoundRobinAssignmentService.getNextMember(req.params.id, req.tenantId!, prisma, parsed.data);
  if (!member) return res.status(409).json({ success: false, error: 'No active members available in this Round Robin Queue.' });
  res.json({ success: true, data: member });
});

router.post('/:id/reset-pointer', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  await RoundRobinAssignmentService.resetQueuePointer(req.params.id, req.tenantId!);
  res.json({ success: true, previousId: 0 });
});

export default router;