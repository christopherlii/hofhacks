import type { OcrResult } from '../types';

interface TesseractWorker {
  recognize: (image: Buffer) => Promise<{ data: { text: string; confidence: number } }>;
}

let tesseractWorker: TesseractWorker | null = null;

let ocrLock: Promise<void> = Promise.resolve();

async function initTesseract(): Promise<void> {
  const Tesseract = require('tesseract.js') as {
    createWorker: (lang: string) => Promise<TesseractWorker>;
  };
  tesseractWorker = await Tesseract.createWorker('eng');
  console.log('[Enk] Tesseract worker initialized');
}

async function runOCR(pngBuffer: Buffer): Promise<OcrResult> {
  let release: (() => void) | undefined;
  const acquire = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = ocrLock;
  ocrLock = acquire;
  await prev;

  try {
    if (!tesseractWorker) await initTesseract();
    const result = await tesseractWorker!.recognize(pngBuffer);
    return {
      text: result.data.text,
      confidence: result.data.confidence
    };
  } finally {
    if (release) release();
  }
}

export { initTesseract, runOCR };
