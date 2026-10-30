export const BIZCALL_DIALPAD_WINDOW_NAME = "bizcall-dialpad";

type DialpadLock = { ownerId?: string; heartbeatAt?: number } | null;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function isTrustedBizcallMessage(
  messageOrigin: string,
  messageSource: unknown,
  expectedOrigin: string,
  expectedWindow: unknown,
) {
  return messageOrigin === expectedOrigin && messageSource === expectedWindow;
}

export function readDialpadLock(storage: StorageLike, key: string): DialpadLock {
  try {
    return JSON.parse(storage.getItem(key) || "null") as DialpadLock;
  } catch {
    return null;
  }
}

export function isDialpadLockStale(lock: DialpadLock, now: number, staleAfterMs = 5000) {
  return !lock?.ownerId || !lock.heartbeatAt || now - lock.heartbeatAt > staleAfterMs;
}

export function claimDialpadLock(storage: StorageLike, key: string, ownerId: string, now: number, staleAfterMs = 5000) {
  const current = readDialpadLock(storage, key);
  if (current?.ownerId !== ownerId && !isDialpadLockStale(current, now, staleAfterMs)) return false;
  try {
    storage.setItem(key, JSON.stringify({ ownerId, heartbeatAt: now }));
    return readDialpadLock(storage, key)?.ownerId === ownerId;
  } catch {
    return false;
  }
}

export function buildBizcallDialpadUrl(url: string, userId: string, theme: "CRM" | "LIGHT" | "DARK") {
  const dialpadUrl = new URL(url);
  dialpadUrl.searchParams.set("userId", userId);
  dialpadUrl.searchParams.set("theme", theme.toLowerCase() === "crm" ? "light" : theme.toLowerCase());
  return dialpadUrl.toString();
}

export function openBizcallDialpad(
  url: string,
  userId: string,
  theme: "CRM" | "LIGHT" | "DARK",
  openWindow: (url: string, target: string) => unknown,
) {
  return openWindow(buildBizcallDialpadUrl(url, userId, theme), BIZCALL_DIALPAD_WINDOW_NAME);
}
