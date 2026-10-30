import { describe, expect, it, vi } from "vitest";
import {
  BIZCALL_DIALPAD_WINDOW_NAME,
  buildBizcallDialpadUrl,
  claimDialpadLock,
  isDialpadLockStale,
  isTrustedBizcallMessage,
  openBizcallDialpad,
} from "./bizcall-dialpad";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("Bizcall dialpad browser helpers", () => {
  it("expires a closed tab's heartbeat after five seconds and lets another tab take over", () => {
    const storage = memoryStorage();
    storage.setItem("lock", JSON.stringify({ ownerId: "closed-tab", heartbeatAt: 1000 }));

    expect(isDialpadLockStale({ ownerId: "closed-tab", heartbeatAt: 1000 }, 6000)).toBe(false);
    expect(claimDialpadLock(storage, "lock", "other-tab", 6001)).toBe(true);
    expect(JSON.parse(storage.getItem("lock") || "{}")).toMatchObject({ ownerId: "other-tab", heartbeatAt: 6001 });
  });

  it("does not claim a fresh heartbeat until the owner releases it", () => {
    const storage = memoryStorage();
    storage.setItem("lock", JSON.stringify({ ownerId: "current-tab", heartbeatAt: 1000 }));
    expect(claimDialpadLock(storage, "lock", "other-tab", 2000)).toBe(false);
    expect(JSON.parse(storage.getItem("lock") || "{}").ownerId).toBe("current-tab");
  });

  it("builds the same named dialpad tab URL with the CRM user and theme", () => {
    const openWindow = vi.fn();
    const url = "https://bizcall.cxteletech.com/embed/dialpad?existing=value";
    openBizcallDialpad(url, "crm-user-42", "DARK", openWindow);
    openBizcallDialpad(url, "crm-user-42", "DARK", openWindow);

    expect(openWindow).toHaveBeenCalledTimes(2);
    expect(openWindow).toHaveBeenNthCalledWith(
      1,
      "https://bizcall.cxteletech.com/embed/dialpad?existing=value&userId=crm-user-42&theme=dark",
      BIZCALL_DIALPAD_WINDOW_NAME,
    );
    expect(openWindow.mock.calls[0][1]).toBe(openWindow.mock.calls[1][1]);
  });

  it("serializes CRM theme as light and includes the required user id", () => {
    const result = new URL(buildBizcallDialpadUrl(
      "https://bizcall.cxteletech.com/embed/dialpad",
      "crm-user-7",
      "CRM",
    ));
    expect(result.searchParams.get("userId")).toBe("crm-user-7");
    expect(result.searchParams.get("theme")).toBe("light");
  });

  it("rejects messages from other origins or other windows", () => {
    const dialpadWindow = {};
    expect(isTrustedBizcallMessage("https://bizcall.cxteletech.com", dialpadWindow, "https://bizcall.cxteletech.com", dialpadWindow)).toBe(true);
    expect(isTrustedBizcallMessage("https://attacker.example", dialpadWindow, "https://bizcall.cxteletech.com", dialpadWindow)).toBe(false);
    expect(isTrustedBizcallMessage("https://bizcall.cxteletech.com", {}, "https://bizcall.cxteletech.com", dialpadWindow)).toBe(false);
  });
});
