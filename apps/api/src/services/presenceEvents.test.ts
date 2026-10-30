import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishPresence, resetPresenceEvents, subscribePresence } from './presenceEvents';

describe('presence events', () => {
  afterEach(() => {
    resetPresenceEvents();
    vi.useRealTimers();
  });

  it('sends the first change immediately and the final state after the one-second throttle', async () => {
    vi.useFakeTimers();
    const events: Array<{ onlineCount: number; changedUserId: string | null }> = [];
    subscribePresence('tenant-1', (event) => events.push(event));
    let count = 3;
    const load = () => Promise.resolve({
      onlineCount: count,
      totalUsers: 10,
      isOnline: count > 0,
      version: String(count),
    });

    await publishPresence('tenant-1', 'user-a', load);
    count = 2;
    const trailing = publishPresence('tenant-1', 'user-b', load);
    await vi.advanceTimersByTimeAsync(1000);
    await trailing;

    expect(events.map((event) => event.onlineCount)).toEqual([3, 2]);
    expect(events[1].changedUserId).toBe('user-b');
  });

  it('does not deliver a company A event to a company B subscriber', async () => {
    const seen: string[] = [];
    subscribePresence('tenant-b', (event) => seen.push(event.changedUserId || ''));
    await publishPresence('tenant-a', 'user-a', async () => ({
      onlineCount: 1,
      totalUsers: 4,
      isOnline: true,
      version: '1',
    }));
    expect(seen).toEqual([]);
  });
});
