type FollowUpActor = {
  id: string;
  tenantId: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
};

/**
 * Follow-up visibility.
 * Admin and System Admin are the existing profile.isAdmin and user.isSuperAdmin flags
 * set by authenticate(). Everyone else is limited to follow-ups they own.
 * Role hierarchy is not included.
 */
export function followUpAccessWhere(
  user: FollowUpActor,
  tenantId = user.tenantId,
): { tenantId: string; ownerId?: string } {
  if (user.isSuperAdmin || user.isAdmin) return { tenantId };
  return { tenantId, ownerId: user.id };
}

export function followUpOwnerClause(
  user: FollowUpActor,
): { ownerId?: string } {
  const access = followUpAccessWhere(user);
  return access.ownerId ? { ownerId: access.ownerId } : {};
}

export function canAccessFollowUpRecord(
  user: FollowUpActor,
  followUp: { tenantId: string; ownerId: string | null },
): boolean {
  if (!user.isSuperAdmin && followUp.tenantId !== user.tenantId) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  return followUp.ownerId === user.id;
}

/** Non-admins always run Follow-up reports as "mine", even if the report asks for all. */
export function followUpReportShowMe(
  objectName: string,
  user: Pick<FollowUpActor, 'isAdmin' | 'isSuperAdmin'>,
  requested: 'all' | 'mine',
): 'all' | 'mine' {
  const normalized = String(objectName || '').replace(/[\s_-]/g, '').toLowerCase();
  if (normalized !== 'followup') return requested;
  if (user.isAdmin || user.isSuperAdmin) return requested === 'mine' ? 'mine' : 'all';
  return 'mine';
}
