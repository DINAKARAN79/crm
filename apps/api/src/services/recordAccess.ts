import { prisma } from '@dct-crm/db';
import { EffectivePermissionService } from './effectivePermissions';
import { canAccessFollowUpRecord, followUpAccessWhere } from './followUpAccess';

export type AuthUserLike = {
  id: string;
  tenantId: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  profileName?: string | null;
};

export type RecordScope =
  | { type: 'ALL' }
  | { type: 'OWNER'; userId: string };

async function hasLegacyViewAll(userId: string, objectName: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissionSets: {
            include: { permissionSet: true },
          },
        },
      },
    },
  });

  for (const userRole of userRoles) {
    for (const rolePerm of userRole.role.permissionSets) {
      if (rolePerm.permissionSet.objectName === objectName) {
        const permissions = rolePerm.permissionSet.permissions as {
          viewAll?: boolean;
          modifyAll?: boolean;
        };
        if (permissions?.viewAll || permissions?.modifyAll) return true;
      }
    }
  }
  return false;
}

export async function getRecordScope(
  user: AuthUserLike,
  objectName: string,
  moduleName: string,
): Promise<RecordScope> {
  if (user.isSuperAdmin || user.isAdmin) return { type: 'ALL' };

  const permsPromise = EffectivePermissionService.getEffectivePermissionsCached(user, user.id);
  const [perms, legacy] = await Promise.all([
    permsPromise,
    hasLegacyViewAll(user.id, objectName),
  ]);

  const viewAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_VIEW_ALL`);
  const modifyAll = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_MODIFY_ALL`);

  if (viewAll || modifyAll || legacy) return { type: 'ALL' };
  return { type: 'OWNER', userId: user.id };
}

export async function getLeadRecordScope(user: AuthUserLike): Promise<RecordScope> {
  if (user.isSuperAdmin || user.isAdmin) return { type: 'ALL' };
  return { type: 'OWNER', userId: user.id };
}

/** Shared site-visit access clause: assignee or creator of an active SCHEDULED visit. */
function activeSiteVisitShare(userId: string) {
  return {
    siteVisits: {
      some: {
        status: 'SCHEDULED' as const,
        OR: [{ assigneeId: userId }, { creatorId: userId }],
      },
    },
  };
}

/**
 * Owner-based Lead list/detail scope.
 * ALL → no owner filter.
 * OWNER → leads this user owns, plus an active scheduled site-visit share.
 * A lead assigned to someone else stays off this user's list, even if they created it.
 */
export function leadScopeClause(scope: RecordScope): Record<string, unknown> | null {
  if (scope.type === 'ALL') return null;
  return {
    OR: [
      { ownerId: scope.userId },
      activeSiteVisitShare(scope.userId),
    ],
  };
}

export async function canAccessLead(
  user: AuthUserLike,
  lead: { id: string; tenantId: string; ownerId: string | null; creatorId?: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && lead.tenantId !== user.tenantId) return false;
  const scope = await getLeadRecordScope(user);
  if (scope.type === 'ALL') return true;
  if (lead.ownerId && lead.ownerId === scope.userId) return true;
  const shared = await prisma.siteVisit.findFirst({
    where: {
      leadId: lead.id,
      status: 'SCHEDULED',
      OR: [{ assigneeId: scope.userId }, { creatorId: scope.userId }],
    },
    select: { id: true },
  });
  return Boolean(shared);
}

export async function canAccessLeadId(user: AuthUserLike, leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...(user.isSuperAdmin ? {} : { tenantId: user.tenantId }) },
    select: { id: true, tenantId: true, ownerId: true, creatorId: true },
  });
  if (!lead) return false;
  return canAccessLead(user, lead);
}

export function ownerOwnedClause(userId: string): Record<string, unknown> {
  return { ownerId: userId };
}

