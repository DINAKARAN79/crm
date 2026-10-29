import { describe, expect, it } from 'vitest';
import {
  checkSiteVisitLocation,
  GRE_LOCATION_MESSAGES,
  SITE_VISIT_GEOFENCE_RADIUS_METERS,
  verifyGreSubmissionLocation,
} from './siteVisitLocation';

describe('checkSiteVisitLocation', () => {
  it.each([
    ['DCT Paradise', 13.003789, 80.262671],
    ['DCT Heights', 13.0294519, 80.1952235],
  ])('allows an exact match at %s', (projectName, latitude, longitude) => {
    expect(checkSiteVisitLocation(projectName, latitude, longitude, 100, latitude, longitude, 10)).toEqual({
      allowed: true,
      distanceMeters: 0,
      radiusMeters: 100,
    });
  });

  it('allows coordinates within 100 meters', () => {
    const check = checkSiteVisitLocation('DCT Paradise', 13.003789, 80.262671, 100, 13.004, 80.262671, 10);

    expect(check.allowed).toBe(true);
    if (check.allowed) {
      expect(check.distanceMeters).toBeLessThanOrEqual(SITE_VISIT_GEOFENCE_RADIUS_METERS);
    }
  });

  it('rejects coordinates outside the 100-meter radius', () => {
    expect(checkSiteVisitLocation('DCT Paradise', 13.003789, 80.262671, 100, 13.005, 80.262671, 10)).toEqual({
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      error: 'You are currently 135 meters from DCT Paradise. You must be within 100 meters to complete this Site Visit.',
      distanceMeters: expect.any(Number),
      radiusMeters: 100,
    });
  });

  it('rejects a valid location when it belongs to the other project', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.003789, 80.262671, 10)).toMatchObject({
      allowed: false,
      code: 'OUTSIDE_RADIUS',
      radiusMeters: 100,
    });
  });

  it('rejects projects without a configured location', () => {
    expect(checkSiteVisitLocation('Other Project', null, null, 100, 13.003789, 80.262671, 10)).toEqual({
      allowed: false,
      code: 'LOCATION_NOT_CONFIGURED',
      error: 'Location coordinates are not configured for Other Project.',
      radiusMeters: 100,
    });
  });

  it('allows an on-site reading with typical reduced GPS accuracy', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.0294519, 80.1952235, 150)).toEqual({
      allowed: true,
      distanceMeters: 0,
      radiusMeters: 100,
    });
  });

  it('rejects GPS accuracy greater than 500 meters', () => {
    expect(checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 100, 13.0294519, 80.1952235, 501)).toMatchObject({
      allowed: false,
      code: 'INACCURATE',
      radiusMeters: 100,
    });
  });

  it('uses the project allowed radius', () => {
    const check = checkSiteVisitLocation('DCT Heights', 13.0294519, 80.1952235, 200, 13.031, 80.1952235, 10);
    expect(check.allowed).toBe(true);
    if (check.allowed) expect(check.radiusMeters).toBe(200);
  });
});

describe('verifyGreSubmissionLocation', () => {
  const now = new Date('2026-10-16T08:40:00.000Z');
  const reading = {
    accuracyMeters: 10,
    capturedAt: new Date('2026-10-16T08:39:30.000Z'),
    now,
  };

  it('accepts a fresh reading inside the linked project radius', () => {
    const check = verifyGreSubmissionLocation({
      projectLatitude: 13.003789,
      projectLongitude: 80.262671,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
    });
    expect(check).toMatchObject({ ok: true, radiusMeters: 100, distanceMeters: 0 });
  });

  it('checks an upcoming project against that project’s own saved coordinates', () => {
    const upcoming = { projectLatitude: 28.4595, projectLongitude: 77.0266, radiusMeters: 150 };
    expect(verifyGreSubmissionLocation({
      ...upcoming,
      latitude: 28.4595,
      longitude: 77.0266,
      ...reading,
    })).toMatchObject({ ok: true, radiusMeters: 150, distanceMeters: 0 });
    const elsewhere = verifyGreSubmissionLocation({
      ...upcoming,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
    });
    expect(elsewhere).toMatchObject({ ok: false, code: 'OUTSIDE', radiusMeters: 150 });
  });

  it('uses the other project coordinates and rejects a reading from the first project', () => {
    const check = verifyGreSubmissionLocation({
      projectLatitude: 13.0294519,
      projectLongitude: 80.1952235,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
    });
    expect(check).toMatchObject({ ok: false, code: 'OUTSIDE', error: GRE_LOCATION_MESSAGES.outside, radiusMeters: 100 });
    if (!check.ok && check.distanceMeters != null) expect(check.distanceMeters).toBeGreaterThan(1000);
  });

  it('rejects a reading outside the permitted radius', () => {
    expect(verifyGreSubmissionLocation({
      projectLatitude: 13.003789,
      projectLongitude: 80.262671,
      radiusMeters: 100,
      latitude: 13.005,
      longitude: 80.262671,
      ...reading,
    })).toMatchObject({ ok: false, code: 'OUTSIDE', error: GRE_LOCATION_MESSAGES.outside });
  });

  it('allows a reading inside the project radius when browser accuracy is coarser than 30 metres', () => {
    const check = verifyGreSubmissionLocation({
      projectLatitude: 13.003789,
      projectLongitude: 80.262671,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
      accuracyMeters: 65,
    });
    expect(check).toMatchObject({ ok: true, radiusMeters: 100 });
  });

  it('rejects missing or invalid project coordinates', () => {
    expect(verifyGreSubmissionLocation({
      projectLatitude: null,
      projectLongitude: null,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
    })).toEqual({ ok: false, code: 'MISSING_PROJECT', error: GRE_LOCATION_MESSAGES.missing });
  });

  it('rejects poor accuracy and stale readings', () => {
    expect(verifyGreSubmissionLocation({
      projectLatitude: 13.003789,
      projectLongitude: 80.262671,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
      accuracyMeters: 501,
    })).toMatchObject({ ok: false, code: 'INACCURATE' });
    expect(verifyGreSubmissionLocation({
      projectLatitude: 13.003789,
      projectLongitude: 80.262671,
      radiusMeters: 100,
      latitude: 13.003789,
      longitude: 80.262671,
      ...reading,
      capturedAt: new Date('2026-10-16T08:30:00.000Z'),
    })).toMatchObject({ ok: false, code: 'INACCURATE' });
  });

  it('uses the project allowed radius instead of a fixed 100 metres', () => {
    const check = verifyGreSubmissionLocation({
      projectLatitude: 13.0294519,
      projectLongitude: 80.1952235,
      radiusMeters: 250,
      latitude: 13.031,
      longitude: 80.1952235,
      ...reading,
    });
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.radiusMeters).toBe(250);
  });
});
