import { ProjectLocationError, reverseGeocodeProjectLocation } from "./googleMapsGeocoding";

export interface ResolvedProjectLocation {
  locationName: string;
  city: string | null;
  state: string | null;
}

export function projectMapUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export async function resolveProjectLocation(
  latitude: number,
  longitude: number,
): Promise<ResolvedProjectLocation> {
  const result = await reverseGeocodeProjectLocation(latitude, longitude);
  return {
    locationName: result.locationName,
    city: result.city,
    state: result.state,
  };
}

export interface ParsedMapUrl {
  latitude: number;
  longitude: number;
  resolvedUrl: string;
}

const MAX_REDIRECTS = 5;

function isAllowedMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "google.com" ||
    host.endsWith(".google.com") ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl";
}

function coordinatesFromUrl(value: string): [number, number] | undefined {
  const at = value.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const embedded = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const url = new URL(value);
  const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("ll");
  const queryCoordinates = query?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const match = at || embedded || queryCoordinates;
  if (!match) return undefined;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return undefined;
  return [latitude, longitude];
}

export function coordinatesFromStoredMapUrl(mapUrl: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!mapUrl) return null;
  try {
    const coordinates = coordinatesFromUrl(mapUrl);
    if (!coordinates) return null;
    return { latitude: coordinates[0], longitude: coordinates[1] };
  } catch {
    return null;
  }
}

export async function parseGoogleMapsUrl(input: string): Promise<ParsedMapUrl> {
  let current: URL;
  try {
    current = new URL(input);
  } catch {
    throw new ProjectLocationError("Enter a valid Google Maps URL.", 400);
  }
  if (current.protocol !== "https:" || !isAllowedMapsHost(current.hostname)) {
    throw new ProjectLocationError("Only HTTPS Google Maps links are supported.", 400);
  }

  for (let redirects = 0; redirects < MAX_REDIRECTS; redirects += 1) {
    if (!["maps.app.goo.gl", "goo.gl"].includes(current.hostname.toLowerCase())) break;
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) {
      throw new ProjectLocationError("Unable to resolve this short Google Maps link.", 422);
    }
    current = new URL(location, current);
    if (current.protocol !== "https:" || !isAllowedMapsHost(current.hostname)) {
      throw new ProjectLocationError("Google Maps short link redirected to an unsupported host.", 400);
    }
  }

  if (["maps.app.goo.gl", "goo.gl"].includes(current.hostname.toLowerCase())) {
    throw new ProjectLocationError("Google Maps short link redirected too many times.", 422);
  }

  const coordinates = coordinatesFromUrl(current.toString());
  if (!coordinates) {
    throw new ProjectLocationError("No valid latitude and longitude were found in that Google Maps URL.", 422);
  }
  return { latitude: coordinates[0], longitude: coordinates[1], resolvedUrl: current.toString() };
}

export async function resolveLocationForProjectWrite(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  previousAddress: string | null | undefined,
  previousCity: string | null | undefined,
  previousState: string | null | undefined,
): Promise<{
  address: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  mapUrl: string | null;
  warning?: string;
}> {
  if (latitude == null || longitude == null) {
    return { address: previousAddress, city: previousCity, state: previousState, mapUrl: null };
  }

  try {
    const location = await resolveProjectLocation(latitude, longitude);
    return {
      address: location.locationName,
      city: location.city || previousCity,
      state: location.state || previousState,
      mapUrl: projectMapUrl(latitude, longitude),
    };
  } catch (error) {
    if (!(error instanceof ProjectLocationError)) throw error;
    console.error("Project reverse geocoding failed:", error.message);
    return {
      address: previousAddress,
      city: previousCity,
      state: previousState,
      mapUrl: projectMapUrl(latitude, longitude),
      warning: `Coordinates saved, but the location name could not be refreshed: ${error.message}`,
    };
  }
}
