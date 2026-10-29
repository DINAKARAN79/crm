import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reverseGeocodeProjectLocation,
} from "./googleMapsGeocoding";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reverseGeocodeProjectLocation", () => {
  it("reports upstream lookup failures without requiring a browser-visible key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(reverseGeocodeProjectLocation(13.05, 80.2824)).rejects.toMatchObject({
      name: "ProjectLocationError",
      statusCode: 502,
    });
  });

  it("returns locality, city, state, and formatted address from Nominatim", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("lat")).toBe("13.05");
      expect(url.searchParams.get("lon")).toBe("80.2824");
      expect(init?.headers).toMatchObject({
        "User-Agent": expect.stringContaining("DCT-CRM/1.0"),
      });
      return new Response(JSON.stringify({
        display_name: "Marina Beach, Chennai, Tamil Nadu, India",
        address: { suburb: "Marina Beach", city: "Chennai", state: "Tamil Nadu" },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(reverseGeocodeProjectLocation(13.05, 80.2824)).resolves.toEqual({
      formattedAddress: "Marina Beach, Chennai, Tamil Nadu, India",
      locationName: "Marina Beach, Chennai",
      city: "Chennai",
      state: "Tamil Nadu",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("skips ward numbers and uses the place inside a municipal zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      display_name: "Kodambakkam, Chennai, Tamil Nadu, India",
      address: {
        neighbourhood: "Ward 137",
        suburb: "Zone 10 Kodambakkam",
        city: "Chennai",
        state: "Tamil Nadu",
      },
    }), { status: 200 })));
    await expect(reverseGeocodeProjectLocation(13.0294519, 80.1952235)).resolves.toMatchObject({
      locationName: "Kodambakkam, Chennai",
      city: "Chennai",
      state: "Tamil Nadu",
    });
  });

  it("prefers a neighbourhood over an administrative zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      display_name: "Venkateswara Nagar, Chennai, Tamil Nadu, India",
      address: {
        neighbourhood: "Venkateswara Nagar",
        suburb: "Zone 13 Adyar",
        city: "Chennai",
        state: "Tamil Nadu",
      },
    }), { status: 200 })));
    await expect(reverseGeocodeProjectLocation(13.003789, 80.262671)).resolves.toMatchObject({
      locationName: "Venkateswara Nagar, Chennai",
    });
  });

  it("uses a state name when locality and city are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      display_name: "Tamil Nadu, India",
      address: { state: "Tamil Nadu" },
    }), { status: 200 })));
    await expect(reverseGeocodeProjectLocation(13.05, 80.2824)).resolves.toMatchObject({
      locationName: "Tamil Nadu",
      city: null,
      state: "Tamil Nadu",
    });
  });
});
