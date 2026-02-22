import { desktopCapturer, screen, type NativeImage } from 'electron';

import type { OcrResult, ScreenCapture } from '../../types';

class ScreenChangeTracker {
  private readonly previousScreens: Record<string, Buffer> = {};

  hasScreenChanged(screenId: string, nativeImage: NativeImage): boolean {
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

    const prev = this.previousScreens[screenId];
    this.previousScreens[screenId] = samples;
    if (!prev) return true;

    let diffCount = 0;
    for (let i = 0; i < sampleCount * 3; i += 3) {
      const dr = Math.abs(samples[i] - prev[i]);
      const dg = Math.abs(samples[i + 1] - prev[i + 1]);
      const db = Math.abs(samples[i + 2] - prev[i + 2]);
      if (dr + dg + db > 30) diffCount++;
    }

    return (diffCount / sampleCount) * 100 > 25;
  }
}

class OcrEngine {
  private worker: any = null;

  async init(): Promise<void> {
    const Tesseract = require('tesseract.js');
    this.worker = await Tesseract.createWorker('eng');
    await this.worker.setParameters({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
    });
    console.log('[Enk] Tesseract worker initialized (PSM 3, preserve spaces)');
  }

  async run(pngBuffer: Buffer): Promise<OcrResult> {
    if (!this.worker) await this.init();
    const result = await this.worker.recognize(pngBuffer);
    return { text: result.data.text, confidence: result.data.confidence };
  }
}

function extractNewContent(prevText: string, newText: string): string {
  if (!prevText) return newText;

  const prevLines = new Set(prevText.split('\n').map((line) => line.trim()).filter(Boolean));
  const newLines = newText.split('\n').map((line) => line.trim()).filter(Boolean);
  const diff = newLines.filter((line) => !prevLines.has(line));

  return diff.length > 0 ? diff.join('\n') : newText.slice(0, 500);
}

async function captureAllScreens(): Promise<ScreenCapture[]> {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    return sources
      .filter((source) => source.thumbnail && !source.thumbnail.isEmpty())
      .map((source) => ({ id: source.id, name: source.name, nativeImage: source.thumbnail }));
  } catch (err: any) {
    console.error('[Enk] Screen capture failed:', err.message);
    return [];
  }
}

export { captureAllScreens, extractNewContent, OcrEngine, ScreenChangeTracker };
