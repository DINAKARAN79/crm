import { afterEach, describe, expect, it, vi } from "vitest";
import { coordinatesFromStoredMapUrl, parseGoogleMapsUrl, projectMapUrl } from "./projectLocation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coordinatesFromStoredMapUrl", () => {
  it("reads coordinates already saved on a project map link", () => {
    expect(coordinatesFromStoredMapUrl("https://www.google.com/maps?q=28.4595,77.0266")).toEqual({
      latitude: 28.4595,
      longitude: 77.0266,
    });
    expect(coordinatesFromStoredMapUrl(null)).toBeNull();
    expect(coordinatesFromStoredMapUrl("not a url")).toBeNull();
  });
});

describe("parseGoogleMapsUrl", () => {
  it.each([
    ["https://www.google.com/maps/@28.4595,77.0266,15z", 28.4595, 77.0266],
    ["https://www.google.com/maps/place/Test/data=!3d28.4595!4d77.0266", 28.4595, 77.0266],
    ["https://www.google.com/maps?q=28.4595%2C77.0266", 28.4595, 77.0266],
  ])("parses coordinates from %s", async (url, latitude, longitude) => {
    await expect(parseGoogleMapsUrl(url)).resolves.toMatchObject({ latitude, longitude });
  });

  it("resolves a Google Maps short link on the server before parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://www.google.com/maps/@28.4595,77.0266,15z" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(parseGoogleMapsUrl("https://maps.app.goo.gl/example")).resolves.toMatchObject({
      latitude: 28.4595,
      longitude: 77.0266,
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
  });

  it("rejects unsupported hosts and out-of-range coordinates", async () => {
    await expect(parseGoogleMapsUrl("https://example.com/@28.4,77.0")).rejects.toMatchObject({ statusCode: 400 });
    await expect(parseGoogleMapsUrl("https://google.com/maps?q=91,181")).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("projectMapUrl", () => {
  it("creates the canonical Google Maps query URL", () => {
    expect(projectMapUrl(28.4595, 77.0266)).toBe("https://www.google.com/maps?q=28.4595,77.0266");
  });
});