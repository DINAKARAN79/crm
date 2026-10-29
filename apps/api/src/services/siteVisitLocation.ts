export const SITE_VISIT_GEOFENCE_RADIUS_METERS = 100;
export const MAX_SITE_VISIT_GPS_ACCURACY_METERS = 500;
export const GRE_MAX_GPS_ACCURACY_METERS = MAX_SITE_VISIT_GPS_ACCURACY_METERS;
export const GRE_LOCATION_MAX_AGE_MS = 120_000;

export const GRE_LOCATION_MESSAGES = {
  verified: 'Project location verified successfully. Site visit completed.',
  outside: "You cannot complete this site visit because you are outside the project's permitted location.",
  missing: 'Project location is missing. Please contact your administrator.',
  denied: 'Please allow location access to complete the site visit.',
  inaccurate: 'GPS accuracy is insufficient. Please move to an area with a better GPS signal and try again.',
} as const;

export type SiteVisitLocationCheck =
  | { allowed: true; distanceMeters: number; radiusMeters: number }
  | {
      allowed: false;
      code: 'LOCATION_NOT_CONFIGURED' | 'INACCURATE' | 'OUTSIDE_RADIUS';
      error: string;
      distanceMeters?: number;
      radiusMeters: number;
    };

export function readStoredCoordinate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function"
    ? (value as { toNumber: () => number }).toNumber()
    : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function distanceInMeters(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number,
): number {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(targetLatitude - latitude);
  const longitudeDelta = radians(targetLongitude - longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(targetLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

export function checkSiteVisitLocation(
  projectName: string | null | undefined,
  projectLatitude: number | null | undefined,
  projectLongitude: number | null | undefined,
  radiusMeters: number | null | undefined,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
): SiteVisitLocationCheck {
  const allowedRadius = radiusMeters ?? SITE_VISIT_GEOFENCE_RADIUS_METERS;

  if (projectLatitude == null || projectLongitude == null) {
    return {
      allowed: false,
      code: 'LOCATION_NOT_CONFIGURED',
      error: `Location coordinates are not configured for ${projectName || 'this project'}.`,
      radiusMeters: allowedRadius,
    };
  }

  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > MAX_SITE_VISIT_GPS_ACCURACY_METERS) {
    return {
      allowed: false,
      code: 'INACCURATE',
      error: `Your GPS location is not accurate enough (accuracy must be ${MAX_SITE_VISIT_GPS_ACCURACY_METERS} meters or better). Move outdoors or enable precise location, then try again.`,
      radiusMeters: allowedRadius,
    };
  }

  const distanceMeters = distanceInMeters(
    latitude,
    longitude,
    projectLatitude,
    projectLongitude,
  );

  if (distanceMeters > allowedRadius) {
    return {
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      error: `You are currently ${Math.round(distanceMeters)} meters from ${projectName || 'the project'}. You must be within ${allowedRadius} meters to complete this Site Visit.`,
      distanceMeters,
      radiusMeters: allowedRadius,
    };
  }

  return { allowed: true, distanceMeters, radiusMeters: allowedRadius };
}

export type GreLocationResult =
  | { ok: true; distanceMeters: number; radiusMeters: number }
  | { ok: false; code: 'MISSING_PROJECT' | 'INACCURATE' | 'OUTSIDE'; error: string; distanceMeters?: number; radiusMeters?: number };

export function verifyGreSubmissionLocation(input: {
  projectLatitude: number | null | undefined;
  projectLongitude: number | null | undefined;
  radiusMeters: number | null | undefined;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date;
  now?: Date;
  maxAccuracyMeters?: number;
  maxAgeMs?: number;
}): GreLocationResult {
  const radius = input.radiusMeters != null && input.radiusMeters > 0
    ? input.radiusMeters
    : SITE_VISIT_GEOFENCE_RADIUS_METERS;
  const projectLatitude = input.projectLatitude == null ? null : Number(input.projectLatitude);
  const projectLongitude = input.projectLongitude == null ? null : Number(input.projectLongitude);
  const coordinatesAreValid = projectLatitude != null
    && projectLongitude != null
    && Number.isFinite(projectLatitude)
    && Number.isFinite(projectLongitude)
    && projectLatitude >= -90
    && projectLatitude <= 90
    && projectLongitude >= -180
    && projectLongitude <= 180;
  if (!coordinatesAreValid) {
    return { ok: false, code: 'MISSING_PROJECT', error: GRE_LOCATION_MESSAGES.missing };
  }

  const maxAccuracy = input.maxAccuracyMeters ?? GRE_MAX_GPS_ACCURACY_METERS;
  const maxAgeMs = input.maxAgeMs ?? GRE_LOCATION_MAX_AGE_MS;
  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.capturedAt.getTime();
  const readingIsFresh = Number.isFinite(input.capturedAt.getTime()) && ageMs <= maxAgeMs && ageMs >= -30_000;
  const readingIsPositioned = Number.isFinite(input.latitude)
    && input.latitude >= -90
    && input.latitude <= 90
    && Number.isFinite(input.longitude)
    && input.longitude >= -180
    && input.longitude <= 180
    && Number.isFinite(input.accuracyMeters)
    && input.accuracyMeters > 0
    && input.accuracyMeters <= maxAccuracy;
  if (!readingIsFresh || !readingIsPositioned) {
    return { ok: false, code: 'INACCURATE', error: GRE_LOCATION_MESSAGES.inaccurate };
  }

  const distanceMeters = distanceInMeters(
    input.latitude,
    input.longitude,
    projectLatitude as number,
    projectLongitude as number,
  );
  if (distanceMeters > radius) {
    return { ok: false, code: 'OUTSIDE', error: GRE_LOCATION_MESSAGES.outside, distanceMeters, radiusMeters: radius };
  }
  return { ok: true, distanceMeters, radiusMeters: radius };
}