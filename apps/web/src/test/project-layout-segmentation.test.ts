import { describe, expect, it } from "vitest";
import { clientToNormalizedPoint, detectGreenRegions } from "@/lib/project-layout-segmentation";

function greenImage(width: number, height: number, regions: Array<{ x: number; y: number; width: number; height: number }>) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  regions.forEach((region) => {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 20;
        pixels[offset + 1] = 180;
        pixels[offset + 2] = 40;
        pixels[offset + 3] = 255;
      }
    }
  });
  return pixels;
}

describe("project layout green-region detection", () => {
  it("extracts independent normalized boundaries for separate green units", () => {
    const regions = detectGreenRegions(greenImage(100, 80, [
      { x: 10, y: 12, width: 20, height: 18 },
      { x: 60, y: 40, width: 25, height: 20 },
    ]), 100, 80);

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.points)).toEqual([
      [{ x: 0.1, y: 0.15 }, { x: 0.3, y: 0.15 }, { x: 0.3, y: 0.375 }, { x: 0.1, y: 0.375 }],
      [{ x: 0.6, y: 0.5 }, { x: 0.85, y: 0.5 }, { x: 0.85, y: 0.75 }, { x: 0.6, y: 0.75 }],
    ]);
  });

  it("ignores small green noise and rejects mismatched pixel data", () => {
    const pixels = greenImage(20, 20, [
      { x: 1, y: 1, width: 3, height: 3 },
      { x: 8, y: 8, width: 7, height: 7 },
    ]);
    expect(detectGreenRegions(pixels, 20, 20, 20)).toHaveLength(1);
    expect(() => detectGreenRegions(new Uint8ClampedArray(4), 20, 20)).toThrow(/does not match/);
  });

  it("excludes white circles and narrow green artifacts while preserving distinct green units", () => {
    const pixels = greenImage(100, 80, [
      { x: 10, y: 10, width: 20, height: 18 },
      { x: 60, y: 40, width: 25, height: 20 },
      { x: 40, y: 5, width: 2, height: 2 },
    ]);
    for (let y = 8; y < 18; y += 1) {
      for (let x = 80; x < 90; x += 1) {
        const offset = (y * 100 + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
      }
    }

    const regions = detectGreenRegions(pixels, 100, 80, 4);
    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.points[0])).toEqual([
      { x: 0.1, y: 0.125 },
      { x: 0.6, y: 0.5 },
    ]);
  });

  it("scales client coordinates to the original drawing coordinate system after zoom and scroll", () => {
    expect(clientToNormalizedPoint(590, 400, {
      left: 140,
      top: 100,
      width: 900,
      height: 600,
    })).toEqual({ x: 0.5, y: 0.5 });
    expect(clientToNormalizedPoint(50, 40, {
      left: 140,
      top: 100,
      width: 900,
      height: 600,
    })).toEqual({ x: 0, y: 0 });
    expect(clientToNormalizedPoint(50, 40, {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })).toEqual({ x: 0, y: 0 });
  });
});
