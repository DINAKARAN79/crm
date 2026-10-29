import { describe, expect, it } from 'vitest';
import {
  canAccessFollowUpRecord,
  followUpAccessWhere,
  followUpOwnerClause,
  followUpReportShowMe,
} from './followUpAccess';
import { getScopeClause } from './recordAccess';

const owner = { id: 'user-a', tenantId: 'tenant-a', isAdmin: false, isSuperAdmin: false };
const admin = { id: 'admin-a', tenantId: 'tenant-a', isAdmin: true, isSuperAdmin: false };
const systemAdmin = { id: 'sys-a', tenantId: 'tenant-a', isAdmin: false, isSuperAdmin: true };

describe('followUpAccessWhere', () => {
  it('limits a non-admin to follow-ups they own', () => {
    expect(followUpAccessWhere(owner)).toEqual({ tenantId: 'tenant-a', ownerId: 'user-a' });
    expect(followUpOwnerClause(owner)).toEqual({ ownerId: 'user-a' });
  });

  it('lets an admin and a system admin see every follow-up in the tenant', () => {
    expect(followUpAccessWhere(admin)).toEqual({ tenantId: 'tenant-a' });
    expect(followUpAccessWhere(systemAdmin, 'other-tenant')).toEqual({ tenantId: 'other-tenant' });
    expect(followUpOwnerClause(admin)).toEqual({});
  });

  it('moves access to the new owner and hides the row from the previous owner', () => {
    const followUp = { tenantId: 'tenant-a', ownerId: 'user-a' };
    expect(canAccessFollowUpRecord(owner, followUp)).toBe(true);
    expect(canAccessFollowUpRecord({ ...owner, id: 'user-b' }, followUp)).toBe(false);

    followUp.ownerId = 'user-b';
    expect(canAccessFollowUpRecord(owner, followUp)).toBe(false);
    expect(canAccessFollowUpRecord({ ...owner, id: 'user-b' }, followUp)).toBe(true);
  });

  it('does not grant access through another tenant or through lead visibility', () => {
    expect(canAccessFollowUpRecord(owner, { tenantId: 'tenant-b', ownerId: 'user-a' })).toBe(false);
    expect(canAccessFollowUpRecord(admin, { tenantId: 'tenant-b', ownerId: 'someone' })).toBe(false);
    expect(canAccessFollowUpRecord(systemAdmin, { tenantId: 'tenant-b', ownerId: 'someone' })).toBe(true);
  });

  it('forces follow-up reports to the current owner unless the user is an admin', () => {
    expect(followUpReportShowMe('FollowUp', owner, 'all')).toBe('mine');
    expect(followUpReportShowMe('FollowUp', admin, 'all')).toBe('all');
    expect(followUpReportShowMe('Lead', owner, 'all')).toBe('all');
  });
});

describe('getScopeClause follow-ups', () => {
  it('adds only the owner clause for search and export, and nothing extra for admins', async () => {
    await expect(getScopeClause(owner, 'followUp')).resolves.toEqual({ ownerId: 'user-a' });
    await expect(getScopeClause(admin, 'followUp')).resolves.toBeNull();
  });
});
