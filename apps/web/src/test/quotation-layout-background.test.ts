import { describe, expect, it } from "vitest";
import { replaceSolidBlueBackground } from "@/lib/quotation-layout-background";

function pixels(colors: number[][], width: number, height: number) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(colors.flat()),
  };
}

describe("quotation layout background normalization", () => {
  it("replaces a uniform blue background while preserving unit colors and labels", () => {
    const imageData = pixels([
      [8, 96, 201, 255], [8, 96, 201, 255], [8, 96, 201, 255],
      [8, 96, 201, 255], [255, 0, 0, 255], [15, 20, 30, 255],
      [8, 96, 201, 255], [8, 96, 201, 255], [8, 96, 201, 255],
    ], 3, 3);

    expect(replaceSolidBlueBackground(imageData)).toBe(true);
    expect(Array.from(imageData.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(imageData.data.slice(4, 8))).toEqual([255, 255, 255, 255]);
    expect(Array.from(imageData.data.slice(16, 20))).toEqual([255, 0, 0, 255]);
    expect(Array.from(imageData.data.slice(20, 24))).toEqual([15, 20, 30, 255]);
  });

  it("leaves non-blue and non-uniform drawings unchanged", () => {
    const whiteDrawing = pixels([
      [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255],
    ], 2, 2);
    const multicolorDrawing = pixels([
      [8, 96, 201, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [8, 96, 201, 255], [255, 255, 255, 255],
    ], 3, 3);
    const originalWhite = Array.from(whiteDrawing.data);
    const originalMulticolor = Array.from(multicolorDrawing.data);

    expect(replaceSolidBlueBackground(whiteDrawing)).toBe(false);
    expect(replaceSolidBlueBackground(multicolorDrawing)).toBe(false);
    expect(Array.from(whiteDrawing.data)).toEqual(originalWhite);
    expect(Array.from(multicolorDrawing.data)).toEqual(originalMulticolor);
  });

  it("finds the blue background when white page margins cover the image corners", () => {
    const imageData = pixels([
      [255, 255, 255, 255], [6, 96, 201, 255], [6, 96, 201, 255],
      [6, 96, 201, 255], [255, 0, 0, 255], [6, 96, 201, 255],
      [6, 96, 201, 255], [6, 96, 201, 255], [255, 255, 255, 255],
    ], 3, 3);

    expect(replaceSolidBlueBackground(imageData)).toBe(true);
    expect(Array.from(imageData.data.slice(4, 8))).toEqual([255, 255, 255, 255]);
    expect(Array.from(imageData.data.slice(16, 20))).toEqual([255, 0, 0, 255]);
    expect(Array.from(imageData.data.slice(32, 36))).toEqual([255, 255, 255, 255]);
  });
});
