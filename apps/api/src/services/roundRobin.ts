import { prisma } from '@dct-crm/db';
import { Prisma } from '@prisma/client';
import { getCRMDayBounds } from '@dct-crm/shared';

export interface RoundRobinResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  poolType?: string;
  isFallback?: boolean;
  profileName?: string;
  /** Actual RoundRobinConfig name (e.g. "Presales Lead Assignment"), when configured. */
  roundRobinName?: string;
}

/** Display label for the Round Robin configuration used for an assignment. */
export function roundRobinLabel(user: RoundRobinResult | null, poolType: string): string {
  return user?.roundRobinName || `${poolType} Round Robin`;
}

type TxClient = Prisma.TransactionClient | typeof prisma;

async function getConfiguredMembers(
  tenantId: string,
  poolType: string,
  tx: TxClient,
): Promise<RoundRobinResult[]> {
  const config = await tx.roundRobinConfig.findUnique({
    where: { tenantId_poolType: { tenantId, poolType } },
    select: { isActive: true, profileName: true, name: true },
  });
  if (!config || !config.isActive) return [];

  const members = await tx.roundRobinMember.findMany({
    where: {
      tenantId,
      poolType,
      isActive: true,
      user: {
        isActive: true,
        isSuperAdmin: false,
        profile: { name: config.profileName },
      },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return members.map((member) => ({
    id: member.user.id,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    email: member.user.email,
    poolType,
    profileName: config.profileName,
    roundRobinName: config.name,
  }));
}

async function getAssignmentCounts(
  users: RoundRobinResult[],
  tenantId: string,
  poolType: string,
  tx: TxClient,
) {
  const bounds = getCRMDayBounds();
  const histories = await tx.leadOwnerHistory.groupBy({
    by: ['newOwnerId'],
    where: {
      tenantId,
      newOwnerId: { in: users.map((user) => user.id) },
      startDate: { gte: bounds.start, lt: bounds.end },
      handoffReason: { startsWith: `Round Robin assignment — ${poolType}` },
    },
    _count: { _all: true },
  });
  const counts = new Map(users.map((user) => [user.id, 0]));
  for (const history of histories) {
    if (history.newOwnerId) counts.set(history.newOwnerId, history._count._all);
  }
  return counts;
}

async function pickBalancedWithClient(
  users: RoundRobinResult[],
  tenantId: string,
  poolType: string,
  queueType: string,
  tx: TxClient,
): Promise<RoundRobinResult> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${queueType}`}, 0))`,
  );
  const queue = await tx.queue.findFirst({
    where: { tenantId, type: queueType },
  });
  const counts = await getAssignmentCounts(users, tenantId, poolType, tx);
  const lowest = Math.min(...users.map((user) => counts.get(user.id) || 0));
  const candidates = new Set(
    users.filter((user) => (counts.get(user.id) || 0) === lowest).map((user) => user.id),
  );

  let lastIndex = -1;
  if (queue?.description != null) {
    const parsed = Number.parseInt(queue.description, 10);
    if (!Number.isNaN(parsed)) lastIndex = parsed;
  }
  let selectedIndex = users.findIndex((user, index) =>
    candidates.has(user.id) && index > lastIndex,
  );
  if (selectedIndex < 0) {
    selectedIndex = users.findIndex((user) => candidates.has(user.id));
  }
  const selected = users[selectedIndex];

  if (!queue) {
    await tx.queue.create({
      data: {
        tenantId,
        name: `${queueType.replace(/_/g, ' ')} Queue`,
        type: queueType,
        isActive: true,
        description: String(selectedIndex),
      },
    });
    return selected;
  }

  const updated = await tx.queue.updateMany({
    where: {
      id: queue.id,
      description: queue.description,
    },
    data: { description: String(selectedIndex) },
  });
  if (updated.count === 0) throw new Error('RR_CURSOR_CONFLICT');
  return selected;
}

export async function getAdminFallback(
  tenantId: string,
  poolType: string,
  tx: TxClient,
): Promise<RoundRobinResult | null> {
  const admins = await tx.user.findMany({
    where: {
      tenantId,
      isActive: true,
      isSuperAdmin: false,
      profile: { isAdmin: true },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (admins.length === 0) return null;
  const selected = await pickBalancedWithClient(
    admins.map((admin) => ({ ...admin, poolType })),
    tenantId,
    `ADMIN_FALLBACK_${poolType}`,
    `ADMIN_FALLBACK_${poolType}_CURSOR`,
    tx,
  );
  return { ...selected, isFallback: true, profileName: 'Admin' };
}

async function pickNextUser(
  tenantId: string,
  poolType: string,
  tx?: TxClient,
): Promise<RoundRobinResult | null> {
  const client = tx || prisma;
  const users = await getConfiguredMembers(tenantId, poolType, client);
  if (users.length === 0) return getAdminFallback(tenantId, poolType, client);
  return pickBalancedWithClient(users, tenantId, poolType, `${poolType}_ROUND_ROBIN`, client);
}

export function roundRobinHandoffReason(poolType: string, isFallback = false): string {
  return isFallback
    ? `Round Robin fallback — no eligible members (${poolType})`
    : `Round Robin assignment — ${poolType}`;
}

export async function getNextSVCUser(tenantId: string, tx?: TxClient): Promise<RoundRobinResult | null> {
  return pickNextUser(tenantId, 'SVC', tx);
}

export async function getNextSalesUser(tenantId: string, tx?: TxClient): Promise<RoundRobinResult | null> {
  return pickNextUser(tenantId, 'SALES', tx);
}

export async function getNextPresalesUser(tenantId: string, tx?: TxClient): Promise<RoundRobinResult | null> {
  return pickNextUser(tenantId, 'PRESALES', tx);
}

export async function getNextCRMUser(tenantId: string, tx?: TxClient): Promise<RoundRobinResult | null> {
  return pickNextUser(tenantId, 'CRM', tx);
}

export async function getNextUserByPool(
  tenantId: string,
  poolType: string,
  tx?: TxClient,
): Promise<RoundRobinResult | null> {
  return pickNextUser(tenantId, poolType, tx);
}
