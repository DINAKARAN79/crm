import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@dct-crm/db';

vi.mock('@dct-crm/db', () => ({
  prisma: {
    rRQueue: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    rRQueueMember: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    rRQueueHistory: { createMany: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    sequence: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', tenantId: 'tenant-1', isAdmin: true, isSuperAdmin: false };
    req.tenantId = 'tenant-1';
    next();
  },
}));

import rrQueuesRouter from './rrQueues';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

beforeEach(() => { vi.clearAllMocks(); });

async function request(method: string, path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/rrqueues', rrQueuesRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('RRQueue API validation', () => {
  it('rejects an empty queue name', async () => {
    const response = await request('POST', '/api/rrqueues', { name: '' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Complete this field.' });
  });

  it('requires a project when creating a queue', async () => {
    const response = await request('POST', '/api/rrqueues', { name: 'Missing project' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Select an active project in this tenant.' });
  });

  it('rejects a missing member user', async () => {
    const response = await request('POST', '/api/rrqueues/queue-1/members', {});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'User is required.' });
  });

  it('requires a functional user type for a member', async () => {
    const response = await request('POST', '/api/rrqueues/queue-1/members', { userId: 'user-1' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Select a user type.' });
  });

  it('creates a queue with lead count and previous member ID', async () => {
    vi.mocked(prisma.rRQueue.create).mockResolvedValue({ id: 'queue-1', leadCount: 3, previousId: 2 } as any);
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: 'project-1' } as any);

    const response = await request('POST', '/api/rrqueues', {
      name: 'New Queue',
      projectId: 'project-1',
      leadStatus: ['NEW'],
      projectInterested: ['project-1'],
      excludeFromNoSource: ['WEBSITE'],
      ownerId: 'owner-1',
      leadCount: 3,
      previousId: 2,
    });

    expect(response.status).toBe(201);
    expect(prisma.rRQueue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        leadCount: 3,
        previousId: 2,
        projectInterested: ['project-1'],
        excludeFromNoSource: ['WEBSITE'],
        ownerId: 'owner-1',
        projectId: 'project-1',
      }),
    }));
  });

  it('updates queue lead count and previous member ID', async () => {
    const existing = {
      id: 'queue-1',
      name: 'Queue',
      leadCount: 3,
      previousId: 2,
      projectId: null,
      active: true,
      project: null,
      owner: null,
    };
    const updated = { ...existing, leadCount: 4 };
    const update = vi.fn().mockResolvedValue(updated);
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueue: { findFirst: vi.fn().mockResolvedValue(existing), update },
      rRQueueHistory: { createMany: history },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1', { leadCount: 4, previousId: 2 });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'queue-1' },
      data: { leadCount: 4, previousId: 2, updatedById: 'admin-1' },
    }));
    expect(history).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        rrQueueId: 'queue-1',
        field: 'Lead Count',
        originalValue: '3',
        newValue: '4',
        userName: 'Admin User',
      })],
    });
  });

  it('ignores the removed external user ID on member updates', async () => {
    const member = { id: 'member-1', name: 'UID-4328', rrQueueId: 'queue-1', tenantId: 'tenant-1', userId: 'user-1', userType: 'Sales', activeMember: true, user: { id: 'user-1', firstName: 'Sneha', lastName: 'S' } };
    const updateMember = vi.fn().mockResolvedValue(member);
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue(member), update: updateMember },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1/members/member-1', { userIdNumber: '1' });

    expect(response.status).toBe(200);
    expect(updateMember).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
  });

  it('updates the member user lookup', async () => {
    const member = { id: 'member-1', name: 'UID-4328', rrQueueId: 'queue-1', tenantId: 'tenant-1', userId: 'user-1', userType: 'Sales', activeMember: true, user: { id: 'user-1', firstName: 'Sneha', lastName: 'S' } };
    const updateMember = vi.fn().mockResolvedValue({ ...member, userId: 'user-2' });
    const history = vi.fn();
    const findUser = vi.fn().mockResolvedValueOnce({ id: 'user-2', firstName: 'New', lastName: 'User' }).mockResolvedValueOnce({ firstName: 'Admin', lastName: 'User' });
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue(member), update: updateMember },
      user: { findFirst: findUser },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1/members/member-1', { userId: 'user-2' });

    expect(response.status).toBe(200);
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'user-2',
        tenantId: 'tenant-1',
        isActive: true,
        profile: { name: { in: ['Sales', 'Sales Executive'] } },
      },
    }));
    expect(updateMember).toHaveBeenCalledWith(expect.objectContaining({
      data: { userId: 'user-2' },
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ field: 'UID-4328 - User', originalValue: 'Sneha S', newValue: 'New User' })] }));
  });

  it('updates eligible-user counts and history when availability changes', async () => {
    const member = {
      id: 'member-1',
      name: 'UID-0001',
      rrQueueId: 'queue-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      userType: 'Sales',
      activeMember: true,
      isAvailable: true,
      isWorking: true,
      weekOff: false,
      user: { id: 'user-1', firstName: 'Sales', lastName: 'User', isActive: true },
    };
    const updateMember = vi.fn().mockResolvedValue({ ...member, isAvailable: false });
    const updateQueue = vi.fn();
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue(member), update: updateMember },
      rRQueue: { update: updateQueue },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1/members/member-1', { isAvailable: false });

    expect(response.status).toBe(200);
    expect(updateQueue).toHaveBeenCalledWith({
      where: { id: 'queue-1' },
      data: { noOfUsers: { increment: -1 } },
    });
    expect(history).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        field: 'UID-0001 - Available',
        originalValue: 'Yes',
        newValue: 'No',
      })],
    }));
  });

  it('creates a member without an external user ID', async () => {
    const createdMember = {
      id: 'member-1',
      name: 'UID-0001',
      user: { id: 'user-1', firstName: 'Sneha', lastName: 'S', email: 'sneha@example.com', isActive: true },
      activeMember: true,
      isAvailable: true,
      isWorking: true,
      weekOff: false,
    };
    const transaction = {
      rRQueue: { findFirst: vi.fn().mockResolvedValue({ id: 'queue-1' }), update: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      rRQueueMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdMember),
      },
      sequence: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ nextValue: 2 }) },
      rRQueueHistory: { createMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback(transaction)) as any);

    const response = await request('POST', '/api/rrqueues/queue-1/members', { userId: 'user-1', userType: 'Sales' });

    expect(response.status).toBe(201);
    expect(transaction.rRQueueMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'UID-0001', userId: 'user-1' }),
    }));
    expect(transaction.rRQueueMember.findFirst).toHaveBeenCalledWith({
      where: { rrQueueId: 'queue-1', userId: 'user-1', userType: 'Sales' },
    });
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { name: 'UID-0001' } });
  });

  it('ignores the removed external user ID when creating a member', async () => {
    const createdMember = {
      id: 'member-1',
      name: 'UID-0001',
      user: { id: 'user-1', firstName: 'Sneha', lastName: 'S', email: 'sneha@example.com', isActive: true },
      activeMember: true,
    };
    const transaction = {
      rRQueue: { findFirst: vi.fn().mockResolvedValue({ id: 'queue-1' }), update: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1', profile: { name: 'Sales Executive' } }) },
      rRQueueMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdMember),
      },
      sequence: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ nextValue: 2 }) },
      rRQueueHistory: { createMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback(transaction)) as any);

    const response = await request('POST', '/api/rrqueues/queue-1/members', { userId: 'user-1', userType: 'Sales', userIdNumber: '1' });

    expect(response.status).toBe(201);
    expect(transaction.rRQueueMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ userIdNumber: expect.anything() }),
    }));
    expect(transaction.rRQueueMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'UID-0001', userId: 'user-1' }),
    }));
    expect(transaction.rRQueueHistory.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ field: 'Created.', newValue: 'UID-0001 (Sneha S)' })],
    }));
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { name: 'UID-0001' } });
  });

  it('permanently deletes an active member and updates the queue count', async () => {
    const member = {
      id: 'member-1',
      rrQueueId: 'queue-1',
      tenantId: 'tenant-1',
      activeMember: true,
      isAvailable: true,
      isWorking: true,
      weekOff: false,
      user: { isActive: true },
    };
    const deleteMember = vi.fn().mockResolvedValue(member);
    const updateQueue = vi.fn().mockResolvedValue({});
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue({ ...member, name: 'UID-4328', user: { firstName: 'Sneha', lastName: 'S', isActive: true } }), delete: deleteMember },
      rRQueue: { update: updateQueue },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('DELETE', '/api/rrqueues/queue-1/members/member-1');

    expect(response.status).toBe(200);
    expect(deleteMember).toHaveBeenCalledWith({ where: { id: 'member-1' } });
    expect(updateQueue).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'queue-1' },
      data: { noOfUsers: { decrement: 1 } },
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ field: 'Deleted.', originalValue: 'UID-4328 (Sneha S)' })] }));
  });
});