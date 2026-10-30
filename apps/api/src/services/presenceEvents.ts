import { prisma } from '@dct-crm/db';

const DEFAULT_IDLE_TIMEOUT_SECONDS = 120;

export type PresenceEvent = {
  type: 'presence';
  onlineCount: number;
  totalUsers: number;
  changedUserId: string | null;
  isOnline: boolean;
  at: string;
  version: string;
  serverTime: string;
};

type Snapshot = Pick<PresenceEvent, 'onlineCount' | 'totalUsers' | 'isOnline' | 'version'>;
type Listener = (event: PresenceEvent) => void;

const subscribers = new Map<string, Set<Listener>>();
const lastSentAt = new Map<string, number>();
const pending = new Map<string, { changedUserId: string; timer: ReturnType<typeof setTimeout>; resolvers: Array<() => void> }>();
let revision = 0;

export function resetPresenceEvents() {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  lastSentAt.clear();
  subscribers.clear();
  revision = 0;
}

export function subscribePresence(tenantId: string, listener: Listener) {
  const set = subscribers.get(tenantId) || new Set<Listener>();
  set.add(listener);
  subscribers.set(tenantId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribers.delete(tenantId);
  };
}

export async function presenceSnapshot(tenantId: string, changedUserId: string | null = null): Promise<Snapshot> {
  const setting = await prisma.presenceSetting.findUnique({
    where: { tenantId },
    select: { idleTimeoutSeconds: true },
  });
  const cutoff = new Date(Date.now() - (setting?.idleTimeoutSeconds || DEFAULT_IDLE_TIMEOUT_SECONDS) * 1000);
  const sessions = await prisma.userSession.findMany({
    where: { tenantId, endedAt: null, isImpersonation: false, lastSeenAt: { gte: cutoff } },
    select: { userId: true },
  });
  const onlineIds = [...new Set(sessions.map((session) => session.userId))];
  const [totalUsers, onlineCount] = await Promise.all([
    prisma.user.count({ where: { tenantId, isActive: true, isSuperAdmin: false } }),
    onlineIds.length
      ? prisma.user.count({ where: { id: { in: onlineIds }, tenantId, isActive: true, isSuperAdmin: false } })
      : Promise.resolve(0),
  ]);
  const onlineUserIds = onlineIds.length
    ? (await prisma.user.findMany({
      where: { id: { in: onlineIds }, tenantId, isActive: true, isSuperAdmin: false },
      select: { id: true },
    })).map((user) => user.id)
    : [];
  return {
    onlineCount,
    totalUsers,
    isOnline: changedUserId ? onlineUserIds.includes(changedUserId) : onlineCount > 0,
    version: `${revision}:${onlineCount}:${onlineUserIds.sort().join(',')}`,
  };
}

function fanout(tenantId: string, event: PresenceEvent) {
  for (const listener of subscribers.get(tenantId) || []) listener(event);
}

async function emit(tenantId: string, changedUserId: string | null, load: () => Promise<Snapshot>) {
  revision += 1;
  lastSentAt.set(tenantId, Date.now());
  const snapshot = await load();
  const now = new Date().toISOString();
  fanout(tenantId, {
    type: 'presence',
    ...snapshot,
    version: `${revision}:${snapshot.onlineCount}`,
    changedUserId,
    at: now,
    serverTime: now,
  });
}

export function publishPresence(
  tenantId: string,
  changedUserId: string | null,
  load: () => Promise<Snapshot> = () => presenceSnapshot(tenantId, changedUserId),
): Promise<void> {
  if (!subscribers.get(tenantId)?.size) return Promise.resolve();
  return new Promise((resolve) => {
    const elapsed = Date.now() - (lastSentAt.get(tenantId) || 0);
    const queued = pending.get(tenantId);
    if (queued) {
      queued.changedUserId = changedUserId || queued.changedUserId;
      queued.resolvers.push(resolve);
      return;
    }
    const finish = (promise: Promise<void>, done: Array<() => void>) => {
      void promise.catch(() => undefined).finally(() => done.forEach((resolveOne) => resolveOne()));
    };
    if (elapsed >= 1000) {
      finish(emit(tenantId, changedUserId, load), [resolve]);
      return;
    }
    const entry = {
      changedUserId: changedUserId || '',
      resolvers: [resolve],
      timer: setTimeout(() => {
        const current = pending.get(tenantId);
        pending.delete(tenantId);
        finish(emit(tenantId, current?.changedUserId || null, load), current?.resolvers || []);
      }, 1000 - elapsed),
    };
    pending.set(tenantId, entry);
  });
}

export function notifyTenantPresence(tenantId: string, changedUserId: string | null) {
  return publishPresence(tenantId, changedUserId).catch((error) => {
    console.error('Presence notify error', error instanceof Error ? error.name : 'error');
  });
}