export async function canAccessSiteVisit(
  user: AuthUserLike,
  sv: { id: string; tenantId: string; assigneeId: string | null; creatorId: string | null; leadId: string },
): Promise<boolean> {
  if (!user.isSuperAdmin && sv.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'SiteVisit', 'SITE_VISIT');
  if (scope.type === 'ALL') return true;
  if (sv.assigneeId === scope.userId || sv.creatorId === scope.userId) return true;
  return canAccessLeadId(user, sv.leadId);
}

export async function canAccessTask(
  user: AuthUserLike,
  task: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  if (!user.isSuperAdmin && task.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Task', 'TASK');
  if (scope.type === 'ALL') return true;
  if (task.ownerId === scope.userId) return true;
  if (task.leadId) return canAccessLeadId(user, task.leadId);
  return false;
}

export async function canAccessFollowUp(
  user: AuthUserLike,
  fu: { id: string; tenantId: string; ownerId: string | null; leadId: string | null },
): Promise<boolean> {
  return canAccessFollowUpRecord(user, fu);
}

export async function canAccessActivity(
  user: AuthUserLike,
  activity: { id: string; tenantId: string; userId: string | null; leadId: string | null },
): Promise<boolean> {
  if (activity.tenantId !== user.tenantId) return false;
  const scope = await getRecordScope(user, 'Activity', 'ACTIVITY');
  if (scope.type === 'ALL') return true;
  if (activity.userId === scope.userId) return true;
  if (activity.leadId) return canAccessLeadId(user, activity.leadId);
  return false;
}

/** Merge a base where object with an optional scope clause using AND. */
export function withScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  return { AND: [where, scopeClause] };
}

export type RecordKind =
  | 'lead'
  | 'siteVisit'
  | 'task'
  | 'followUp'
  | 'activity';

const builders: Record<
  RecordKind,
  (scope: RecordScope) => Record<string, unknown> | null
> = {
  lead: leadScopeClause,
  siteVisit: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [
        { assigneeId: scope.userId },
        { creatorId: scope.userId },
        { lead: leadScopeClause(scope) },
      ],
    };
  },
  task: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [{ ownerId: scope.userId }, { lead: leadScopeClause(scope) }],
    };
  },
  followUp: (scope) => {
    if (scope.type === 'ALL') return null;
    return { ownerId: scope.userId };
  },
  activity: (scope) => {
    if (scope.type === 'ALL') return null;
    return {
      OR: [{ userId: scope.userId }, { lead: leadScopeClause(scope) }],
    };
  },
};

export async function getScopeClause(
  user: AuthUserLike,
  kind: RecordKind,
): Promise<Record<string, unknown> | null> {
  if (kind === 'followUp') {
    const ownerId = followUpAccessWhere(user).ownerId;
    return ownerId ? { ownerId } : null;
  }
  const meta: Record<RecordKind, { objectName: string; moduleName: string }> = {
    lead: { objectName: 'Lead', moduleName: 'LEAD' },
    siteVisit: { objectName: 'SiteVisit', moduleName: 'SITE_VISIT' },
    task: { objectName: 'Task', moduleName: 'TASK' },
    followUp: { objectName: 'FollowUp', moduleName: 'FOLLOW_UP' },
    activity: { objectName: 'Activity', moduleName: 'ACTIVITY' },
  };
  const scope = await getRecordScope(user, meta[kind].objectName, meta[kind].moduleName);
  return builders[kind](scope);
}

/** Apply scope into a where clause with AND (preserves existing AND arrays). */
export function applyScope(
  where: Record<string, unknown>,
  scopeClause: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!scopeClause) return where;
  const existing = where.AND;
  if (Array.isArray(existing)) {
    return { ...where, AND: [...existing, scopeClause] };
  }
  return { ...where, AND: [scopeClause] };
}

/** Force report showMe for OWNER-scoped users. Frontend cannot override. */
export async function resolveReportShowMe(
  user: AuthUserLike,
  requested: unknown,
): Promise<'all' | 'mine'> {
  const scope = await getLeadRecordScope(user);
  if (scope.type === 'OWNER') return 'mine';
  return requested === 'mine' ? 'mine' : 'all';
}