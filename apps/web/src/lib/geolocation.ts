export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type GeolocationPermissionState = "granted" | "prompt" | "denied";

const MAX_LOCATION_ACCURACY_METERS = 500;
const LOCATION_SAMPLE_TIMEOUT_MS = 20_000;

export class GeolocationError extends Error {
  reason: "denied" | "unavailable" | "timeout" | "inaccurate" | "insecure";

  constructor(message: string, reason: GeolocationError["reason"] = "inaccurate") {
    super(message);
    this.name = "GeolocationError";
    this.reason = reason;
  }
}

const toGeolocationError = (error: GeolocationPositionError): GeolocationError => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError('Location permission was denied. Allow location access to complete the site visit.');
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError('Your location could not be determined. Please try again.');
    case error.TIMEOUT:
      return new GeolocationError('Location request timed out. Please try again.');
    default:
      return new GeolocationError('Unable to read your location. Please try again.');
  }
};

export async function getGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "prompt";

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return permission.state;
  } catch {
    return "prompt";
  }
}

export function getLocationSettingsInstructions(userAgent: string): string {
  const agent = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(agent)) {
    return "On iPhone or iPad, open Settings > Privacy & Security > Location Services. Turn on Location Services and allow your browser to access location. Then return here and retry.";
  }
  if (agent.includes("edg/")) {
    return "In Microsoft Edge, select the site controls icon beside the address, open Permissions for this site, set Location to Allow, then return here and retry.";
  }
  if (agent.includes("firefox/")) {
    return "In Firefox, select the permissions icon beside the address and allow Location for this site. If needed, open Settings > Privacy & Security > Permissions > Location and review this site's permission.";
  }
  if (agent.includes("chrome/") || agent.includes("chromium/")) {
    return "In Chrome, select the site controls icon beside the address, open Site settings, set Location to Allow, then return here and retry.";
  }
  if (agent.includes("safari/")) {
    return "In Safari on Mac, open Safari > Settings > Websites > Location and allow this site. Also check System Settings > Privacy & Security > Location Services.";
  }
  return "Open this site's permissions from the browser controls beside the address, set Location to Allow, and make sure Location Services are enabled for your device and browser.";
}

export const GRE_LOCATION_DENIED = "Please allow location access to complete the site visit.";
export const GRE_LOCATION_UNAVAILABLE = "Your location could not be determined. Turn on Location Services, then retry.";
export const GRE_LOCATION_TIMEOUT = "Location request timed out. Please retry.";
export const GRE_LOCATION_INACCURATE = "GPS accuracy is insufficient. Please move to an area with a better GPS signal and try again.";
export const GRE_LOCATION_REASON = "Location access is required to verify that you are at the selected project site before submitting GRE.";
export const GRE_MAX_GPS_ACCURACY_METERS = 500;

function readFreshPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: LOCATION_SAMPLE_TIMEOUT_MS,
    });
  });
}

function usableGreReading(position: GeolocationPosition) {
  const { coords, timestamp } = position;
  const usable = Number.isFinite(coords.latitude) && coords.latitude >= -90 && coords.latitude <= 90
    && Number.isFinite(coords.longitude) && coords.longitude >= -180 && coords.longitude <= 180
    && Number.isFinite(coords.accuracy) && coords.accuracy > 0
    && coords.accuracy <= GRE_MAX_GPS_ACCURACY_METERS;
  if (!usable) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    capturedAt: new Date(timestamp).toISOString(),
  };
}

export async function captureGreCompletionLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new GeolocationError("Location requires HTTPS or localhost. Open the CRM using a secure URL.", "insecure");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GeolocationError(GRE_LOCATION_DENIED, "denied");
  }

  let sawUnusableReading = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const reading = usableGreReading(await readFreshPosition());
      if (reading) return reading;
      sawUnusableReading = true;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 1) throw new GeolocationError(GRE_LOCATION_DENIED, "denied");
      if (code === 2) throw new GeolocationError(GRE_LOCATION_UNAVAILABLE, "unavailable");
      if (code === 3) throw new GeolocationError(GRE_LOCATION_TIMEOUT, "timeout");
      if (attempt === 1) throw new GeolocationError(GRE_LOCATION_INACCURATE, "inaccurate");
    }
  }
  if (sawUnusableReading) throw new GeolocationError(GRE_LOCATION_INACCURATE, "inaccurate");
  throw new GeolocationError(GRE_LOCATION_INACCURATE, "inaccurate");
}

export function getCurrentCoordinates(): Promise<Coordinates> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(new Error("Location requires HTTPS or localhost. Open the CRM using a secure URL."));
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error('Your browser does not support location verification.'));
  }

  return getGeolocationPermission().then((permission) => {
    if (permission === "denied") {
      const error = new Error("Location access is blocked. Set this site's Location permission to Allow in your browser settings, then try again.") as Error & { code?: number };
      error.code = 1;
      throw error;
    }

    return requestCurrentCoordinates();
  });
}

function requestCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    const fail = (message: string, code?: number) => {
      const locationError = new Error(message) as Error & { code?: number };
      locationError.code = code;
      reject(locationError);
    };

    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        fail("Location access is blocked. Open this site's information beside the address bar, set Location to Allow, then try again.", error.code);
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        fail("Your device could not provide a location. Turn on Location Services and allow this site to access your location, then try again.", error.code);
      } else if (error.code === error.TIMEOUT) {
        fail("Getting your current location timed out. Check Location Services and try again.", error.code);
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          const reading: Coordinates = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp,
          };
          if (!Number.isFinite(reading.latitude) || reading.latitude < -90 || reading.latitude > 90 ||
              !Number.isFinite(reading.longitude) || reading.longitude < -180 || reading.longitude > 180 ||
              !Number.isFinite(reading.accuracy) || reading.accuracy <= 0) {
            fail("Your device returned invalid GPS coordinates. Try again.");
            return;
          }
          if (reading.accuracy > MAX_LOCATION_ACCURACY_METERS) {
            fail(`GPS accuracy must be ${MAX_LOCATION_ACCURACY_METERS} meters or better. Move outdoors, enable precise location, and try again.`);
            return;
          }
          resolve(reading);
        },
        onError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATION_SAMPLE_TIMEOUT_MS },
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Unable to read your current location.');
    }
  });
}