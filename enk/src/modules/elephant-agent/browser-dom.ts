import { execFileSync } from 'child_process';

const CHROMIUM_APPS = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Arc'];

type BrowserAppName = 'Safari' | 'Google Chrome' | 'Microsoft Edge' | 'Brave Browser' | 'Arc';

interface BrowserExecutionResult {
  ok: boolean;
  output: string | null;
  error?: string;
}

function isBrowserWithScriptSupport(appName: string | null): appName is BrowserAppName {
  if (!appName) return false;
  return appName === 'Safari' || CHROMIUM_APPS.includes(appName);
}

function escapeForAppleScript(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function executeAppleScript(script: string): BrowserExecutionResult {
  try {
    const raw = execFileSync('osascript', ['-e', script], {
      encoding: 'utf8',
      timeout: 1200
    }).trim();
    return { ok: true, output: raw || null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: null, error: message };
  }
}

function executeJavaScriptInFrontBrowser(appName: string | null, javascriptCode: string): BrowserExecutionResult {
  if (!isBrowserWithScriptSupport(appName)) {
    return { ok: false, output: null, error: `Unsupported app for browser JS execution: ${String(appName)}` };
  }

  const js = escapeForAppleScript(javascriptCode);

  let appleScript = '';
  if (appName === 'Safari') {
    appleScript = `tell application "Safari" to do JavaScript "${js}" in front document`;
  } else {
    appleScript = `tell application "${appName}" to execute active tab of front window javascript "${js}"`;
  }

  return executeAppleScript(appleScript);
}

export type { BrowserExecutionResult, BrowserAppName };
export { executeJavaScriptInFrontBrowser, isBrowserWithScriptSupport };
