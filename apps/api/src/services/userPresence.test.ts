import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionRow = {
  id: string;
  tenantId: string;
  userId: string;
  sessionTokenHash: string;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  isImpersonation: boolean;
};

const mem = vi.hoisted(() => ({
  users: new Map<string, { id: string; isLoggedIn: boolean; lastLoginAt: Date | null; lastSeenAt: Date | null; lastLogoutAt: Date | null }>(),
  sessions: [] as SessionRow[],
  locks: new Map<string, Promise<void>>(),
  lookups: 0,
}));

function matches(row: SessionRow, where: Record<string, unknown>) {
  if (where.id && row.id !== where.id) return false;
  if (where.userId && row.userId !== where.userId) return false;
  if (where.tenantId && row.tenantId !== where.tenantId) return false;
  if (where.sessionTokenHash && row.sessionTokenHash !== where.sessionTokenHash) return false;
  if ('endedAt' in where && where.endedAt === null && row.endedAt) return false;
  if ('isImpersonation' in where && row.isImpersonation !== where.isImpersonation) return false;
  const seen = where.lastSeenAt as { gte?: Date } | undefined;
  if (seen?.gte && row.lastSeenAt < seen.gte) return false;
  const ended = where.endedAt as { lt?: Date } | null | undefined;
  if (ended && typeof ended === 'object' && ended.lt && (!row.endedAt || row.endedAt >= ended.lt)) return false;
  return true;
}

vi.mock('@dct-crm/db', () => {
  const userSession = {
    create: async ({ data }: { data: SessionRow }) => {
      const row = { ...data, id: data.id || `sess-${mem.sessions.length + 1}` };
      mem.sessions.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { sessionTokenHash?: string; id?: string } }) => {
      mem.lookups += 1;
      return mem.sessions.find((row) => row.sessionTokenHash === where.sessionTokenHash || row.id === where.id) || null;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      mem.sessions.find((row) => matches(row, where)) || null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
      const row = mem.sessions.find((item) => item.id === where.id);
      if (!row) throw new Error('missing session');
      Object.assign(row, data);
      return row;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      mem.sessions.filter((row) => matches(row, where)),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<SessionRow> }) => {
      const ids = (where.id as { in?: string[] } | undefined)?.in;
      let count = 0;
      for (const row of mem.sessions) {
        if ((ids && ids.includes(row.id)) || (!ids && matches(row, where))) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    count: async ({ where }: { where: Record<string, unknown> }) =>
      mem.sessions.filter((row) => matches(row, where)).length,
    deleteMany: async () => ({ count: 0 }),
  };
  const user = {
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const current = mem.users.get(where.id) || { id: where.id, isLoggedIn: false, lastLoginAt: null, lastSeenAt: null, lastLogoutAt: null };
      const next = { ...current, ...data };
      mem.users.set(where.id, next);
      return next;
    },
    findUnique: async ({ where }: { where: { id: string } }) => mem.users.get(where.id) || null,
  };
  const tx = {
    userSession,
    user,
    $executeRaw: async () => 1,
  };
  let chain = Promise.resolve();
  return {
    prisma: {
      userSession,
      user,
      presenceSetting: { findUnique: async () => null, findMany: async () => [], upsert: async ({ create }: { create: { idleTimeoutSeconds: number } }) => create },
      auditLog: { create: async () => ({ id: 'audit' }) },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
        const run = chain.then(() => fn(tx));
        chain = run.then(() => undefined, () => undefined);
        return run;
      },
      $queryRaw: async () => {
        const cutoff = Date.now() - 120_000;
        const ended: Array<{ userId: string; tenantId: string }> = [];
        for (const row of mem.sessions) {
          if (!row.endedAt && row.lastSeenAt.getTime() < cutoff) {
            row.endedAt = new Date();
            row.endReason = 'IDLE_TIMEOUT';
            ended.push({ userId: row.userId, tenantId: row.tenantId });
          }
        }
        return ended;
      },
      $executeRaw: async () => 1,
    },
  };
});

