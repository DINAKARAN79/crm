export interface ParsedProjectLocationLink {
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

export interface ProjectLocationDetails {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function projectLocationLabel(project: ProjectLocationDetails): string {
  const address = project.address?.trim();
  if (address) return address;
  const cityAndState = [project.city, project.state].filter(Boolean).join(", ");
  if (cityAndState) return cityAndState;
  if (project.latitude != null && project.longitude != null) {
    return `${project.latitude}, ${project.longitude}`;
  }
  return "Location not set";
}

function decodeLocationName(value: string): string | undefined {
  let name: string;
  try {
    name = decodeURIComponent(value.replace(/\+/g, " "))
      .replace(/,\s*$/, "")
      .trim();
  } catch {
    return undefined;
  }
  if (!name || /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(name)) return undefined;
  return name;
}

function coordinatesFrom(value: string | null): [number, number] | undefined {
  if (!value) return undefined;
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return undefined;
  return [latitude, longitude];
}

export function parseProjectLocationLink(value: string): ParsedProjectLocationLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" ||
      !(host === "google.com" || host.endsWith(".google.com") ||
        host === "maps.app.goo.gl" || host === "goo.gl")) return null;

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
  const locationName = placeMatch
    ? decodeLocationName(placeMatch[1])
    : decodeLocationName(
      url.searchParams.get("query") ||
      url.searchParams.get("q") ||
      url.searchParams.get("destination") ||
      "",
    );
  const embeddedCoordinates = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const coordinates =
    coordinatesFrom(url.pathname.match(/@(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/)?.[1] || null) ||
    coordinatesFrom(url.searchParams.get("query")) ||
    coordinatesFrom(url.searchParams.get("q")) ||
    coordinatesFrom(url.searchParams.get("ll")) ||
    coordinatesFrom(url.searchParams.get("destination")) ||
    (embeddedCoordinates
      ? coordinatesFrom(`${embeddedCoordinates[1]},${embeddedCoordinates[2]}`)
      : undefined);

  if (!locationName && !coordinates) return null;
  return {
    ...(coordinates ? { latitude: coordinates[0], longitude: coordinates[1] } : {}),
    ...(locationName ? { locationName } : {}),
  };
}
