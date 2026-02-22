import { exec } from 'child_process';

import type { ActivityEntry, BrowserInfo, ContentSnapshot, WindowInfo } from '../../types';

interface ActiveWindowState {
  app: string;
  title: string;
  url: string | null;
  since: number;
}

interface PollActiveWindowDeps {
  currentWindow: ActiveWindowState;
  minDurationMs: number;
  contentSnapshots: ContentSnapshot[];
  activityLog: ActivityEntry[];
  extractEntitiesFromActivity: (appName: string, title: string, url: string | null, summary: string | null) => void;
}

const BROWSER_APPS: Record<string, string> = {
  'google chrome': 'Google Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  'brave browser': 'Brave Browser',
  arc: 'Arc',
  'microsoft edge': 'Microsoft Edge',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  chromium: 'Chromium',
};

function getActiveWindow(): Promise<WindowInfo> {
  return new Promise((resolve) => {
    const script = `
      tell application "System Events"
        set frontProc to first application process whose frontmost is true
        set appName to name of frontProc
        set winTitle to ""
        try
          set winTitle to name of first window of frontProc
        end try
      end tell
      return appName & "|||" & winTitle
    `;
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout) => {
      if (err) {
        resolve({ app: 'Unknown', title: '', url: null });
        return;
      }
      const parts = stdout.trim().split('|||');
      resolve({ app: (parts[0] || '').trim(), title: (parts[1] || '').trim(), url: null });
    });
  });
}

function getBrowserInfo(appName: string): Promise<BrowserInfo> {
  const normalized = appName.toLowerCase();
  const browserName = BROWSER_APPS[normalized];
  if (!browserName) return Promise.resolve({ url: null, tabTitle: null });

  return new Promise((resolve) => {
    let script: string;
    if (normalized === 'safari') {
      script =
        'tell application "Safari"\nset t to current tab of front window\nreturn (URL of t) & "|||" & (name of t)\nend tell';
    } else if (normalized === 'arc') {
      script =
        'tell application "Arc"\nset t to active tab of front window\nreturn (URL of t) & "|||" & (title of t)\nend tell';
    } else {
      script = `tell application "${browserName}"\nset t to active tab of front window\nreturn (URL of t) & "|||" & (title of t)\nend tell`;
    }

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 2000 }, (err, stdout) => {
      if (err) {
        resolve({ url: null, tabTitle: null });
        return;
      }
      const parts = stdout.trim().split('|||');
      resolve({ url: (parts[0] || '').trim() || null, tabTitle: (parts[1] || '').trim() || null });
    });
  });
}

function stripUrlFragment(url: string | null): string {
  if (!url) return '';
  try {
    return url.split('#')[0].split('?')[0].replace(/\/+$/, '');
  } catch {
    return url;
  }
}

async function pollActiveWindow(deps: PollActiveWindowDeps): Promise<ActiveWindowState> {
  try {
    const win = await getActiveWindow();
    const browser = await getBrowserInfo(win.app);
    if (browser.tabTitle) win.title = browser.tabTitle;
    win.url = browser.url;

    const appOrTitleChanged = win.app !== deps.currentWindow.app || win.title !== deps.currentWindow.title;
    const urlChanged =
      !!browser.url &&
      browser.url !== deps.currentWindow.url &&
      stripUrlFragment(browser.url) !== stripUrlFragment(deps.currentWindow.url);
    const changed = appOrTitleChanged || urlChanged;

    if (!changed) return deps.currentWindow;

    const now = Date.now();
    const duration = now - deps.currentWindow.since;

    if (duration >= deps.minDurationMs && deps.currentWindow.app) {
      const recentSummary =
        deps.contentSnapshots
          .filter((snapshot) => snapshot.timestamp >= deps.currentWindow.since && snapshot.summary)
          .map((snapshot) => snapshot.summary)
          .pop() || null;

      deps.activityLog.push({
        app: deps.currentWindow.app,
        title: deps.currentWindow.title,
        url: deps.currentWindow.url,
        start: deps.currentWindow.since,
        end: now,
        duration,
        summary: recentSummary,
      });
    }

    deps.extractEntitiesFromActivity(win.app, win.title, win.url, null);

    return { app: win.app, title: win.title, url: win.url, since: now };
  } catch {
    return deps.currentWindow;
  }
}

export { pollActiveWindow };
export type { ActiveWindowState };
