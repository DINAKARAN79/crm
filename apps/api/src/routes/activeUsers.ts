import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { requireSuperAdmin } from '../middleware/superAdmin';
import {
  endAllUserSessions,
  endSessionById,
  getPresenceSettings,
  relativeActivity,
  savePresenceSettings,
  validatePresenceSettings,
} from '../services/userPresence';
import { presenceSnapshot, subscribePresence } from '../services/presenceEvents';

const router = Router();
router.use(authenticate);

function requireAdministrator(req: AuthRequest, res: Response) {
  if (!req.user?.isSuperAdmin && !req.user?.isAdmin) {
    res.status(403).json({ success: false, error: 'Administrator access is required' });
    return false;
  }
  return true;
}

router.get('/presence-settings', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  res.json({ success: true, data: await getPresenceSettings(req.tenantId!) });
});

router.put('/presence-settings', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  try {
    const input = z.object({
      idleTimeoutSeconds: z.number().int(),
      heartbeatIntervalSeconds: z.number().int(),
    }).parse(req.body || {});
    validatePresenceSettings(input.idleTimeoutSeconds, input.heartbeatIntervalSeconds);
    const data = await savePresenceSettings(req.tenantId!, req.user!.id, input);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check the presence settings.';
    res.status(400).json({ success: false, error: message });
  }
});

router.get('/active-users', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  try {
    const tenantId = req.tenantId!;
    const countsOnly = Boolean(req.user?.isSuperAdmin && !req.impersonation);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
    const includeOffline = req.query.includeOffline === 'true';
    const settings = await getPresenceSettings(tenantId);
    const cutoff = new Date(Date.now() - settings.idleTimeoutSeconds * 1000);
    const liveSessions = await prisma.userSession.findMany({
      where: { tenantId, endedAt: null, isImpersonation: false, lastSeenAt: { gte: cutoff } },
      select: { userId: true },
    });
    const onlineIds = [...new Set(liveSessions.map((session) => session.userId))];
    const where: Record<string, unknown> = { tenantId, isSuperAdmin: false, isActive: true };
    if (!includeOffline) where.id = { in: onlineIds.length ? onlineIds : ['__none__'] };
    if (profileId) where.profileId = profileId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [users, totalUsers, profiles] = await Promise.all([
      prisma.user.findMany({
        where: where as never,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          lastLoginAt: true,
          lastSeenAt: true,
          profile: { select: { id: true, name: true } },
          role: { select: { id: true, name: true } },
        },
      }),
      prisma.user.count({ where: { tenantId, isSuperAdmin: false, isActive: true } }),
      prisma.user.findMany({
        where: { id: { in: onlineIds.length ? onlineIds : ['__none__'] }, tenantId, isSuperAdmin: false, isActive: true },
        select: { id: true, profile: { select: { name: true } } },
      }),
    ]);
    const sessions = await prisma.userSession.findMany({
      where: {
        tenantId,
        userId: { in: users.map((user) => user.id) },
        endedAt: null,
        isImpersonation: false,
        lastSeenAt: { gte: cutoff },
      },
      select: {
        id: true,
        userId: true,
        browser: true,
        os: true,
        deviceType: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    const byUser = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const list = byUser.get(session.userId) || [];
      list.push(session);
      byUser.set(session.userId, list);
    }
    const profileCounts = new Map<string, number>();
    for (const user of profiles) {
      const name = user.profile?.name || 'No profile';
      profileCounts.set(name, (profileCounts.get(name) || 0) + 1);
    }
    const now = new Date();
    const rows = users.map((user) => {
      const open = byUser.get(user.id) || [];
      const latest = open[0];
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isLoggedIn: open.length > 0,
        profile: user.profile,
        role: user.role,
        sessionCount: open.length,
        browser: latest?.browser || null,
        os: latest?.os || null,
        ipAddress: latest?.ipAddress || null,
        loggedInSince: open.reduce<Date | null>((earliest, session) => !earliest || session.createdAt < earliest ? session.createdAt : earliest, null),
        lastSeenAt: latest?.lastSeenAt || user.lastSeenAt,
        lastActivity: latest ? relativeActivity(latest.lastSeenAt, now) : user.lastSeenAt ? relativeActivity(user.lastSeenAt, now) : null,
        sessions: open,
      };
    }).filter((user) => includeOffline || user.isLoggedIn)
      .sort((a, b) => (b.lastSeenAt?.getTime() || 0) - (a.lastSeenAt?.getTime() || 0));
    const onlineCount = profiles.length;
    const version = `${onlineCount}:${profiles.map((user) => user.id).sort().join(',')}`;
    const serverTime = new Date().toISOString();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('ETag', `"${version}"`);
    res.json({
      success: true,
      data: {
        onlineCount,
        totalUsers,
        loggedOut: Math.max(0, totalUsers - onlineCount),
        byProfile: [...profileCounts.entries()].map(([profile, count]) => ({ profile, count })),
        users: countsOnly ? [] : rows,
        detailsHidden: countsOnly,
        serverTime,
        version,
      },
    });
  } catch (error) {
    console.error('Active users error', error instanceof Error ? error.name : 'error');
    res.status(500).json({ success: false, error: 'Failed to load active users' });
  }
});

