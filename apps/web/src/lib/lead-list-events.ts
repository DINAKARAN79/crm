const leadListUpdatedEvent = "dct-crm:lead-list-updated";
const leadListUpdatedStorageKey = "dct-crm:lead-list-updated";

export function notifyLeadListUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(leadListUpdatedEvent));
  try {
    window.localStorage?.setItem(leadListUpdatedStorageKey, `${Date.now()}-${Math.random()}`);
  } catch (error) {
    console.warn("Could not notify other tabs about the lead list update.", error);
  }
}

export function subscribeToLeadListUpdates(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === leadListUpdatedStorageKey) callback();
  };

  window.addEventListener(leadListUpdatedEvent, callback);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(leadListUpdatedEvent, callback);
    window.removeEventListener("storage", handleStorage);
  };
}
