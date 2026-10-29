import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureGreCompletionLocation, getCurrentCoordinates, getLocationSettingsInstructions, GRE_LOCATION_DENIED, GRE_LOCATION_INACCURATE, GRE_LOCATION_UNAVAILABLE } from "@/lib/geolocation";

describe("getCurrentCoordinates", () => {
  let getCurrentPosition = vi.fn();
  let permissionQuery = vi.fn();

  beforeEach(() => {
    let nextLatitude = 13.05;
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    getCurrentPosition = vi.fn();
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      const latitude = nextLatitude;
      nextLatitude += 0.01;
      window.setTimeout(() => success({
        coords: {
          latitude,
          longitude: 80.2824,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition), 0);
    });
    permissionQuery = vi.fn().mockResolvedValue({ state: "granted" });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: permissionQuery },
    });
  });

  it("requests a fresh high-accuracy reading for each completion attempt", async () => {
    const first = await getCurrentCoordinates();
    const second = await getCurrentCoordinates();

    expect(first.latitude).toBe(13.05);
    expect(second.latitude).toBe(13.06);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  });

  it("does not request a position when permission is denied", async () => {
    permissionQuery.mockResolvedValue({ state: "denied" });

    await expect(getCurrentCoordinates()).rejects.toThrow(/Location access is blocked/);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("explains secure-context requirements before requesting location", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });

    await expect(getCurrentCoordinates()).rejects.toThrow(/HTTPS or localhost/);
    expect(permissionQuery).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("uses the browser's permission prompt when permission is undecided", async () => {
    permissionQuery.mockResolvedValue({ state: "prompt" });

    const coordinates = await getCurrentCoordinates();

    expect(coordinates.latitude).toBe(13.05);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("falls back to normal geolocation when the Permissions API is unavailable", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: undefined,
    });

    const coordinates = await getCurrentCoordinates();

    expect(coordinates.latitude).toBe(13.05);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("asks for location when system location is off or the site permission looks denied", async () => {
    permissionQuery.mockResolvedValue({ state: "denied" });

    const reading = await captureGreCompletionLocation();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
    expect(reading.latitude).toBe(13.05);
  });

  it("shows the allow-location message only after the browser declines the request", async () => {
    getCurrentPosition.mockImplementation((_success: PositionCallback, failure: PositionErrorCallback) => {
      window.setTimeout(() => failure({
        code: 2,
        message: "Position unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError), 0);
    });

    await expect(captureGreCompletionLocation()).rejects.toThrow(GRE_LOCATION_UNAVAILABLE);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("accepts a fresh on-site reading when accuracy is coarser than 30 metres", async () => {
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      window.setTimeout(() => success({
        coords: {
          latitude: 13.003789,
          longitude: 80.262671,
          accuracy: 65,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition), 0);
    });
    const reading = await captureGreCompletionLocation();
    expect(reading).toMatchObject({ latitude: 13.003789, longitude: 80.262671, accuracy: 65 });
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it("requests one fresh reading before reporting genuinely poor GPS accuracy", async () => {
    let attempt = 0;
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      attempt += 1;
      const accuracy = attempt === 1 ? 800 : 40;
      window.setTimeout(() => success({
        coords: {
          latitude: 13.003789,
          longitude: 80.262671,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition), 0);
    });
    const reading = await captureGreCompletionLocation();
    expect(reading.accuracy).toBe(40);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("provides browser-specific location settings guidance", () => {
    expect(getLocationSettingsInstructions("Mozilla/5.0 Chrome/130.0"))
      .toContain("In Chrome");
    expect(getLocationSettingsInstructions("Mozilla/5.0 Edg/130.0"))
      .toContain("In Microsoft Edge");
    expect(getLocationSettingsInstructions("Mozilla/5.0 Firefox/130.0"))
      .toContain("In Firefox");
  });
});