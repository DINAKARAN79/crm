const siteVisitListUpdatedEvent = "dct-crm:site-visit-list-updated";
const siteVisitListUpdatedStorageKey = "dct-crm:site-visit-list-updated";

export function notifySiteVisitListUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(siteVisitListUpdatedEvent));
  try {
    window.localStorage?.setItem(siteVisitListUpdatedStorageKey, `${Date.now()}-${Math.random()}`);
  } catch (error) {
    console.warn("Could not notify other tabs about the site visit list update.", error);
  }
}

export function subscribeToSiteVisitListUpdates(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === siteVisitListUpdatedStorageKey) callback();
  };

  window.addEventListener(siteVisitListUpdatedEvent, callback);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(siteVisitListUpdatedEvent, callback);
    window.removeEventListener("storage", handleStorage);
  };
}
