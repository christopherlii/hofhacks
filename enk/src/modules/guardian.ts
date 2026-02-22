import { captureAllScreens, hasScreenChanged } from './capture';
import { runOCR } from './ocr';
import { scrubSensitiveData, textSimilarity } from './scrub';
import { analyzeWithClaude } from './claude';
import type { GuardianResult, NowContext, OcrResult } from '../types';

interface GuardianInitOptions {
  statusUpdate: (status: string) => void;
  showAlert: (result: GuardianResult) => void;
  dismissAlert: () => void;
  apiKey: () => string;
  enabled: () => boolean;
  nowContext?: () => NowContext;
}

const previousTexts: Record<string, string> = {};

let activeThreat = false;
let analysisTimer: NodeJS.Timeout | null = null;
let isAnalyzing = false;

let onStatusUpdate: (status: string) => void = () => {};
let onShowAlert: (result: GuardianResult) => void = () => {};
let onDismissAlert: () => void = () => {};
let getApiKey: () => string = () => '';
let getEnabled: () => boolean = () => false;
let getNowContext: (() => NowContext) | null = null;

function init({ statusUpdate, showAlert, dismissAlert, apiKey, enabled, nowContext }: GuardianInitOptions): void {
  onStatusUpdate = statusUpdate;
  onShowAlert = showAlert;
  onDismissAlert = dismissAlert;
  getApiKey = apiKey;
  getEnabled = enabled;
  if (nowContext) getNowContext = nowContext;
}

async function analyzeLoop(): Promise<void> {
  if (!getEnabled() || !getApiKey()) {
    onStatusUpdate('inactive');
    return;
  }

  if (isAnalyzing) return;
  isAnalyzing = true;

  try {
    const screens = await captureAllScreens();
    if (screens.length === 0) {
      isAnalyzing = false;
      return;
    }

    const changedScreens = screens.filter((s) => hasScreenChanged(s.id, s.nativeImage));

    if (changedScreens.length === 0) {
      isAnalyzing = false;
      return;
    }

    onStatusUpdate('processing');

    let threatFound = false;
    for (const screenCapture of changedScreens) {
      const pngBuffer = screenCapture.nativeImage.toPNG();

      let ocr: OcrResult | undefined;
      if (getNowContext) {
        const ctx = getNowContext();
        if (ctx && ctx.visibleText && ctx.timestamp && Date.now() - ctx.timestamp < 3000) {
          ocr = { text: ctx.visibleText, confidence: ctx.ocrConfidence || 80 };
          console.log(`[Enk] Guardian using fresh NowContext OCR for "${screenCapture.name}"`);
        }
      }

      if (!ocr) {
        console.log(`[Enk] Screen "${screenCapture.name}" changed, running OCR...`);
        ocr = await runOCR(pngBuffer);
        console.log(
          `[Enk] OCR done (${screenCapture.name}). Confidence: ${ocr.confidence.toFixed(1)}%, text length: ${ocr.text.length}`
        );
      }

      const lowConfidence = ocr.confidence < 70;
      const scrubbedText = scrubSensitiveData(ocr.text);

      if (!lowConfidence && scrubbedText.trim().length < 20) {
        console.log(`[Enk] Too little text on "${screenCapture.name}", skipping`);
        continue;
      }

      const prevText = previousTexts[screenCapture.id];
      const similarity = textSimilarity(scrubbedText, prevText);

      if (similarity > 0.85 && activeThreat) {
        console.log('[Enk] Text unchanged, threat still active — keeping alert');
        threatFound = true;
        continue;
      }

      if (similarity > 0.85) {
        console.log(`[Enk] Text ${(similarity * 100).toFixed(0)}% similar to last send, skipping API call`);
        continue;
      }
      previousTexts[screenCapture.id] = scrubbedText;

      const base64Data = pngBuffer.toString('base64');
      console.log(`[Enk] Sending "${screenCapture.name}" to Claude...`);
      const result = await analyzeWithClaude(getApiKey(), scrubbedText, base64Data, lowConfidence);
      console.log(`[Enk] Result (${screenCapture.name}):`, JSON.stringify(result));

      if (result && result.flagged) {
        threatFound = true;
        onShowAlert(result);
      }
    }

    if (threatFound) {
      activeThreat = true;
      onStatusUpdate('threat');
    } else {
      if (activeThreat) {
        console.log('[Enk] Threat cleared — dismissing alert');
        onDismissAlert();
      }
      activeThreat = false;
      onStatusUpdate('active');
    }
  } catch (err) {
    console.error('[Enk] Analysis error:', err);
    onStatusUpdate('active');
  }

  isAnalyzing = false;
}

function startMonitoring(): void {
  if (analysisTimer) return;
  if (!getApiKey() || !getEnabled()) return;
  console.log('[Enk] Starting monitoring loop (5s interval)');
  onStatusUpdate('active');
  void analyzeLoop();
  analysisTimer = setInterval(analyzeLoop, 5000);
}

function stopMonitoring(): void {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
  onStatusUpdate('inactive');
  console.log('[Enk] Monitoring stopped');
}

export { init, startMonitoring, stopMonitoring };
