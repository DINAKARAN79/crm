export interface GeocodedProjectLocation {
  formattedAddress: string;
  locationName: string;
  city: string | null;
  state: string | null;
}

export class ProjectLocationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProjectLocationError";
  }
}

interface NominatimResponse {
  display_name?: string;
  address?: Record<string, string | undefined>;
}

function readablePlace(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^ward\s+\d+[a-z]?$/i.test(trimmed)) return undefined;
  const zone = trimmed.match(/^zone\s+\d+[a-z]?\s+(.+)$/i);
  if (zone?.[1]?.trim()) return zone[1].trim();
  if (/^zone\s+\d+[a-z]?$/i.test(trimmed)) return undefined;
  return trimmed;
}

function localityName(address: Record<string, string | undefined>): string | undefined {
  const candidates = [
    address.neighbourhood,
    address.quarter,
    address.residential,
    address.hamlet,
    address.suburb,
    address.city_district,
    address.borough,
  ];
  for (const candidate of candidates) {
    const place = readablePlace(candidate);
    if (place) return place;
  }
  return undefined;
}

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

async function fetchNominatim(url: URL): Promise<Response> {
  const request = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1_000;
    return fetch(url, {
      headers: {
        "User-Agent": `DCT-CRM/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL || "project-location-service"})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(10_000),
    });
  });
  requestQueue = request.then(() => undefined, () => undefined);
  return request;
}

export async function reverseGeocodeProjectLocation(
  latitude: number,
  longitude: number,
): Promise<GeocodedProjectLocation> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");

  let response: Response;
  try {
    response = await fetchNominatim(url);
  } catch (error) {
    throw new ProjectLocationError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Location lookup timed out. Try again."
        : "Unable to reach the location lookup service. Try again.",
      502,
    );
  }
  if (!response.ok) {
    throw new ProjectLocationError("Location lookup service returned an error. Try again.", 502);
  }

  let result: NominatimResponse;
  try {
    result = await response.json() as NominatimResponse;
  } catch {
    throw new ProjectLocationError("Location lookup returned an invalid response.", 502);
  }

  const address = result.address || {};
  const locality = localityName(address);
  const city = address.city || address.town || address.village || address.municipality || null;
  const state = address.state || null;
  const locationName = locality && city && locality.toLowerCase() !== city.toLowerCase()
    ? `${locality}, ${city}`
    : locality || city || state || result.display_name;

  if (!locationName) {
    throw new ProjectLocationError("No named location was found for these coordinates.", 404);
  }
  return {
    formattedAddress: result.display_name || locationName,
    locationName,
    city,
    state,
  };
}
