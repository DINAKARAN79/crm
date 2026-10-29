const unitInventoryUpdatedEvent = "dct-crm:unit-inventory-updated";
const unitInventoryUpdatedStorageKey = "dct-crm:unit-inventory-updated";

export function notifyUnitInventoryUpdated() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(unitInventoryUpdatedEvent));
  try {
    window.localStorage?.setItem(unitInventoryUpdatedStorageKey, `${Date.now()}-${Math.random()}`);
  } catch (error) {
    console.warn("Could not notify other tabs about the unit inventory update.", error);
  }
}

export function subscribeToUnitInventoryUpdates(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === unitInventoryUpdatedStorageKey) callback();
  };

  window.addEventListener(unitInventoryUpdatedEvent, callback);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", callback);

  return () => {
    window.removeEventListener(unitInventoryUpdatedEvent, callback);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", callback);
  };
}
