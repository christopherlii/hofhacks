import { execSync } from 'child_process';
import { captureAllScreens } from './capture';
import { runOCR } from './ocr';
import { scrubSensitiveData } from './scrub';
import type { NowContext } from '../types';

interface ActiveAppInfo {
  app: string | null;
  title: string | null;
  url: string | null;
}

const contextBuffer: NowContext[] = [];
const BUFFER_MAX_AGE_MS = 90000;

let currentContext: NowContext = {
  activeApp: null,
  windowTitle: null,
  url: null,
  visibleText: null,
  ocrConfidence: 0,
  timestamp: 0
};

let updateTimer: NodeJS.Timeout | null = null;

function getActiveAppInfo(): ActiveAppInfo {
  if (process.platform !== 'darwin') return { app: null, title: null, url: null };

  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        set windowTitle to ""
        try
          set windowTitle to name of front window of (first application process whose frontmost is true)
        end try
      end tell
      return frontApp & "|||" & windowTitle
    `;
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 500,
      encoding: 'utf8'
    }).trim();

    const parts = result.split('|||');
    const appName = parts[0] || null;
    const windowTitle = parts[1] || null;

    let url: string | null = null;
    if (['Safari', 'Google Chrome', 'Firefox', 'Arc', 'Microsoft Edge', 'Brave Browser'].includes(appName || '')) {
      try {
        let urlScript: string | null;
        if (appName === 'Safari') {
          urlScript = 'tell application "Safari" to return URL of front document';
        } else if (appName === 'Firefox') {
          urlScript = null;
        } else {
          urlScript = `tell application "${appName}" to return URL of active tab of front window`;
        }
        if (urlScript) {
          url = execSync(`osascript -e '${urlScript.replace(/'/g, "'\\''")}'`, {
            timeout: 500,
            encoding: 'utf8'
          }).trim();
        }
      } catch {
        // URL extraction is best-effort.
      }
    }

    return { app: appName, title: windowTitle, url };
  } catch {
    return { app: null, title: null, url: null };
  }
}

async function updateContext(): Promise<void> {
  try {
    const appInfo = getActiveAppInfo();

    const screens = await captureAllScreens();
    let visibleText = '';
    let ocrConfidence = 0;

    if (screens.length > 0) {
      const pngBuffer = screens[0].nativeImage.toPNG();
      const ocr = await runOCR(pngBuffer);
      visibleText = scrubSensitiveData(ocr.text);
      ocrConfidence = ocr.confidence;
    }

    currentContext = {
      activeApp: appInfo.app,
      windowTitle: appInfo.title,
      url: appInfo.url,
      visibleText,
      ocrConfidence,
      timestamp: Date.now()
    };

    contextBuffer.push({ ...currentContext });

    const cutoff = Date.now() - BUFFER_MAX_AGE_MS;
    while (contextBuffer.length > 0 && contextBuffer[0].timestamp < cutoff) {
      contextBuffer.shift();
    }

    console.log(`[Enk] NowContext updated: ${appInfo.app} — "${(appInfo.title || '').slice(0, 50)}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Enk] NowContext update failed:', message);
  }
}

function getCurrentContext(): NowContext {
  return { ...currentContext };
}

function getContextBuffer(): NowContext[] {
  return [...contextBuffer];
}

function startUpdating(intervalMs = 2000): void {
  if (updateTimer) return;
  console.log(`[Enk] Starting NowContext updates (${intervalMs}ms interval)`);
  void updateContext();
  updateTimer = setInterval(updateContext, intervalMs);
}

function stopUpdating(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

export { getCurrentContext, getContextBuffer, startUpdating, stopUpdating };
