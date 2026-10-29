interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function isNearColor(data: Uint8ClampedArray, index: number, color: readonly number[], tolerance: number) {
  return (
    Math.abs(data[index] - color[0]) <= tolerance &&
    Math.abs(data[index + 1] - color[1]) <= tolerance &&
    Math.abs(data[index + 2] - color[2]) <= tolerance
  );
}

export function replaceSolidBlueBackground(imageData: PixelData): boolean {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return false;

  const colors = new Map<string, { count: number; red: number; green: number; blue: number }>();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) continue;
    const key = `${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`;
    const color = colors.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    color.count += 1;
    color.red += data[index];
    color.green += data[index + 1];
    color.blue += data[index + 2];
    colors.set(key, color);
  }
  if (colors.size === 0) return false;
  const dominant = [...colors.values()].reduce((largest, color) => color.count > largest.count ? color : largest);
  const background = [
    dominant.red / dominant.count,
    dominant.green / dominant.count,
    dominant.blue / dominant.count,
  ];
  const tolerance = 32;
  const isBlue = background[2] >= 100 && background[2] - background[0] >= 45 && background[2] - background[1] >= 25;

  if (!isBlue) return false;
  let backgroundPixelCount = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (isNearColor(data, index, background, tolerance)) backgroundPixelCount += 1;
  }
  if (backgroundPixelCount < width * height * 0.3) return false;

  let changed = false;
  for (let index = 0; index < data.length; index += 4) {
    if (!isNearColor(data, index, background, tolerance)) continue;
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
    changed = true;
  }
  return changed;
}

export async function normalizeBlueLayoutImage(blob: Blob): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the project layout image.");

    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    if (!replaceSolidBlueBackground(imageData)) return blob;

    context.putImageData(imageData, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((normalizedBlob) => {
        if (normalizedBlob) resolve(normalizedBlob);
        else reject(new Error("Could not prepare the project layout image."));
      }, blob.type);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
