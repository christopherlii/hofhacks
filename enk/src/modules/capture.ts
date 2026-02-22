import { desktopCapturer, type NativeImage } from 'electron';
import type { ScreenCapture } from '../types';

const previousScreens: Record<string, Buffer> = {};

function hasScreenChanged(screenId: string, nativeImage: NativeImage): boolean {
  const bmp = nativeImage.toBitmap();
  const size = nativeImage.getSize();
  const totalPixels = size.width * size.height;

  const sampleCount = 500;
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));
  const samples = Buffer.alloc(sampleCount * 3);

  for (let i = 0; i < sampleCount; i++) {
    const pixelIndex = i * step;
    const byteOffset = pixelIndex * 4;
    if (byteOffset + 2 < bmp.length) {
      samples[i * 3] = bmp[byteOffset];
      samples[i * 3 + 1] = bmp[byteOffset + 1];
      samples[i * 3 + 2] = bmp[byteOffset + 2];
    }
  }

  const prev = previousScreens[screenId];
  previousScreens[screenId] = samples;

  if (!prev) return true;

  let diffCount = 0;
  for (let i = 0; i < sampleCount * 3; i += 3) {
    const dr = Math.abs(samples[i] - prev[i]);
    const dg = Math.abs(samples[i + 1] - prev[i + 1]);
    const db = Math.abs(samples[i + 2] - prev[i + 2]);
    if (dr + dg + db > 30) diffCount++;
  }

  const diffPercent = (diffCount / sampleCount) * 100;
  return diffPercent > 25;
}

async function captureAllScreens(): Promise<ScreenCapture[]> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 960, height: 540 }
    });
    if (sources.length === 0) return [];
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      nativeImage: source.thumbnail
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] Screen capture failed:', message);
    return [];
  }
}

export { captureAllScreens, hasScreenChanged, previousScreens };
