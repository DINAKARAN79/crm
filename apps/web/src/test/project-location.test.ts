import { describe, expect, it } from "vitest";
import {
  parseProjectLocationLink,
  projectLocationLabel,
} from "@/lib/project-location";

describe("parseProjectLocationLink", () => {
  it("extracts the place name and coordinates from a Google Maps place link", () => {
    expect(parseProjectLocationLink(
      "https://www.google.com/maps/place/Marina+Beach/@13.0500,80.2824,17z",
    )).toEqual({
      latitude: 13.05,
      longitude: 80.2824,
      locationName: "Marina Beach",
    });

  });

  it("shows the saved exact place name as the project location", () => {
    expect(projectLocationLabel({
      name: "Harbour View",
      address: "Marina Beach",
      city: "Chennai",
      state: "Tamil Nadu",
      latitude: 13.05,
      longitude: 80.2824,
    })).toBe("Marina Beach");
  });

  it("falls back to coordinates when a project has no saved address or city", () => {
    expect(projectLocationLabel({
      name: "Upcoming Project",
      latitude: 13.05,
      longitude: 80.2824,
    })).toBe("13.05, 80.2824");
  });

  it("extracts coordinates from a Google Maps search link", () => {
    expect(parseProjectLocationLink(
      "https://www.google.com/maps/search/?api=1&query=28.6139%2C77.2090",
    )).toEqual({ latitude: 28.6139, longitude: 77.209 });
  });

  it("uses a named search query as the location name", () => {
    expect(parseProjectLocationLink(
      "https://www.google.com/maps/search/?api=1&query=Connaught+Place",
    )).toEqual({ locationName: "Connaught Place" });
  });

  it("extracts coordinates embedded in a Google Maps place URL", () => {
    expect(parseProjectLocationLink(
      "https://www.google.com/maps/place/Marina+Beach/data=!4m2!3d13.05!4d80.2824",
    )).toEqual({
      latitude: 13.05,
      longitude: 80.2824,
      locationName: "Marina Beach",
    });
  });

  it("rejects invalid coordinates and non-Google URLs", () => {
    expect(parseProjectLocationLink(
      "https://www.google.com/maps/search/?api=1&query=91,181",
    )).toBeNull();
    expect(parseProjectLocationLink("https://example.com/maps/place/Test")).toBeNull();
  });
});