import {
  allowHeartbeat,
  deriveLoggedIn,
  endAllUserSessions,
  endSessionBySecret,
  hashSessionSecret,
  markSessionStale,
  openUserSession,
  reducePresence,
  rejectManagedUserFields,
  resetPresenceGuards,
  sweepIdleSessions,
  sessionIsAccepted,
  touchUserSession,
  validatePresenceSettings,
} from './userPresence';

const req = { get: () => 'Mozilla/5.0 Chrome', headers: {}, socket: { remoteAddress: '203.0.113.10' } } as never;

function session(id: string, overrides: Partial<{ endedAt: Date | null; isImpersonation: boolean; lastSeenAt: Date }> = {}) {
  return {
    id,
    endedAt: overrides.endedAt ?? null,
    isImpersonation: overrides.isImpersonation ?? false,
    lastSeenAt: overrides.lastSeenAt ?? new Date(),
  };
}

describe('user presence', () => {
  beforeEach(() => {
    mem.users.clear();
    mem.sessions.splice(0, mem.sessions.length);
    mem.lookups = 0;
    resetPresenceGuards();
  });

  it('ignores a leave beacon that races a fresh heartbeat and ends a quiet tab', async () => {
    await openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'fresh', req, isImpersonation: false });
    await markSessionStale('fresh');
    expect(mem.sessions[0].endedAt ?? null).toBeNull();

    await openUserSession({ userId: 'u2', tenantId: 't1', sessionSecret: 'quiet', req, isImpersonation: false });
    const quiet = mem.sessions.find((row) => row.sessionTokenHash === hashSessionSecret('quiet'));
    if (!quiet) throw new Error('missing quiet session');
    quiet.lastSeenAt = new Date(Date.now() - 20_000);
    await markSessionStale('quiet');
    expect(quiet.endedAt).toBeInstanceOf(Date);
    expect(quiet.endReason).toBe('IDLE_TIMEOUT');
  });

  it('turns logged in on for a login and off when the only session ends', async () => {
    await openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'one', req, isImpersonation: false });
    expect(mem.users.get('u1')?.isLoggedIn).toBe(true);
    expect(mem.sessions[0].sessionTokenHash).toBe(hashSessionSecret('one'));
    expect(mem.sessions[0].sessionTokenHash).not.toContain('one');
    await endSessionBySecret('one', 'LOGOUT');
    expect(mem.users.get('u1')?.isLoggedIn).toBe(false);
    expect(mem.users.get('u1')?.lastLogoutAt).toBeInstanceOf(Date);
  });

  it('keeps the user online when another browser is still active', () => {
    const now = new Date();
    const first = reducePresence({
      sessions: [],
      isLoggedIn: false,
      lastLogoutAt: null,
    }, { type: 'login', session: { ...session('a'), userId: 'u1' } }, now, 120_000);
    const both = reducePresence(first, { type: 'login', session: { ...session('b'), userId: 'u1' } }, now, 120_000);
    const oneLeft = reducePresence(both, { type: 'end', sessionId: 'a', at: now }, now, 120_000);
    expect(oneLeft.isLoggedIn).toBe(true);
    const none = reducePresence(oneLeft, { type: 'end', sessionId: 'b', at: now }, now, 120_000);
    expect(none.isLoggedIn).toBe(false);
  });

  it('marks a closed browser offline after the idle window and keeps a fresh heartbeat online', async () => {
    const stale = new Date(Date.now() - 130_000);
    mem.sessions.push({
      id: 'stale',
      tenantId: 't1',
      userId: 'u1',
      sessionTokenHash: hashSessionSecret('stale'),
      browser: 'Chrome',
      os: 'macOS',
      deviceType: 'desktop',
      ipAddress: null,
      createdAt: stale,
      lastSeenAt: stale,
      endedAt: null,
      endReason: null,
      isImpersonation: false,
    });
    mem.users.set('u1', { id: 'u1', isLoggedIn: true, lastLoginAt: stale, lastSeenAt: stale, lastLogoutAt: null });
    await sweepIdleSessions();
    expect(mem.sessions[0].endReason).toBe('IDLE_TIMEOUT');
    expect(mem.users.get('u1')?.isLoggedIn).toBe(false);

    await openUserSession({ userId: 'u2', tenantId: 't1', sessionSecret: 'live', req, isImpersonation: false });
    await touchUserSession({ userId: 'u2', tenantId: 't1', sessionSecret: 'live', req, isImpersonation: false });
    await sweepIdleSessions();
    expect(mem.users.get('u2')?.isLoggedIn).toBe(true);
  });

  it('does not count an impersonation session', () => {
    const now = new Date();
    expect(deriveLoggedIn([session('imp', { isImpersonation: true })], now, 120_000)).toBe(false);
  });

  it('ends every session when the account is deactivated or the password changes', async () => {
    await openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'a', req, isImpersonation: false });
    await openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'b', req, isImpersonation: false });
    await endAllUserSessions('u1', 't1', 'USER_DEACTIVATED');
    expect(mem.sessions.every((row) => row.endReason === 'USER_DEACTIVATED')).toBe(true);
    expect(mem.users.get('u1')?.isLoggedIn).toBe(false);
  });

  it('keeps a consistent value when logins and logouts overlap', async () => {
    await Promise.all([
      openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'a', req, isImpersonation: false }),
      openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'b', req, isImpersonation: false }),
    ]);
    await Promise.all([
      endSessionBySecret('a', 'LOGOUT'),
      endSessionBySecret('b', 'LOGOUT'),
    ]);
    const open = mem.sessions.filter((row) => row.userId === 'u1' && !row.endedAt && !row.isImpersonation);
    expect(mem.users.get('u1')?.isLoggedIn).toBe(open.length > 0);
    expect(open).toHaveLength(0);
  });

  it('rejects managed login fields and invalid timeouts', () => {
    expect(() => rejectManagedUserFields({ isLoggedIn: true })).toThrow(/cannot be set/);
    expect(() => validatePresenceSettings(120, 30)).not.toThrow();
    expect(() => validatePresenceSettings(70, 30)).toThrow(/three times/);
  });

  it('treats a quiet session as offline before the cleanup job ends it', () => {
    const now = new Date();
    const quiet = session('quiet', { lastSeenAt: new Date(now.getTime() - 121_000) });
    expect(quiet.endedAt).toBeNull();
    expect(deriveLoggedIn([quiet], now, 120_000)).toBe(false);
  });

  it('rejects an ended session on the next check and caches a live one for 5 seconds', async () => {
    await openUserSession({ userId: 'u1', tenantId: 't1', sessionSecret: 'one', req, isImpersonation: false });
    expect(await sessionIsAccepted('one', 1_000)).toBe(true);
    const lookupsAfterFirst = mem.lookups;
    expect(await sessionIsAccepted('one', 2_000)).toBe(true);
    expect(mem.lookups).toBe(lookupsAfterFirst);
    mem.sessions[0].endedAt = new Date();
    mem.sessions[0].endReason = 'ADMIN_FORCED';
    expect(await sessionIsAccepted('one', 3_000)).toBe(true);
    expect(await sessionIsAccepted('one', 8_000)).toBe(false);

    resetPresenceGuards();
    mem.sessions[0].endReason = 'IDLE_TIMEOUT';
    expect(await sessionIsAccepted('one', 9_000)).toBe(true);
    mem.sessions[0].endedAt = null;
    mem.sessions[0].endReason = null;
    await endSessionBySecret('one', 'LOGOUT');
    expect(await sessionIsAccepted('one', 9_100)).toBe(false);
  });

  it('rate limits heartbeats and pauses a hidden tab by not sending', () => {
    expect(allowHeartbeat('u1', 1_000)).toBe(true);
    expect(allowHeartbeat('u1', 2_000)).toBe(false);
    expect(allowHeartbeat('u1', 12_000)).toBe(true);
  });
});