router.get('/active-users/stream', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  const countsOnly = Boolean(req.user?.isSuperAdmin && !req.impersonation);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.socket?.setTimeout(0);
  res.write('retry: 3000\n\n');
  const send = (event: Record<string, unknown>) => {
    const payload = countsOnly
      ? { ...event, changedUserId: null, version: String(event.onlineCount ?? '') }
      : event;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const unsubscribe = subscribePresence(req.tenantId!, send);
  try {
    const snapshot = await presenceSnapshot(req.tenantId!);
    const at = new Date().toISOString();
    send({ type: 'presence', ...snapshot, changedUserId: null, at, serverTime: at });
  } catch (error) {
    console.error('Presence stream snapshot error', error instanceof Error ? error.name : 'error');
  }
  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25_000);
  heartbeat.unref?.();
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post('/active-users/:userId/force-logout', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  if (req.user?.isSuperAdmin && !req.impersonation) {
    return res.status(403).json({ success: false, error: 'Open the company as its admin to end a session.' });
  }
  const user = await prisma.user.findFirst({
    where: { id: req.params.userId, tenantId: req.tenantId!, isSuperAdmin: false },
    select: { id: true },
  });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  await endAllUserSessions(user.id, req.tenantId!, 'ADMIN_FORCED');
  await auditLog(req.tenantId!, req.user!.id, 'FORCE_LOGOUT', 'User', user.id, undefined, { scope: 'user' });
  res.json({ success: true });
});

router.post('/active-users/sessions/:sessionId/force-logout', async (req: AuthRequest, res: Response) => {
  if (!requireAdministrator(req, res)) return;
  if (req.user?.isSuperAdmin && !req.impersonation) {
    return res.status(403).json({ success: false, error: 'Open the company as its admin to end a session.' });
  }
  const ended = await endSessionById(req.params.sessionId, req.tenantId!, 'ADMIN_FORCED');
  if (!ended) return res.status(404).json({ success: false, error: 'Session not found' });
  await auditLog(req.tenantId!, req.user!.id, 'FORCE_LOGOUT', 'UserSession', ended.id, undefined, { userId: ended.userId, scope: 'session' });
  res.json({ success: true });
});

export const presenceCountsRouter = Router();
presenceCountsRouter.use(authenticate, requireSuperAdmin);
presenceCountsRouter.get('/', async (_req: AuthRequest, res: Response) => {
  const [settings, sessions, totals, people] = await Promise.all([
    prisma.presenceSetting.findMany({ select: { tenantId: true, idleTimeoutSeconds: true } }),
    prisma.userSession.findMany({
      where: { endedAt: null, isImpersonation: false },
      select: { tenantId: true, userId: true, lastSeenAt: true },
    }),
    prisma.user.groupBy({
      by: ['tenantId'],
      where: { isActive: true, isSuperAdmin: false },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, isSuperAdmin: false },
      select: { id: true },
    }),
  ]);
  const countable = new Set(people.map((user) => user.id));
  const idleByTenant = new Map(settings.map((row) => [row.tenantId, row.idleTimeoutSeconds]));
  const now = Date.now();
  const onlineByTenant = new Map<string, Set<string>>();
  for (const session of sessions) {
    if (!countable.has(session.userId)) continue;
    const idleMs = (idleByTenant.get(session.tenantId) || 120) * 1000;
    if (now - session.lastSeenAt.getTime() > idleMs) continue;
    const users = onlineByTenant.get(session.tenantId) || new Set<string>();
    users.add(session.userId);
    onlineByTenant.set(session.tenantId, users);
  }
  res.json({
    success: true,
    data: totals.map((row) => ({
      tenantId: row.tenantId,
      onlineCount: onlineByTenant.get(row.tenantId)?.size || 0,
      totalUsers: row._count._all,
    })),
  });
});

export default router;
